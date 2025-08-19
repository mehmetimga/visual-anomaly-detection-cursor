# Visual Anomaly Detection System

A production-ready visual similarity and quality-control system inspired by VISUA's approach. Uses vector search to deduplicate large image datasets, find near-duplicates/similar frames, and prioritize anomalies for human review.

## Features

- 🖼️ **Image Upload & Ingestion**: Direct upload with automatic embedding generation
- 🔍 **Visual Search**: Find similar images using image or text queries
- 🔄 **Deduplication**: Identify and manage duplicate or near-duplicate images
- ⚠️ **Anomaly Detection**: Automatically detect unusual or outlier images
- 🏷️ **Multi-tenant Support**: Secure isolation of user data
- 📊 **Real-time Analytics**: Prometheus metrics and health monitoring

## Architecture

- **Frontend**: React (Vite + TypeScript) with Tailwind CSS
- **API Gateway**: Go with Gin framework
- **Embedding Service**: Python FastAPI with OpenCLIP
- **Vector Database**: Qdrant for similarity search
- **Object Storage**: MinIO (S3-compatible)
- **Cache/Queue**: Redis
- **Database**: PostgreSQL for metadata and audit logs

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Make (optional, for convenience commands)
- 8GB+ RAM recommended

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd visual-anomaly-detection-cursor
```

2. Copy the environment file:
```bash
cp env.example .env
# Edit .env with your configuration
```

3. Start all services:
```bash
make up
# or without make:
# cd deploy && docker-compose up -d
```

4. Initialize the system:
```bash
make seed
```

5. Access the services:
- Web UI: http://localhost:3000
- API: http://localhost:8080
- Qdrant Dashboard: http://localhost:6333
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## Usage

### Upload Images

1. Navigate to http://localhost:3000
2. Login or register a new account
3. Go to the Upload tab
4. Drag and drop images or click to browse
5. Images are automatically processed and indexed

### Search for Similar Images

1. Go to the Search tab
2. Choose search method:
   - **By Image**: Upload an image to find similar ones
   - **By Text**: Enter a text description
3. Adjust search parameters (limit, threshold)
4. View results ranked by similarity

### Manage Duplicates

1. Go to the Deduplicate tab
2. View automatically grouped similar images
3. Choose to merge, delete, or keep duplicates

### Review Anomalies

1. Go to the Anomalies tab
2. Review images ranked by anomaly score
3. Provide feedback to improve detection

## Development

### Running Services Individually

```bash
# API Service
make dev-api

# Embedding Service
make dev-embed

# Web Application
make dev-web
```

### Running Tests

```bash
make test
```

### Building from Source

```bash
make build
```

## API Documentation

See [docs/API.md](docs/API.md) for detailed API documentation.

## Architecture Details

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture details.

## Configuration

### Environment Variables

Key configuration options in `.env`:

- `JWT_SECRET`: Secret key for JWT tokens (change in production!)
- `MODEL_NAME`: OpenCLIP model to use (default: ViT-B-32)
- `MODEL_DEVICE`: Device for inference (cpu/cuda)
- `ENABLE_QUANTIZATION`: Enable vector quantization for memory efficiency

### Scaling Considerations

- **Vector Database**: Qdrant supports sharding and replication
- **Embedding Service**: Can be scaled horizontally with load balancing
- **Storage**: MinIO supports distributed mode for high availability
- **API**: Stateless design allows horizontal scaling

## Troubleshooting

### Common Issues

1. **Services not starting**: Check logs with `make logs`
2. **Out of memory**: Reduce `BATCH_SIZE` in embedding service
3. **Slow searches**: Enable quantization or add more Qdrant replicas

### Health Checks

```bash
make health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by VISUA's visual AI technology
- Built with OpenCLIP for state-of-the-art embeddings
- Powered by Qdrant vector database
