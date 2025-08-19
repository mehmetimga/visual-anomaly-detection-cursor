.PHONY: help up down build logs clean seed test dev-api dev-embed dev-web

# Default target
help:
	@echo "Visual Anomaly Detection System - Make Commands"
	@echo ""
	@echo "Development:"
	@echo "  make up              - Start all services with docker-compose"
	@echo "  make down            - Stop all services"
	@echo "  make build           - Build all Docker images"
	@echo "  make logs            - View logs from all services"
	@echo "  make clean           - Clean up volumes and images"
	@echo ""
	@echo "Individual Services:"
	@echo "  make dev-api         - Run Go API in development mode"
	@echo "  make dev-embed       - Run embedding service in development mode"
	@echo "  make dev-web         - Run React web app in development mode"
	@echo ""
	@echo "Testing:"
	@echo "  make test            - Run all tests"
	@echo "  make seed            - Seed database with sample data"

# Docker Compose commands
up:
	cd deploy && docker-compose up -d
	@echo "Services starting..."
	@echo "Web UI: http://localhost:3000"
	@echo "API: http://localhost:8080"
	@echo "Qdrant: http://localhost:6333"
	@echo "MinIO: http://localhost:9001 (minioadmin/minioadmin)"

down:
	cd deploy && docker-compose down

build:
	cd deploy && docker-compose build --no-cache

logs:
	cd deploy && docker-compose logs -f

clean:
	cd deploy && docker-compose down -v
	docker rmi visual-anomaly-api visual-anomaly-embed visual-anomaly-web 2>/dev/null || true
	rm -rf deploy/qdrant_storage deploy/minio_data deploy/postgres_data deploy/redis_data 2>/dev/null || true

# Development commands
dev-api:
	cd api-go && go mod download && go run cmd/api/main.go

dev-embed:
	cd embed-fastapi && pip install -r requirements.txt && python app.py

dev-web:
	cd web && npm install && npm run dev

# Testing
test:
	@echo "Running Go tests..."
	cd api-go && go test ./...
	@echo ""
	@echo "Running Python tests..."
	cd embed-fastapi && python -m pytest tests/ 2>/dev/null || echo "No Python tests found"
	@echo ""
	@echo "Running React tests..."
	cd web && npm test 2>/dev/null || echo "No React tests configured"

# Seed database with sample data
seed:
	@echo "Creating MinIO bucket..."
	docker exec visual-anomaly-minio mc config host add minio http://localhost:9000 minioadmin minioadmin
	docker exec visual-anomaly-minio mc mb minio/images --ignore-existing
	@echo ""
	@echo "Setting up Qdrant collection..."
	curl -X PUT http://localhost:6333/collections/images \
		-H "Content-Type: application/json" \
		-d '{"vectors": {"clip_global": {"size": 512, "distance": "Cosine"}, "clip_crops": {"size": 512, "distance": "Cosine"}}}' \
		2>/dev/null || echo "Collection may already exist"
	@echo ""
	@echo "Ready to upload sample images!"

# Additional utility commands
ps:
	cd deploy && docker-compose ps

restart:
	cd deploy && docker-compose restart $(service)

exec:
	cd deploy && docker-compose exec $(service) $(cmd)

# Health checks
health:
	@echo "Checking service health..."
	@curl -s http://localhost:8080/healthz | jq . || echo "API not responding"
	@curl -s http://localhost:8000/healthz | jq . || echo "Embedding service not responding"
	@curl -s http://localhost:6333/readyz | jq . || echo "Qdrant not responding"

# Development setup
setup:
	@echo "Installing Go dependencies..."
	cd api-go && go mod download
	@echo "Installing Python dependencies..."
	cd embed-fastapi && pip install -r requirements.txt
	@echo "Installing Node dependencies..."
	cd web && npm install
	@echo "Setup complete!"

# Production build
prod-build:
	docker build -f deploy/Dockerfile.api -t visual-anomaly-api:latest .
	docker build -f deploy/Dockerfile.embed -t visual-anomaly-embed:latest .
	docker build -f deploy/Dockerfile.web -t visual-anomaly-web:latest .
