# Goal
Build a production‑ready VISUA‑style visual similarity and quality‑control system using **Qdrant** for vector search, a **Go** backend for API/orchestration, a **Python (FastAPI) embedding microservice** for image embeddings (OpenCLIP), and a **React** web app for image upload, search, deduplication, and anomaly review.

> Inspired by VISUA’s approach: use vector search to **deduplicate** large image/video datasets, **find near‑duplicates/similar frames**, and **prioritize anomalies** for human review. Support **hybrid queries** (vector + payload filters), **multiple vectors per record**, and **quantization** options to scale.

---

## High‑level architecture
- **Client**: React (Vite + TypeScript) SPA
  - Upload images, trigger searches (by image or text), filter (payload), inspect clusters/dedups, review anomalies, give feedback.
- **API gateway / Orchestrator**: Go (Gin or Echo)
  - Auth (JWT), presigned uploads to object store, call Embedding Service, write to Qdrant, manage payloads/filters, feedback loop, background jobs.
- **Embedding Service**: Python FastAPI
  - OpenCLIP (ViT‑B/32 default), optional multi‑vector (e.g., global + region crops). Expose `/embed/image`, `/embed/text`.
- **Vector DB**: Qdrant (Docker or Cloud)
  - HNSW index, cosine distance (or dot‑product). Hybrid payload filters. Optional **Product Quantization** / scalar quantization.
- **Object storage**: MinIO (S3‑compatible) for raw/originals and thumbnails.
- **Optional**: Postgres for audit logs & async job state; Redis for queues/rate‑limits.

---

## Collections & data model
**Collection: `images`**
- **vectors** (multi‑vector support):
  - `clip_global`: float32[512] (OpenCLIP ViT‑B/32)
  - `clip_crops`: optional list of float32[512] (top‑K salient crops) — enable only if multi‑vector search is configured
- **payload** (Qdrant payload fields):
  - `image_id`: string (ULID)
  - `bucket`: string (S3 bucket)
  - `key`: string (object key)
  - `sha256`: string
  - `phash`: string (64‑bit pHash hex) for quick near‑duplicate pre‑filtering
  - `width`, `height`: int
  - `source`: enum {upload, api, batch}
  - `tags`: string[]
  - `created_at`: RFC3339
  - `model_name`: string (e.g., `openclip_ViT-B32`)
  - `model_version`: string (e.g., git commit / weights hash)
  - `quality_score`: float (0..1, optional)
  - `nsfw_score`: float (optional; for moderation)
  - `owner_user_id`: string (for multi‑tenant)

**Vector configuration**
- Distance: `Cosine`
- HNSW: `m=16`, `ef_construct=200` (tune in benchmarks)
- Quantization (optional): scalar or PQ w/ `product=8`, `bits=4` for memory reduction; store originals while testing.

---

## API (Go) — endpoints & contracts
Base path: `/api`

### Upload & ingest
1) `POST /images/presign` → {bucket, key, url, expires}
- Auth required. Returns presigned S3/MinIO URL for client direct upload.

2) `POST /images/ingest` → Body: `{ bucket, key, owner_user_id, tags? }`
- Server downloads image from object store, verifies content type, computes:
  - sha256 & **pHash** (perceptual hash)
  - generates **global** CLIP embedding via Embedding Service
  - optional **crop** embeddings (saliency‑based crops)
- Writes vectors + payload to Qdrant; returns `{ image_id }`.

### Search & discovery
3) `POST /search/similar` → multipart or JSON
- Accepts either an uploaded image file or `{ image_id }` or `{ text_query }`.
- Params: `limit`, `score_threshold?`, `filter?` (payload filter DSL), `use_crops?` (multi‑vector mode), `phash_gate?` (max Hamming distance for pre‑filter), `include_payload?`.
- Returns ranked hits: `{ image_id, score, payload, preview_url }`.

4) `POST /search/cluster` → `{ image_ids? , filter? , limit , method="agglomerative" , linkage="average" }`
- Server pulls vectors, runs clustering (server‑side job) to produce clusters of near‑duplicates/similar.

5) `GET /images/{id}` → payload + signed preview URL.

### Feedback & QA
6) `POST /feedback` → `{ image_id, action: "relevant"|"irrelevant"|"duplicate"|"anomaly", note? }`
- Log to Postgres; optional online hard‑negative mining list for retraining.

7) `GET /qa/anomalies` → returns images prioritized by **distance‑to‑nearest‑neighbor (DNN)**, **low density**, or **out‑of‑distribution** score.

### Admin & health
8) `GET /healthz` | `GET /readyz`
9) `GET /metrics` (Prometheus)

---

## Embedding Service (Python FastAPI)
- `/embed/image` → accepts image bytes or S3 URL, returns 512‑dim vector
- `/embed/text` → returns 512‑dim text vector for cross‑modal search
- Model: **OpenCLIP ViT‑B/32** (default). Expose `model_name`, `model_version`.
- Preprocessing: 224×224 resize w/ aspect‑preserving pad; center crop; normalize.
- Batch support. GPU optional.
- Containerized; expose readiness & metrics.

---

## React app (Vite + TS)
**Views**
1) **Upload**: drag‑and‑drop, shows presigned upload progress; on success calls `/images/ingest`.
2) **Search**:
   - Tab: *By Image* (drop or pick by ID), *By Text*
   - Filters: tags, date range, owner, min quality, NSFW < threshold
   - Controls: limit, score threshold, pHash gate on/off
   - Grid of results with lazy thumbnails; click → detail panel
3) **Deduplicate**: visualize clusters (gallery by cluster); merge/mark duplicates; bulk tag
4) **Anomalies**: queue sorted by DNN/outlier score; “Mark reviewed”; feedback buttons
5) **Detail**: preview, payload, similar images, feedback history

**UX niceties**
- Infinite scroll, keyboard nav (←/→)
- Copy image_id, copy preview URL
- Toasts for actions; optimistic updates

---

## Background jobs
- **Thumbnailer**: generate webp thumbnails & store
- **Cropper (optional)**: saliency/face/object crops; push crop vectors
- **Dedup sweeper**: periodic near‑duplicate clustering using pHash (Hamming ≤ 6) then vector confirm (cosine ≥ 0.95)
- **Anomaly scorer**: recompute DNN and density scores nightly

---

## Security & tenancy
- JWT auth; user → `owner_user_id` payload
- Per‑tenant namespace via payload filters; do not leak cross‑tenant data
- Virus scan on ingest (e.g., `clamd`) for uploaded files if needed

---

## Deployment (local dev via docker‑compose)
- Services: `api-go`, `embed-fastapi`, `qdrant`, `minio`, `thumb-job`, `postgres` (optional), `redis` (optional)
- Mount `./.env` into services
- Provide Makefile: `make up`, `make seed`, `make test`

---

## Environment variables
```
# Go API
API_PORT=8080
JWT_PUBLIC_KEY=...
S3_ENDPOINT=http://minio:9000
S3_REGION=auto
S3_BUCKET=images
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
EMBED_URL=http://embed-fastapi:8000
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=changeme (if Cloud)
ENABLE_QUANTIZATION=false

# Embedding service
MODEL_NAME=openclip_ViT-B-32
MODEL_DEVICE=cpu
BATCH_SIZE=16

# React
VITE_API_BASE=http://localhost:8080/api
```

---

## Qdrant setup tasks
1) Create collection `images` with multi‑vector schema:
   - `clip_global`: size=512, distance=Cosine
   - `clip_crops`: size=512, distance=Cosine, on‑disk enabled (optional)
2) Enable payload index for frequently filtered fields: `tags` (keyword), `owner_user_id` (keyword), `created_at` (datetime), `nsfw_score` (float)
3) Configure HNSW `m`, `ef_construct`. Runtime `ef` tunable per‑query.
4) (Optional) Enable quantization (`scalar` or `pq`) for memory savings; validate recall on a held‑out set.

---

## Hybrid query patterns (examples)
- **Vector + filter**: “Find images similar to this, but only `owner_user_id=X` and `created_at > T` and `tags CONTAINS [logo]`.”
- **Two‑stage**: pHash Hamming pre‑filter → vector search confirm → final rerank by cosine.
- **Multi‑vector**: query against `clip_global` and `clip_crops`, merge by max‑score per point.

---

## Acceptance criteria (MVP)
- [ ] Upload → ingest pipeline stores image, payload, and **global embedding** in Qdrant
- [ ] Similar‑by‑image returns stable top‑K with cosine; supports payload filters
- [ ] Near‑duplicate detection works using pHash + vector confirm
- [ ] Text‑to‑image search works via `/embed/text`
- [ ] React app delivers upload, search, dedup, anomalies views
- [ ] Basic auth, multi‑tenant payload isolation
- [ ] Observability: `/metrics` on API & Embedding; logs with request IDs
- [ ] Load test: ≥ 50 QPS search on dev hardware with p95 < 200ms (tunable)

---

## Stretch goals
- Content moderation pipeline (NSFW/brand safety) → payload filters
- Video support: extract frames, store per‑frame vectors; group by shot
- Active learning loop: use feedback to promote hard negatives for fine‑tuning
- Discovery API exploration for automated cluster naming/taxonomy

---

## Project scaffolding instructions (for the agent)
1) **Repo layout**
```
/ (monorepo)
  /api-go
    /cmd/api
    /internal/ (qdrant, storage, search, dedup, auth, metrics)
    go.mod
  /embed-fastapi
    app.py, models/
    requirements.txt
  /web
    vite + react + ts
  /deploy
    docker-compose.yml
    Dockerfile.api
    Dockerfile.embed
    k8s/ (manifests for prod)
  /docs
    API.md, ARCHITECTURE.md
  Makefile
```

2) **Implement Go API**
- Library suggestions: `github.com/gin-gonic/gin`, `github.com/samber/slog-gin`, `github.com/minio/minio-go/v7`, `github.com/google/uuid` or `oklog/ulid`, Qdrant client (`github.com/qdrant/go-client` if available; else REST).
- Write typed clients for Qdrant & Embedding Service; include retries + timeouts.
- Middleware: auth (JWT), request‑ID, gzip, CORS.

3) **Implement Embedding Service**
- Use `open-clip-torch` weights for ViT‑B/32; export `/embed/image` & `/embed/text`.
- Add `/healthz` & `/metrics` (Prometheus via `prometheus_client`).

4) **Implement React web**
- UI: shadcn/ui + Tailwind; routes: `/upload`, `/search`, `/dedupe`, `/anomalies`.
- Components: `Dropzone`, `SearchBar`, `ResultsGrid`, `ClusterGallery`, `DetailPanel`.

5) **Docker & compose**
- Compose services with healthchecks; bind volumes for MinIO & Qdrant.
- Seed script to index sample images for E2E test.

6) **Tests**
- Go: handler tests + integration tests hitting local Qdrant/MinIO using testcontainers.
- Python: unit tests for embedding endpoints; deterministic vector sanity checks.
- Web: Cypress smoke test for upload → search flow.

7) **Docs**
- `API.md` with request/response examples
- `ARCHITECTURE.md` with diagrams

---

## Non‑functional requirements
- Resilient to duplicate uploads (idempotent ingest based on sha256)
- Backpressure on embedding requests; bounded queues
- Configurable limits: max image size, max batch, timeouts
- Privacy: do not persist raw files in API container; store only in MinIO

---

## Deliverables
- Working docker‑compose stack
- Monorepo with Go API, FastAPI embedder, React web
- Seed dataset & E2E demo script
- Benchmarks + README with tuning notes

---

## Nice‑to‑have references for the implementer
- Use Qdrant **hybrid queries** (vector + payload filters), **multi‑vector points**, and optional **quantization** to reach scale and speed similar to VISUA’s production setup.

