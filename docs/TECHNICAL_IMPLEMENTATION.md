# Technical Implementation Guide

## Core Technologies & Dependencies

### Frontend Stack
```json
{
  "react": "^18.2.0",
  "typescript": "^5.0.0",
  "vite": "^4.4.0",
  "tailwindcss": "^3.3.0",
  "@tanstack/react-query": "^4.29.0",
  "axios": "^1.4.0",
  "plotly.js": "^2.24.0"
}
```

### Backend Stack
```go
// Go Dependencies
require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/minio/minio-go/v7 v7.0.63
    github.com/prometheus/client_golang v1.16.0
    github.com/lib/pq v1.10.9
    golang.org/x/image v0.15.0
)
```

```python
# Python Dependencies
fastapi==0.104.1
open-clip-torch==2.20.0
torch==2.0.1
pillow==10.0.1
numpy==1.24.3
```

## Key Implementation Patterns

### 1. Vector Search Implementation

**Qdrant Collection Configuration:**
```go
func (c *Client) EnsureCollection(ctx context.Context) error {
    collectionConfig := map[string]interface{}{
        "vectors": map[string]interface{}{
            "size":     512,
            "distance": "Cosine",
        },
        "optimizers_config": map[string]interface{}{
            "default_segment_number": 2,
            "memmap_threshold":       10000,
        },
        "hnsw_config": map[string]interface{}{
            "m":                     16,
            "ef_construct":           100,
            "full_scan_threshold":    10000,
            "max_indexing_threads":   0,
        },
    }
    
    return c.createCollectionIfNotExists(ctx, collectionConfig)
}
```

**Vector Search with HNSW:**
```go
func (c *Client) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
    searchPayload := map[string]interface{}{
        "vector":      req.Vector,
        "filter":      req.Filter,
        "limit":       req.Limit,
        "with_payload": req.WithPayload,
        "with_vector":  req.WithVector,
    }
    
    if req.Threshold != nil {
        searchPayload["score_threshold"] = *req.Threshold
    }
    
    resp, err := c.doRequest(ctx, "POST", "/collections/images/points/search", searchPayload)
    if err != nil {
        return nil, err
    }
    
    var result struct {
        Result []SearchResult `json:"result"`
    }
    return result.Result, json.NewDecoder(resp.Body).Decode(&result)
}
```

### 2. Image Processing Pipeline

**Perceptual Hashing:**
```go
func computePerceptualHash(img image.Image) (string, error) {
    // Resize to 8x8 for pHash
    resized := resize.Resize(8, 8, img, resize.Lanczos3)
    
    // Convert to grayscale
    gray := image.NewGray(resized.Bounds())
    draw.Draw(gray, gray.Bounds(), resized, resized.Bounds().Min, draw.Src)
    
    // Compute DCT
    dct := computeDCT(gray)
    
    // Extract hash
    hash := extractHash(dct)
    
    return fmt.Sprintf("p:%s", hash), nil
}
```

**Embedding Generation:**
```python
@app.post("/embed/image")
async def embed_image(file: UploadFile):
    # Read image
    image_data = await file.read()
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    
    # Preprocess for OpenCLIP
    image_tensor = preprocess(image).unsqueeze(0).to(DEVICE)
    
    # Generate embedding
    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        embedding = image_features.cpu().numpy().flatten().tolist()
    
    return {"embedding": embedding}
```

### 3. Deduplication Algorithm

**Clustering Implementation:**
```go
func (h *Handlers) Deduplicate(c *gin.Context) {
    // Get all images
    points, err := h.qdrant.ScrollPoints(c.Request.Context(), map[string]interface{}{}, 1000)
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to fetch images"})
        return
    }
    
    // Group by pHash prefix
    buckets := make(map[string][]Point)
    for _, point := range points {
        if phash, ok := point.Payload["phash"].(string); ok {
            prefix := strings.TrimPrefix(phash, "p:")[:8] // First 8 chars
            buckets[prefix] = append(buckets[prefix], point)
        }
    }
    
    // Find similar images within each bucket
    var clusters [][]gin.H
    for _, bucket := range buckets {
        if len(bucket) < 2 {
            continue
        }
        
        cluster := findSimilarImages(bucket, 0.6) // 60% similarity threshold
        if len(cluster) > 1 {
            clusters = append(clusters, cluster)
        }
    }
    
    c.JSON(200, gin.H{"clusters": clusters})
}
```

### 4. Anomaly Detection

**Distance-based Anomaly Scoring:**
```go
func (h *Handlers) GetAnomalies(c *gin.Context) {
    // Get all images with vectors
    points, err := h.qdrant.ScrollPointsWithVector(c.Request.Context(), map[string]interface{}{}, 100, true)
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to fetch images"})
        return
    }
    
    var anomalies []gin.H
    for _, point := range points {
        // Find nearest neighbor (excluding self)
        results, err := h.qdrant.Search(c.Request.Context(), SearchRequest{
            Vector:      point.Vector,
            Filter:      map[string]interface{}{},
            Limit:       2, // Self + 1 nearest
            WithPayload: true,
            WithVector:  false,
        })
        
        if err != nil {
            continue
        }
        
        // Calculate anomaly score
        var nearestScore float32 = 1.0
        for _, result := range results {
            if fmt.Sprintf("%v", result.ID) != fmt.Sprintf("%v", point.ID) {
                nearestScore = result.Score
                break
            }
        }
        
        anomalyScore := 1.0 - nearestScore
        
        anomalies = append(anomalies, gin.H{
            "image_id":      fmt.Sprintf("%v", point.ID),
            "anomaly_score": anomalyScore,
            "payload":       point.Payload,
            "preview_url":   generatePreviewURL(point),
        })
    }
    
    c.JSON(200, gin.H{"anomalies": anomalies})
}
```

## Performance Optimizations

### 1. Batch Processing
```python
@app.post("/embed/images")
async def embed_images_batch(files: List[UploadFile]):
    embeddings = []
    batch_size = 8
    
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        batch_embeddings = await process_batch(batch)
        embeddings.extend(batch_embeddings)
    
    return {"embeddings": embeddings}

async def process_batch(files: List[UploadFile]):
    images = []
    for file in files:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        images.append(preprocess(image))
    
    # Batch processing
    image_tensor = torch.stack(images).to(DEVICE)
    with torch.no_grad():
        features = model.encode_image(image_tensor)
        return features.cpu().numpy().tolist()
```

### 2. Connection Pooling
```go
func setupDatabase() *sql.DB {
    db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatal(err)
    }
    
    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    
    return db
}
```

### 3. Caching Strategy
```go
type Cache struct {
    redis *redis.Client
}

func (c *Cache) GetEmbedding(imageHash string) ([]float32, error) {
    key := fmt.Sprintf("embedding:%s", imageHash)
    data, err := c.redis.Get(context.Background(), key).Result()
    if err != nil {
        return nil, err
    }
    
    var embedding []float32
    return embedding, json.Unmarshal([]byte(data), &embedding)
}

func (c *Cache) SetEmbedding(imageHash string, embedding []float32) error {
    key := fmt.Sprintf("embedding:%s", imageHash)
    data, _ := json.Marshal(embedding)
    return c.redis.Set(context.Background(), key, data, 24*time.Hour).Err()
}
```

## Security Implementation

### 1. JWT Authentication
```go
func generateToken(userID, username string) (string, error) {
    claims := jwt.MapClaims{
        "user_id":  userID,
        "username": username,
        "exp":      time.Now().Add(24 * time.Hour).Unix(),
        "iat":      time.Now().Unix(),
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(os.Getenv("JWT_SECRET")))
}

func validateToken(tokenString string) (*jwt.MapClaims, error) {
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        return []byte(os.Getenv("JWT_SECRET")), nil
    })
    
    if err != nil {
        return nil, err
    }
    
    if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
        return &claims, nil
    }
    
    return nil, errors.New("invalid token")
}
```

### 2. Input Validation
```go
type UploadRequest struct {
    FileName string `json:"file_name" binding:"required,min=1,max=255"`
    FileType string `json:"file_type" binding:"required,oneof=image/jpeg image/png image/webp"`
    FileSize int64  `json:"file_size" binding:"required,min=1,max=10485760"` // 10MB max
}

func (h *Handlers) GetPresignedURL(c *gin.Context) {
    var req UploadRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    // Additional validation
    if !isValidImageType(req.FileType) {
        c.JSON(400, gin.H{"error": "unsupported file type"})
        return
    }
    
    // Generate presigned URL
    url, err := h.storage.GetPresignedUploadURL(c.Request.Context(), req.FileName, 1*time.Hour)
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to generate upload URL"})
        return
    }
    
    c.JSON(200, gin.H{"upload_url": toS3ProxyURL(url)})
}
```

## Monitoring & Observability

### 1. Prometheus Metrics
```go
var (
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "endpoint", "status"},
    )
    
    imageProcessingDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "image_processing_duration_seconds",
            Help:    "Time spent processing images",
            Buckets: prometheus.DefBuckets,
        },
        []string{"operation"},
    )
    
    vectorSearchDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "vector_search_duration_seconds",
            Help:    "Time spent on vector searches",
            Buckets: prometheus.DefBuckets,
        },
        []string{"search_type"},
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal)
    prometheus.MustRegister(imageProcessingDuration)
    prometheus.MustRegister(vectorSearchDuration)
}
```

### 2. Structured Logging
```go
func setupLogging() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level:     slog.LevelInfo,
        AddSource: true,
    }))
    slog.SetDefault(logger)
}

func (h *Handlers) IngestImage(c *gin.Context) {
    start := time.Now()
    
    slog.Info("Starting image ingestion",
        "user_id", c.GetString("user_id"),
        "content_type", c.GetHeader("Content-Type"),
    )
    
    // ... processing logic ...
    
    slog.Info("Image ingestion completed",
        "duration", time.Since(start),
        "image_id", imageID,
        "file_size", len(imageData),
    )
}
```

## Deployment Configuration

### 1. Docker Compose
```yaml
version: '3.8'
services:
  api-go:
    build:
      context: ../api-go
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/visual_anomaly
      - QDRANT_URL=http://qdrant:6333
      - MINIO_ENDPOINT=http://minio:9000
      - EMBED_URL=http://embed-fastapi:8000
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - qdrant
      - minio
      - embed-fastapi
    restart: unless-stopped

  embed-fastapi:
    build:
      context: ../embed-fastapi
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - MODEL_NAME=ViT-B-32
      - DEVICE=cpu
    deploy:
      resources:
        limits:
          memory: 4G
    restart: unless-stopped
```

### 2. Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/visual_anomaly
POSTGRES_PASSWORD=secure_password

# Vector Database
QDRANT_URL=http://qdrant:6333

# Object Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=secure_minio_password
S3_ENDPOINT=http://minio:9000

# AI/ML Service
EMBED_URL=http://embed-fastapi:8000
MODEL_NAME=ViT-B-32

# Security
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRY=24h

# Monitoring
PROMETHEUS_ENABLED=true
```

This technical implementation guide provides the core patterns and code examples for building the Visual Anomaly Detection System, covering all major components from vector search to security and monitoring.
