# API Documentation

Base URL: `http://localhost:8080/api`

## Authentication

All endpoints except `/auth/*` require JWT authentication.

Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJ...",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

#### POST /auth/register
Register a new account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJ...",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

### Image Management

#### POST /images/presign
Get a presigned URL for direct upload to S3.

**Request:**
```json
{
  "file_name": "image.jpg"
}
```

**Response:**
```json
{
  "bucket": "images",
  "key": "images/user-id/image-id",
  "url": "https://...",
  "expires": "2024-01-01T12:00:00Z",
  "image_id": "01HGXXX..."
}
```

#### POST /images/ingest
Process an uploaded image (generate embeddings, extract metadata).

**Request:**
```json
{
  "bucket": "images",
  "key": "images/user-id/image-id",
  "tags": ["nature", "landscape"]
}
```

**Response:**
```json
{
  "image_id": "01HGXXX...",
  "sha256": "abc123...",
  "width": 1920,
  "height": 1080,
  "format": "jpeg"
}
```

#### GET /images/{id}
Get image metadata and preview URL.

**Response:**
```json
{
  "image_id": "01HGXXX...",
  "payload": {
    "bucket": "images",
    "key": "images/user-id/image-id",
    "sha256": "abc123...",
    "phash": "1234567890abcdef",
    "width": 1920,
    "height": 1080,
    "format": "jpeg",
    "tags": ["nature", "landscape"],
    "created_at": "2024-01-01T10:00:00Z"
  },
  "preview_url": "https://..."
}
```

### Search

#### POST /search/similar
Search for similar images using various methods.

**Option 1: Search by Image ID**
```json
{
  "image_id": "01HGXXX...",
  "limit": 20,
  "score_threshold": 0.7,
  "include_payload": true
}
```

**Option 2: Search by Text**
```json
{
  "text_query": "red sports car",
  "limit": 20,
  "score_threshold": 0.5,
  "include_payload": true
}
```

**Option 3: Search by Image Upload (multipart/form-data)**
```
POST /search/similar
Content-Type: multipart/form-data

image: <binary data>
limit: 20
score_threshold: 0.7
```

**Response:**
```json
{
  "results": [
    {
      "image_id": "01HGYYY...",
      "score": 0.95,
      "payload": { ... },
      "preview_url": "https://..."
    }
  ],
  "count": 20
}
```

#### POST /search/cluster
Group images into clusters (not yet implemented).

**Request:**
```json
{
  "image_ids": ["01HGXXX...", "01HGYYY..."],
  "filter": {
    "tags": ["nature"]
  },
  "limit": 100,
  "method": "agglomerative"
}
```

### Quality Assurance

#### GET /qa/anomalies
Get images ranked by anomaly score.

**Response:**
```json
{
  "anomalies": [
    {
      "image_id": "01HGXXX...",
      "anomaly_score": 0.85,
      "payload": { ... },
      "preview_url": "https://..."
    }
  ],
  "count": 10
}
```

#### POST /feedback
Submit feedback for an image.

**Request:**
```json
{
  "image_id": "01HGXXX...",
  "action": "anomaly",
  "note": "This image appears distorted"
}
```

**Actions:** `relevant`, `irrelevant`, `duplicate`, `anomaly`

**Response:**
```json
{
  "status": "feedback received"
}
```

### Health & Monitoring

#### GET /healthz
Basic health check.

**Response:**
```json
{
  "status": "healthy",
  "time": "2024-01-01T10:00:00Z"
}
```

#### GET /readyz
Readiness check (validates all dependencies).

**Response:**
```json
{
  "status": "ready",
  "time": "2024-01-01T10:00:00Z"
}
```

#### GET /metrics
Prometheus metrics endpoint.

**Response:** Prometheus text format

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (access denied)
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

Currently no rate limiting is implemented, but the following headers will be added in future:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Pagination

For endpoints returning lists, pagination will be supported via:
- `limit` - Number of results (default: 20, max: 100)
- `offset` - Skip N results
- `cursor` - For cursor-based pagination
