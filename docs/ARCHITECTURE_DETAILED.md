# Visual Anomaly Detection System - Detailed Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Details](#component-details)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Security Architecture](#security-architecture)
7. [Performance Considerations](#performance-considerations)
8. [Scalability Design](#scalability-design)
9. [Deployment Architecture](#deployment-architecture)
10. [Monitoring & Observability](#monitoring--observability)

## System Overview

The Visual Anomaly Detection System is a comprehensive solution for detecting visual anomalies, finding similar images, and identifying duplicates in image datasets. The system leverages modern AI/ML techniques including:

- **Computer Vision**: OpenCLIP (ViT-B/32) for image embeddings
- **Vector Search**: Qdrant vector database with HNSW indexing
- **Perceptual Hashing**: pHash for near-duplicate detection
- **Clustering**: Agglomerative clustering for deduplication
- **Anomaly Detection**: Distance-based anomaly scoring

### Key Features
- **Image Similarity Search**: Find visually similar images using vector embeddings
- **Deduplication**: Identify and cluster near-duplicate images
- **Anomaly Detection**: Find images that are visually different from the dataset
- **Text Search**: Search images using natural language descriptions
- **Vector Visualization**: 2D/3D visualization of image embeddings
- **Real-time Processing**: Immediate embedding generation and indexing

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                Frontend Layer                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  React SPA (Vite + TypeScript + Tailwind CSS)                                  │
│  ├── Authentication & User Management                                          │
│  ├── Image Upload & Management                                                 │
│  ├── Search Interface (Visual + Text)                                          │
│  ├── Deduplication Review                                                      │
│  ├── Anomaly Review                                                            │
│  └── Vector Explorer (2D/3D Visualization)                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway Layer                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Go API (Gin Framework)                                                        │
│  ├── Authentication (JWT)                                                      │
│  ├── Request Routing & Validation                                              │
│  ├── Presigned URL Generation (S3/MinIO)                                       │
│  ├── Image Ingestion Orchestration                                             │
│  ├── Vector Search Coordination                                                │
│  └── Metrics Collection (Prometheus)                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│    Storage Layer        │ │  AI/ML Layer    │ │   Vector Database       │
├─────────────────────────┤ ├─────────────────┤ ├─────────────────────────┤
│ MinIO (S3-Compatible)   │ │ Python FastAPI  │ │ Qdrant Vector DB        │
│ ├── Raw Images          │ │ ├── OpenCLIP    │ │ ├── HNSW Index          │
│ ├── Thumbnails          │ │ ├── Image       │ │ ├── Cosine Distance     │
│ └── Metadata            │ │ │   Embeddings  │ │ ├── 512-dim Vectors     │
└─────────────────────────┘ │ ├── Text        │ │ └── Payload Storage     │
                            │ │   Embeddings  │ └─────────────────────────┘
                            │ └── Batch       │
                            │   Processing    │
                            └─────────────────┘
```

## Component Details

### 1. Frontend Layer (React SPA)

**Technology Stack:**
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context + React Query
- **HTTP Client**: Axios
- **UI Components**: shadcn/ui

**Key Components:**
```typescript
// Core Application Structure
src/
├── components/
│   ├── ui/                    # Reusable UI components
│   ├── Layout.tsx            # Main application layout
│   └── ProtectedRoute.tsx    # Authentication wrapper
├── pages/
│   ├── LoginPage.tsx         # User authentication
│   ├── UploadPage.tsx        # Image upload & management
│   ├── SearchPage.tsx        # Visual & text search
│   ├── DeduplicatePage.tsx   # Duplicate review & management
│   ├── AnomaliesPage.tsx     # Anomaly review
│   └── VectorExplorer.tsx    # 2D/3D vector visualization
├── contexts/
│   └── AuthContext.tsx       # Authentication state
├── api/
│   └── client.ts             # API client & interceptors
└── lib/
    └── utils.ts              # Utility functions
```

**Key Features:**
- **Real-time Image Preview**: Immediate feedback during upload
- **Drag & Drop Upload**: Modern file upload experience
- **Responsive Design**: Mobile-friendly interface
- **Interactive Visualizations**: Plotly.js for vector exploration
- **Bulk Operations**: Multi-select for deduplication management

### 2. API Gateway Layer (Go/Gin)

**Technology Stack:**
- **Framework**: Gin Web Framework
- **Language**: Go 1.21
- **Authentication**: JWT with HMAC-SHA256
- **Validation**: Go struct tags
- **Logging**: Structured logging with slog
- **Metrics**: Prometheus instrumentation

**Core Architecture:**
```go
// Handler Structure
type Handlers struct {
    db       *sql.DB           // PostgreSQL connection
    qdrant   *qdrant.Client    // Vector database client
    storage  *minio.Client     // Object storage client
    embedURL string            // Embedding service URL
    httpClient *http.Client    // HTTP client for services
}

// Key Endpoints
POST   /api/auth/login         # User authentication
POST   /api/auth/register      # User registration
POST   /api/presign/upload     # Generate presigned upload URL
POST   /api/images/ingest      # Process uploaded image
GET    /api/images             # List user images
POST   /api/search/similar     # Visual similarity search
POST   /api/search/text        # Text-based image search
POST   /api/deduplicate        # Find duplicate clusters
GET    /api/qa/anomalies       # Get anomaly candidates
DELETE /api/images/{id}        # Delete image
POST   /api/images/{id}/reindex # Regenerate embeddings
POST   /api/images/{id}/thumbnail # Regenerate thumbnail
```

**Authentication Flow:**
```go
// JWT Token Structure
type Claims struct {
    UserID   string `json:"user_id"`
    Username string `json:"username"`
    Exp      int64  `json:"exp"`
    Iat      int64  `json:"iat"`
}

// Middleware Chain
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := extractToken(c)
        claims, err := validateToken(token)
        if err != nil {
            c.JSON(401, gin.H{"error": "unauthorized"})
            c.Abort()
            return
        }
        c.Set("user_id", claims.UserID)
        c.Next()
    }
}
```

### 3. Storage Layer (MinIO)

**Configuration:**
```yaml
# MinIO Configuration
version: '3.8'
services:
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
```

**Storage Structure:**
```
minio/
├── images/                    # Raw uploaded images
│   ├── {user_id}/
│   │   ├── {image_id}.jpg
│   │   ├── {image_id}.png
│   │   └── {image_id}.webp
├── thumbnails/               # Generated thumbnails
│   ├── {user_id}/
│   │   ├── {image_id}_thumb.jpg
│   │   └── {image_id}_thumb.png
└── metadata/                 # Image metadata
    ├── {user_id}/
    │   └── {image_id}.json
```

**Presigned URL Flow:**
```go
// Generate presigned upload URL
func (h *Handlers) GetPresignedURL(c *gin.Context) {
    fileName := generateFileName()
    url, err := h.storage.GetPresignedUploadURL(ctx, fileName, 1*time.Hour)
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to generate upload URL"})
        return
    }
    
    // Convert internal URL to frontend-accessible URL
    frontendURL := toS3ProxyURL(url)
    c.JSON(200, gin.H{"upload_url": frontendURL})
}
```

### 4. AI/ML Layer (Python FastAPI)

**Technology Stack:**
- **Framework**: FastAPI
- **ML Library**: OpenCLIP (ViT-B/32)
- **Image Processing**: Pillow, OpenCV
- **Async Processing**: asyncio
- **Batch Processing**: Custom batching logic

**Model Configuration:**
```python
# OpenCLIP Configuration
MODEL_NAME = "ViT-B-32"
MODEL_VERSION = "openai"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Model Loading
model, _, preprocess = open_clip.create_model_and_transforms(
    MODEL_NAME, 
    pretrained=MODEL_VERSION,
    device=DEVICE
)
tokenizer = open_clip.get_tokenizer(MODEL_NAME)
```

**Embedding Generation:**
```python
@app.post("/embed/image")
async def embed_image(file: UploadFile):
    # Read and preprocess image
    image_data = await file.read()
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    image_tensor = preprocess(image).unsqueeze(0).to(DEVICE)
    
    # Generate embedding
    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        embedding = image_features.cpu().numpy().flatten().tolist()
    
    return {"embedding": embedding}

@app.post("/embed/text")
async def embed_text(request: TextEmbedRequest):
    # Tokenize text
    text_tokens = tokenizer([request.text]).to(DEVICE)
    
    # Generate embedding
    with torch.no_grad():
        text_features = model.encode_text(text_tokens)
        embedding = text_features.cpu().numpy().flatten().tolist()
    
    return {"embedding": embedding}
```

**Batch Processing:**
```python
@app.post("/embed/images")
async def embed_images_batch(files: List[UploadFile]):
    embeddings = []
    
    # Process images in batches
    batch_size = 8
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        batch_embeddings = await process_image_batch(batch)
        embeddings.extend(batch_embeddings)
    
    return {"embeddings": embeddings}
```

### 5. Vector Database Layer (Qdrant)

**Configuration:**
```yaml
# Qdrant Configuration
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      QDRANT__SERVICE__HTTP_PORT: 6333
      QDRANT__SERVICE__GRPC_PORT: 6334
```

**Collection Schema:**
```json
{
  "name": "images",
  "vectors": {
    "size": 512,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "default_segment_number": 2,
    "memmap_threshold": 10000
  },
  "hnsw_config": {
    "m": 16,
    "ef_construct": 100,
    "full_scan_threshold": 10000,
    "max_indexing_threads": 0
  },
  "wal_config": {
    "wal_capacity_mb": 32,
    "wal_segments_ahead": 0
  }
}
```

**Vector Operations:**
```go
// Point Structure
type Point struct {
    ID       interface{}            `json:"id"`
    Vector   []float32              `json:"vector"`
    Payload  map[string]interface{} `json:"payload"`
}

// Search Request
type SearchRequest struct {
    Vector         interface{}            `json:"vector"`
    Filter         map[string]interface{} `json:"filter,omitempty"`
    Limit          int                    `json:"limit"`
    WithPayload    bool                   `json:"with_payload"`
    WithVector     bool                   `json:"with_vector"`
    Threshold      *float32               `json:"threshold,omitempty"`
}

// Search Response
type SearchResult struct {
    ID     interface{}            `json:"id"`
    Score  float32                `json:"score"`
    Payload map[string]interface{} `json:"payload"`
}
```

**Indexing Strategy:**
- **HNSW (Hierarchical Navigable Small World)**: Fast approximate nearest neighbor search
- **Cosine Distance**: Normalized similarity measurement
- **512-dimensional vectors**: OpenCLIP ViT-B/32 output dimension
- **Payload storage**: Metadata alongside vectors for efficient retrieval

## Data Flow

### 1. Image Upload Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as API Gateway
    participant M as MinIO
    participant E as Embedding Service
    participant Q as Qdrant

    U->>F: Upload Image
    F->>A: GET /api/presign/upload
    A->>M: Generate Presigned URL
    M->>A: Return Presigned URL
    A->>F: Return Upload URL
    F->>M: Upload Image (Direct)
    M->>F: Upload Success
    F->>A: POST /api/images/ingest
    A->>M: Download Image
    M->>A: Image Data
    A->>E: POST /embed/image
    E->>A: Embedding Vector
    A->>Q: Upsert Point
    Q->>A: Success
    A->>F: Processing Complete
    F->>U: Success Notification
```

### 2. Similarity Search Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as API Gateway
    participant Q as Qdrant
    participant M as MinIO

    U->>F: Select Image for Search
    F->>A: POST /api/search/similar
    A->>Q: Get Point Vector
    Q->>A: Point Data
    A->>Q: Search Similar Vectors
    Q->>A: Search Results
    A->>M: Generate Preview URLs
    M->>A: Presigned URLs
    A->>F: Search Results + URLs
    F->>U: Display Similar Images
```

### 3. Deduplication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as API Gateway
    participant Q as Qdrant

    U->>F: Request Deduplication
    F->>A: POST /api/deduplicate
    A->>Q: Scroll All Points
    Q->>A: All Images
    A->>A: Compute pHash
    A->>A: Group by pHash
    A->>Q: Search Similar (per group)
    Q->>A: Similarity Results
    A->>A: Apply Clustering
    A->>F: Clustered Results
    F->>U: Display Clusters
```

## Technology Stack

### Frontend Technologies
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | 18.x | UI Framework |
| Language | TypeScript | 5.x | Type Safety |
| Build Tool | Vite | 4.x | Fast Development |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| State Management | React Query | 4.x | Server State |
| HTTP Client | Axios | 1.x | API Communication |
| UI Components | shadcn/ui | Latest | Design System |
| Visualization | Plotly.js | 2.x | Vector Exploration |

### Backend Technologies
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| API Gateway | Go/Gin | 1.21 | REST API |
| Authentication | JWT | - | Token-based Auth |
| Database | PostgreSQL | 15.x | Relational Data |
| Vector DB | Qdrant | 1.7.x | Vector Storage |
| Object Storage | MinIO | Latest | S3-compatible |
| ML Service | Python/FastAPI | 3.11 | Embedding Generation |
| ML Model | OpenCLIP | Latest | Vision-Language Model |

### Infrastructure Technologies
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Containerization | Docker | Latest | Application Packaging |
| Orchestration | Docker Compose | Latest | Multi-service Deployment |
| Web Server | Nginx | Latest | Reverse Proxy |
| Caching | Redis | 7.x | Session Storage |
| Monitoring | Prometheus | Latest | Metrics Collection |

## Security Architecture

### Authentication & Authorization
```go
// JWT Token Structure
type JWTClaims struct {
    UserID   string `json:"user_id"`
    Username string `json:"username"`
    Role     string `json:"role"`
    Exp      int64  `json:"exp"`
    Iat      int64  `json:"iat"`
}

// Security Headers
func SecurityMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Header("X-Content-Type-Options", "nosniff")
        c.Header("X-Frame-Options", "DENY")
        c.Header("X-XSS-Protection", "1; mode=block")
        c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        c.Next()
    }
}
```

### Data Protection
- **Encryption at Rest**: All data encrypted in storage
- **Encryption in Transit**: TLS 1.3 for all communications
- **Access Control**: Role-based access control (RBAC)
- **Audit Logging**: Comprehensive audit trails
- **Input Validation**: Strict input validation and sanitization

### API Security
```go
// Rate Limiting
func RateLimitMiddleware() gin.HandlerFunc {
    limiter := rate.NewLimiter(rate.Every(time.Second), 10)
    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.JSON(429, gin.H{"error": "rate limit exceeded"})
            c.Abort()
            return
        }
        c.Next()
    }
}

// CORS Configuration
func CORSMiddleware() gin.HandlerFunc {
    return cors.New(cors.Config{
        AllowOrigins:     []string{"http://localhost:3000"},
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
        ExposeHeaders:    []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           12 * time.Hour,
    })
}
```

## Performance Considerations

### Frontend Performance
- **Code Splitting**: Route-based code splitting with React.lazy()
- **Image Optimization**: WebP format with fallbacks
- **Caching Strategy**: Service Worker for static assets
- **Bundle Optimization**: Tree shaking and minification

### Backend Performance
- **Connection Pooling**: Database connection pooling
- **Caching**: Redis for session and query caching
- **Async Processing**: Non-blocking I/O operations
- **Batch Processing**: Efficient batch operations for embeddings

### Database Performance
```sql
-- Optimized Indexes
CREATE INDEX CONCURRENTLY idx_image_uploads_user_id ON image_uploads(user_id);
CREATE INDEX CONCURRENTLY idx_image_uploads_sha256 ON image_uploads(sha256);
CREATE INDEX CONCURRENTLY idx_image_uploads_created_at ON image_uploads(created_at);

-- Partitioning Strategy
CREATE TABLE image_uploads_partitioned (
    id SERIAL,
    image_id VARCHAR(255),
    user_id VARCHAR(255),
    created_at TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Query Optimization
EXPLAIN ANALYZE SELECT * FROM image_uploads 
WHERE user_id = $1 
ORDER BY created_at DESC 
LIMIT 20;
```

### Vector Search Performance
- **HNSW Index**: O(log n) search complexity
- **Cosine Distance**: Normalized similarity for accuracy
- **Payload Filtering**: Efficient metadata filtering
- **Batch Operations**: Bulk upsert for better throughput

## Scalability Design

### Horizontal Scaling
```yaml
# Kubernetes Deployment Example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: api-gateway:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Load Balancing
```nginx
# Nginx Load Balancer Configuration
upstream api_backend {
    least_conn;
    server api-gateway-1:8080;
    server api-gateway-2:8080;
    server api-gateway-3:8080;
}

upstream embedding_backend {
    least_conn;
    server embedding-service-1:8000;
    server embedding-service-2:8000;
    server embedding-service-3:8000;
}
```

### Database Scaling
- **Read Replicas**: PostgreSQL read replicas for query distribution
- **Sharding**: Horizontal partitioning by user_id
- **Connection Pooling**: PgBouncer for connection management

### Storage Scaling
- **MinIO Distributed**: Multi-node MinIO cluster
- **CDN Integration**: CloudFront for global image delivery
- **Caching Layers**: Redis cluster for session and cache distribution

## Deployment Architecture

### Docker Compose Setup
```yaml
# Production-ready docker-compose.yml
version: '3.8'
services:
  # API Gateway
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

  # Embedding Service
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

  # Vector Database
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
    restart: unless-stopped

  # Object Storage
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    restart: unless-stopped

  # Web Server
  web:
    build:
      context: ../web
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - api-go
    restart: unless-stopped

volumes:
  qdrant_data:
  minio_data:
```

### Environment Configuration
```bash
# .env.production
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

## Monitoring & Observability

### Metrics Collection
```go
// Prometheus Metrics
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
```

### Health Checks
```go
// Health Check Endpoints
func (h *Handlers) Health(c *gin.Context) {
    c.JSON(200, gin.H{
        "status": "healthy",
        "timestamp": time.Now().Unix(),
        "version": "1.0.0",
    })
}

func (h *Handlers) Ready(c *gin.Context) {
    // Check database connectivity
    if err := h.db.Ping(); err != nil {
        c.JSON(503, gin.H{"status": "not ready", "error": "database"})
        return
    }
    
    // Check Qdrant connectivity
    if err := h.qdrant.Health(); err != nil {
        c.JSON(503, gin.H{"status": "not ready", "error": "qdrant"})
        return
    }
    
    // Check MinIO connectivity
    if err := h.storage.Health(); err != nil {
        c.JSON(503, gin.H{"status": "not ready", "error": "minio"})
        return
    }
    
    c.JSON(200, gin.H{"status": "ready"})
}
```

### Logging Strategy
```go
// Structured Logging
func setupLogging() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
        AddSource: true,
    }))
    slog.SetDefault(logger)
}

// Logging Middleware
func LoggingMiddleware() gin.HandlerFunc {
    return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
        slog.Info("HTTP Request",
            "method", param.Method,
            "path", param.Path,
            "status", param.StatusCode,
            "latency", param.Latency,
            "client_ip", param.ClientIP,
            "user_agent", param.Request.UserAgent(),
        )
        return ""
    })
}
```

### Alerting Rules
```yaml
# Prometheus Alert Rules
groups:
  - name: visual_anomaly_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowImageProcessing
        expr: histogram_quantile(0.95, image_processing_duration_seconds) > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Image processing is slow"
          
      - alert: VectorSearchTimeout
        expr: histogram_quantile(0.95, vector_search_duration_seconds) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Vector search is slow"
```

## Conclusion

This architecture provides a robust, scalable, and maintainable foundation for the Visual Anomaly Detection System. Key strengths include:

1. **Modular Design**: Clear separation of concerns across services
2. **Scalability**: Horizontal scaling capabilities at every layer
3. **Performance**: Optimized for real-time processing and search
4. **Security**: Comprehensive security measures throughout
5. **Observability**: Full monitoring and alerting capabilities
6. **Maintainability**: Well-documented and structured codebase

The system is designed to handle production workloads while maintaining high availability and performance standards.
