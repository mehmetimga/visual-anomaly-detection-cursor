import io
import os
import time
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
import open_clip
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from prometheus_client import Counter, Histogram, generate_latest
from pydantic import BaseModel

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "ViT-B-32")
MODEL_DEVICE = os.getenv("MODEL_DEVICE", "cpu")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "16"))

# Global variables for model
model = None
preprocess = None
tokenizer = None

# Metrics
embed_image_counter = Counter("embed_image_requests_total", "Total number of image embedding requests")
embed_text_counter = Counter("embed_text_requests_total", "Total number of text embedding requests")
embed_duration = Histogram("embed_duration_seconds", "Embedding generation duration in seconds", ["type"])


class TextEmbedRequest(BaseModel):
    text: str


class TextBatchEmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embedding: List[float]
    model_name: str
    model_version: str


class BatchEmbedResponse(BaseModel):
    embeddings: List[List[float]]
    model_name: str
    model_version: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global model, preprocess, tokenizer
    
    print(f"Loading model {MODEL_NAME} on {MODEL_DEVICE}...")
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, 
        pretrained='openai',
        device=MODEL_DEVICE
    )
    model.eval()
    
    tokenizer = open_clip.get_tokenizer(MODEL_NAME)
    
    print("Model loaded successfully")
    
    yield
    
    # Shutdown
    print("Shutting down...")


app = FastAPI(title="Visual Anomaly Embedding Service", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "model": MODEL_NAME, "device": MODEL_DEVICE}


@app.get("/readyz")
async def ready_check():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "ready", "model": MODEL_NAME}


@app.get("/metrics")
async def metrics():
    return generate_latest()


@app.post("/embed/image", response_model=EmbedResponse)
async def embed_image(request: Request, file: UploadFile = File(None)):
    """Generate embedding for a single image"""
    embed_image_counter.inc()
    
    start_time = time.time()
    
    try:
        # Read image from either multipart UploadFile or raw octet-stream body
        if file is not None:
            contents = await file.read()
        else:
            contents = await request.body()
            if not contents:
                raise HTTPException(status_code=400, detail="No image data provided")
        image = Image.open(io.BytesIO(contents))
        
        # Convert RGBA to RGB if necessary
        if image.mode == 'RGBA':
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Preprocess and embed
        image_tensor = preprocess(image).unsqueeze(0).to(MODEL_DEVICE)
        
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            embedding = image_features.cpu().numpy()[0].tolist()
        
        embed_duration.labels(type="image").observe(time.time() - start_time)
        
        return EmbedResponse(
            embedding=embedding,
            model_name=MODEL_NAME,
            model_version="openai"
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")


@app.post("/embed/images", response_model=BatchEmbedResponse)
async def embed_images(files: List[UploadFile] = File(...)):
    """Generate embeddings for multiple images"""
    embed_image_counter.inc(len(files))
    
    start_time = time.time()
    
    try:
        images = []
        for file in files[:BATCH_SIZE]:  # Limit batch size
            contents = await file.read()
            image = Image.open(io.BytesIO(contents))
            
            # Convert RGBA to RGB if necessary
            if image.mode == 'RGBA':
                background = Image.new('RGB', image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[3])
                image = background
            elif image.mode != 'RGB':
                image = image.convert('RGB')
            
            images.append(preprocess(image))
        
        # Stack and process batch
        image_tensor = torch.stack(images).to(MODEL_DEVICE)
        
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            embeddings = image_features.cpu().numpy().tolist()
        
        embed_duration.labels(type="image_batch").observe(time.time() - start_time)
        
        return BatchEmbedResponse(
            embeddings=embeddings,
            model_name=MODEL_NAME,
            model_version="openai"
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process images: {str(e)}")


@app.post("/embed/text", response_model=EmbedResponse)
async def embed_text(request: TextEmbedRequest):
    """Generate embedding for text"""
    embed_text_counter.inc()
    
    start_time = time.time()
    
    try:
        # Tokenize and embed text
        text_tokens = tokenizer([request.text]).to(MODEL_DEVICE)
        
        with torch.no_grad():
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            embedding = text_features.cpu().numpy()[0].tolist()
        
        embed_duration.labels(type="text").observe(time.time() - start_time)
        
        return EmbedResponse(
            embedding=embedding,
            model_name=MODEL_NAME,
            model_version="openai"
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process text: {str(e)}")


@app.post("/embed/texts", response_model=BatchEmbedResponse)
async def embed_texts(request: TextBatchEmbedRequest):
    """Generate embeddings for multiple texts"""
    embed_text_counter.inc(len(request.texts))
    
    start_time = time.time()
    
    try:
        # Limit batch size
        texts = request.texts[:BATCH_SIZE]
        
        # Tokenize and embed texts
        text_tokens = tokenizer(texts).to(MODEL_DEVICE)
        
        with torch.no_grad():
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            embeddings = text_features.cpu().numpy().tolist()
        
        embed_duration.labels(type="text_batch").observe(time.time() - start_time)
        
        return BatchEmbedResponse(
            embeddings=embeddings,
            model_name=MODEL_NAME,
            model_version="openai"
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process texts: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
