# Architecture Documentation

## System Overview

The Visual Anomaly Detection System is a microservices-based application designed for scalable image similarity search and anomaly detection. It follows a modern cloud-native architecture with clear separation of concerns.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Web     │     │   Mobile App    │     │   External API  │
│   (Browser)     │     │   (Future)      │     │   (Future)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   API Gateway (Go)      │
                    │   - Authentication      │
                    │   - Rate Limiting       │
                    │   - Request Routing     │
                    └──────────┬──────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Embedding Svc   │  │  Qdrant Vector  │  │     MinIO       │
│   (FastAPI)     │  │    Database     │  │ Object Storage  │
│ - OpenCLIP      │  │ - HNSW Index    │  │ - Images        │
│ - GPU Support   │  │ - Multi-vector  │  │ - Thumbnails    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
           ┌────────▼────────┐  ┌────────▼────────┐
           │   PostgreSQL    │  │      Redis      │
           │ - Metadata      │  │ - Cache        │
           │ - Audit Logs    │  │ - Queues       │
           └─────────────────┘  └─────────────────┘
```

## Component Details

### 1. Frontend (React)

**Technology Stack:**
- React 18 with TypeScript
- Vite for fast development and building
- Tailwind CSS for styling
- React Query for data fetching
- React Router for navigation

**Key Features:**
- Single Page Application (SPA)
- Responsive design
- Real-time updates
- Optimistic UI updates
- File upload with drag-and-drop

### 2. API Gateway (Go)

**Technology Stack:**
- Go 1.21+
- Gin web framework
- JWT for authentication
- Prometheus for metrics

**Responsibilities:**
- Request routing
- Authentication/Authorization
- Input validation
- Response formatting
- Circuit breaking
- Rate limiting (future)

**Key Endpoints:**
- `/api/auth/*` - Authentication
- `/api/images/*` - Image management
- `/api/search/*` - Search operations
- `/api/qa/*` - Quality assurance

### 3. Embedding Service (Python)

**Technology Stack:**
- Python 3.11+
- FastAPI framework
- OpenCLIP for embeddings
- PyTorch for model inference

**Features:**
- Multiple model support
- Batch processing
- GPU acceleration (optional)
- Caching layer
- Health monitoring

**Embedding Process:**
1. Receive image data
2. Preprocess (resize, normalize)
3. Generate embeddings using OpenCLIP
4. Return 512-dimensional vector

### 4. Qdrant Vector Database

**Configuration:**
- Collection: `images`
- Vectors: `clip_global`, `clip_crops`
- Distance metric: Cosine
- Index: HNSW (m=16, ef_construct=200)

**Features:**
- Sub-millisecond search
- Hybrid queries (vector + metadata)
- Horizontal scaling
- Persistence
- Quantization support

### 5. MinIO Object Storage

**Usage:**
- Raw image storage
- Thumbnail storage
- Presigned URLs for direct upload
- S3-compatible API

**Bucket Structure:**
```
images/
├── images/
│   └── {user_id}/
│       └── {image_id}
└── thumbnails/
    └── {user_id}/
        └── {image_id}.webp
```

### 6. PostgreSQL Database

**Schema:**
```sql
-- Image uploads tracking
CREATE TABLE image_uploads (
    id SERIAL PRIMARY KEY,
    image_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    phash VARCHAR(16),
    width INTEGER,
    height INTEGER,
    format VARCHAR(32),
    created_at TIMESTAMP NOT NULL
);

-- User feedback
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    image_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(32) NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL
);
```

### 7. Redis Cache

**Usage:**
- Session management
- Rate limiting counters
- Job queues
- Temporary data
- Cache frequently accessed data

## Data Flow

### Image Upload Flow

1. User uploads image to React app
2. App requests presigned URL from API
3. API generates presigned URL from MinIO
4. App uploads directly to MinIO
5. App notifies API of upload completion
6. API downloads image from MinIO
7. API sends image to Embedding Service
8. Embedding Service returns vector
9. API stores vector in Qdrant
10. API stores metadata in PostgreSQL

### Search Flow

1. User submits search query (image/text)
2. API processes request
3. For image: API calls Embedding Service
4. For text: API calls Embedding Service with text
5. API searches Qdrant with vector
6. Qdrant returns similar images
7. API enriches results with metadata
8. API generates preview URLs
9. API returns results to user

## Security Considerations

### Authentication & Authorization
- JWT tokens with expiration
- User isolation via payload filters
- Secure password storage (bcrypt)
- CORS configuration

### Data Protection
- TLS encryption in transit
- Isolated user data
- Presigned URLs with expiration
- Input validation

### Infrastructure Security
- Container isolation
- Network segmentation
- Secret management
- Regular security updates

## Scalability Strategies

### Horizontal Scaling
- **API Gateway**: Stateless, add more instances
- **Embedding Service**: Queue-based, add workers
- **Qdrant**: Sharding and replication
- **MinIO**: Distributed mode

### Performance Optimization
- **Caching**: Redis for frequent queries
- **Quantization**: Reduce memory usage
- **Batch Processing**: Group operations
- **CDN**: For static assets

### Monitoring & Observability
- **Metrics**: Prometheus + Grafana
- **Logging**: Structured JSON logs
- **Tracing**: OpenTelemetry (future)
- **Alerts**: Based on SLOs

## Deployment Options

### Development
- Docker Compose
- Local volumes
- Hot reloading

### Production
- Kubernetes
- Helm charts
- Persistent volumes
- Auto-scaling
- Load balancing

## Future Enhancements

1. **Video Support**
   - Frame extraction
   - Temporal embeddings
   - Shot detection

2. **Advanced Features**
   - Multi-modal search
   - Fine-tuning capabilities
   - Active learning

3. **Enterprise Features**
   - SSO integration
   - Audit logging
   - Role-based access
   - API rate limiting

4. **Performance**
   - GPU clustering
   - Distributed processing
   - Edge deployment
