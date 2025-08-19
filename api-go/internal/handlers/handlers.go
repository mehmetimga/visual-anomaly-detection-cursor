package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/corona10/goimagehash"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/oklog/ulid/v2"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/visual-anomaly/api-go/internal/auth"
	"github.com/visual-anomaly/api-go/internal/qdrant"
	"github.com/visual-anomaly/api-go/internal/storage"
	_ "golang.org/x/image/webp"
)

type Handlers struct {
	storage       *storage.MinioClient
	qdrant        *qdrant.Client
	auth          *auth.Service
	embedURL      string
	db            *sql.DB
	httpClient    *http.Client
	uploadCounter prometheus.Counter
	searchHist    prometheus.Histogram
}

func New(storage *storage.MinioClient, qdrant *qdrant.Client, auth *auth.Service, embedURL string) *Handlers {
	// Initialize database connection
	db, err := sql.Open("postgres", getEnv("POSTGRES_DSN", "postgres://visual:visual@postgres:5432/visual?sslmode=disable"))
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
	}

	// Create tables if they don't exist
	if db != nil {
		createTables(db)
	}

	// Initialize Prometheus metrics
	uploadCounter := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "image_uploads_total",
		Help: "Total number of image uploads",
	})
	prometheus.MustRegister(uploadCounter)

	searchHist := prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "search_duration_seconds",
		Help:    "Search request duration in seconds",
		Buckets: prometheus.DefBuckets,
	})
	prometheus.MustRegister(searchHist)

	return &Handlers{
		storage:       storage,
		qdrant:        qdrant,
		auth:          auth,
		embedURL:      embedURL,
		db:            db,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		uploadCounter: uploadCounter,
		searchHist:    searchHist,
	}
}

func (h *Handlers) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"time":   time.Now().UTC(),
	})
}

func (h *Handlers) Ready(c *gin.Context) {
	// Check all dependencies
	ctx := context.Background()

	// Check database
	if h.db != nil {
		if err := h.db.PingContext(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "not ready",
				"error":  "database not available",
			})
			return
		}
	}

	// Check embedding service
	resp, err := h.httpClient.Get(h.embedURL + "/healthz")
	if err != nil || resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "not ready",
			"error":  "embedding service not available",
		})
		return
	}
	resp.Body.Close()

	c.JSON(http.StatusOK, gin.H{
		"status": "ready",
		"time":   time.Now().UTC(),
	})
}

func (h *Handlers) Metrics(c *gin.Context) {
	promhttp.Handler().ServeHTTP(c.Writer, c.Request)
}

func (h *Handlers) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// For demo purposes, accept any email/password and create a user ID
	userID := uuid.New().String()

	token, err := h.auth.GenerateToken(userID, req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":   token,
		"user_id": userID,
		"email":   req.Email,
	})
}

func (h *Handlers) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// For demo purposes, just create a new user
	userID := uuid.New().String()

	token, err := h.auth.GenerateToken(userID, req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":   token,
		"user_id": userID,
		"email":   req.Email,
	})
}

func (h *Handlers) GetPresignedURL(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		FileName string `json:"file_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Generate unique image ID
	imageID := ulid.Make().String()
	key := storage.GenerateImageKey(userID, imageID)

	// Get presigned URL for upload
	url, err := h.storage.GetPresignedUploadURL(c.Request.Context(), key, 15*time.Minute)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate presigned URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"bucket":   "images",
		"key":      key,
		"url":      url,
		"expires":  time.Now().Add(15 * time.Minute),
		"image_id": imageID,
	})
}

func (h *Handlers) IngestImage(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Bucket string   `json:"bucket" binding:"required"`
		Key    string   `json:"key" binding:"required"`
		Tags   []string `json:"tags"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Download image from storage
	imageData, err := h.storage.DownloadFile(ctx, req.Key)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "image not found"})
		return
	}

	// Compute SHA256
	sha256Hash := storage.ComputeSHA256(imageData)

	// Decode image to get dimensions
	img, format, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image format"})
		return
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// Compute perceptual hash
	hash, err := goimagehash.PerceptionHash(img)
	if err != nil {
		slog.Error("Failed to compute phash", "error", err)
	}
	phash := hash.ToString()

	// Get embedding from embedding service
	embedding, err := h.getImageEmbedding(imageData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get embedding"})
		return
	}

	// Generate image ID from key
	imageID := ulid.Make().String()

	// Create Qdrant point with integer ID
	point := qdrant.Point{
		ID: time.Now().UnixNano(),
		Vectors: map[string]qdrant.Vector{
			"clip_global": embedding,
		},
		Payload: qdrant.Payload{
			"image_id": imageID,
			"bucket":   req.Bucket,
			"key":      req.Key,
			"sha256":   sha256Hash,
			"phash":    phash,
			"width":    width,
			"height":   height,
			"format":   format,
			"source":   "upload",
			"tags": func() []string {
				if req.Tags == nil {
					return []string{}
				}
				return req.Tags
			}(),
			"created_at":    time.Now().UTC().Format(time.RFC3339),
			"model_name":    "ViT-B-32",
			"model_version": "openai",
			"owner_user_id": userID,
		},
	}

	// Store in Qdrant
	if err := h.qdrant.UpsertPoint(ctx, point); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store in vector database"})
		return
	}

	// Update metrics
	h.uploadCounter.Inc()

	// Log to database if available
	if h.db != nil {
		_, err = h.db.ExecContext(ctx, `
			INSERT INTO image_uploads (image_id, user_id, sha256, phash, width, height, format, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, imageID, userID, sha256Hash, phash, width, height, format, time.Now().UTC())
		if err != nil {
			slog.Error("Failed to log upload", "error", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"image_id": imageID,
		"sha256":   sha256Hash,
		"width":    width,
		"height":   height,
		"format":   format,
	})
}

func (h *Handlers) SearchSimilar(c *gin.Context) {
	timer := prometheus.NewTimer(h.searchHist)
	defer timer.ObserveDuration()

	userID := c.GetString("user_id")

	// Parse multipart form
	contentType := c.GetHeader("Content-Type")

	var embedding []float32
	var err error

	// Check if it's a multipart form (image upload)
	if c.Request.Method == "POST" && contentType != "" && len(contentType) > 19 && contentType[:19] == "multipart/form-data" {
		file, _, err := c.Request.FormFile("image")
		if err == nil {
			defer file.Close()

			// Read image data
			imageData, err := io.ReadAll(file)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read image"})
				return
			}

			// Get embedding
			embedding, err = h.getImageEmbedding(imageData)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get embedding"})
				return
			}
		}
	} else {
		// JSON request
		var req struct {
			ImageID        string                 `json:"image_id"`
			TextQuery      string                 `json:"text_query"`
			Limit          int                    `json:"limit"`
			ScoreThreshold *float32               `json:"score_threshold"`
			Filter         map[string]interface{} `json:"filter"`
			UseCrops       bool                   `json:"use_crops"`
			PhashGate      *int                   `json:"phash_gate"`
			IncludePayload bool                   `json:"include_payload"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set defaults
		if req.Limit == 0 {
			req.Limit = 10
		}
		if req.Limit > 100 {
			req.Limit = 100
		}

		// Get embedding based on input type
		if req.ImageID != "" {
			// Fetch existing image vector
			point, err := h.qdrant.GetPoint(c.Request.Context(), req.ImageID)
			if err != nil || point == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "image not found"})
				return
			}

			if vec, ok := point.Vectors["clip_global"]; ok {
				embedding = vec
			}
		} else if req.TextQuery != "" {
			// Get text embedding
			embedding, err = h.getTextEmbedding(req.TextQuery)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get text embedding"})
				return
			}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "image_id or text_query required"})
			return
		}

		// Add owner filter
		if req.Filter == nil {
			req.Filter = make(map[string]interface{})
		}
		req.Filter["owner_user_id"] = userID

		// Perform search
		searchReq := qdrant.SearchRequest{
			Vector:      embedding,
			VectorName:  "clip_global",
			Filter:      req.Filter,
			Limit:       req.Limit,
			WithPayload: req.IncludePayload,
			WithVector:  false,
			Threshold:   req.ScoreThreshold,
		}

		results, err := h.qdrant.Search(c.Request.Context(), searchReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
			return
		}

		// Add preview URLs
		var response []gin.H
		for _, result := range results {
			item := gin.H{
				"image_id": result.ID,
				"score":    result.Score,
			}

			if req.IncludePayload {
				item["payload"] = result.Payload
			}

			// Generate preview URL
			if key, ok := result.Payload["key"].(string); ok {
				previewURL, _ := h.storage.GetPresignedDownloadURL(c.Request.Context(), key, 1*time.Hour)
				item["preview_url"] = previewURL
			}

			response = append(response, item)
		}

		c.JSON(http.StatusOK, gin.H{
			"results": response,
			"count":   len(response),
		})
		return
	}

	// If we got here through multipart, return results
	if embedding != nil {
		// Default search parameters for multipart
		searchReq := qdrant.SearchRequest{
			Vector:      embedding,
			VectorName:  "clip_global",
			Filter:      map[string]interface{}{"owner_user_id": userID},
			Limit:       10,
			WithPayload: true,
			WithVector:  false,
		}

		results, err := h.qdrant.Search(c.Request.Context(), searchReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
			return
		}

		// Add preview URLs
		var response []gin.H
		for _, result := range results {
			item := gin.H{
				"image_id": result.ID,
				"score":    result.Score,
				"payload":  result.Payload,
			}

			// Generate preview URL
			if key, ok := result.Payload["key"].(string); ok {
				previewURL, _ := h.storage.GetPresignedDownloadURL(c.Request.Context(), key, 1*time.Hour)
				item["preview_url"] = previewURL
			}

			response = append(response, item)
		}

		c.JSON(http.StatusOK, gin.H{
			"results": response,
			"count":   len(response),
		})
	}
}

func (h *Handlers) ClusterImages(c *gin.Context) {
	// TODO: Implement clustering logic
	c.JSON(http.StatusNotImplemented, gin.H{"error": "clustering not yet implemented"})
}

func (h *Handlers) GetImage(c *gin.Context) {
	imageID := c.Param("id")
	userID := c.GetString("user_id")

	point, err := h.qdrant.GetPoint(c.Request.Context(), imageID)
	if err != nil || point == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "image not found"})
		return
	}

	// Check ownership
	if ownerID, ok := point.Payload["owner_user_id"].(string); ok && ownerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	// Generate preview URL
	var previewURL string
	if key, ok := point.Payload["key"].(string); ok {
		previewURL, _ = h.storage.GetPresignedDownloadURL(c.Request.Context(), key, 1*time.Hour)
	}

	c.JSON(http.StatusOK, gin.H{
		"image_id":    imageID,
		"payload":     point.Payload,
		"preview_url": previewURL,
	})
}

func (h *Handlers) SubmitFeedback(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		ImageID string `json:"image_id" binding:"required"`
		Action  string `json:"action" binding:"required,oneof=relevant irrelevant duplicate anomaly"`
		Note    string `json:"note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Log feedback to database
	if h.db != nil {
		_, err := h.db.ExecContext(c.Request.Context(), `
			INSERT INTO feedback (image_id, user_id, action, note, created_at)
			VALUES ($1, $2, $3, $4, $5)
		`, req.ImageID, userID, req.Action, req.Note, time.Now().UTC())

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save feedback"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "feedback received",
	})
}

func (h *Handlers) GetAnomalies(c *gin.Context) {
	userID := c.GetString("user_id")

	// For MVP, return images with lowest similarity scores to their nearest neighbors
	// This is a simple anomaly detection approach

	// Get all user's images
	filter := map[string]interface{}{
		"owner_user_id": userID,
	}

	points, err := h.qdrant.ScrollPoints(c.Request.Context(), filter, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch images"})
		return
	}

	// For each point, find its nearest neighbor and compute distance
	var anomalies []gin.H

	for _, point := range points {
		if vec, ok := point.Vectors["clip_global"]; ok {
			// Search for nearest neighbors excluding self
			searchReq := qdrant.SearchRequest{
				Vector:      vec,
				VectorName:  "clip_global",
				Filter:      filter,
				Limit:       2, // Self + 1 nearest
				WithPayload: true,
				WithVector:  false,
			}

			results, err := h.qdrant.Search(c.Request.Context(), searchReq)
			if err != nil {
				continue
			}

			// Find the nearest neighbor that isn't self
			var nearestScore float32 = 1.0
			for _, result := range results {
				if result.ID != point.ID {
					nearestScore = result.Score
					break
				}
			}

			// Lower scores indicate more anomalous images
			anomalyScore := 1.0 - nearestScore

			// Generate preview URL
			var previewURL string
			if key, ok := point.Payload["key"].(string); ok {
				previewURL, _ = h.storage.GetPresignedDownloadURL(c.Request.Context(), key, 1*time.Hour)
			}

			anomalies = append(anomalies, gin.H{
				"image_id":      point.ID,
				"anomaly_score": anomalyScore,
				"payload":       point.Payload,
				"preview_url":   previewURL,
			})
		}
	}

	// Sort by anomaly score (highest first)
	// For simplicity, we'll return unsorted for now

	c.JSON(http.StatusOK, gin.H{
		"anomalies": anomalies,
		"count":     len(anomalies),
	})
}

// Helper functions

func (h *Handlers) getImageEmbedding(imageData []byte) ([]float32, error) {
	url := h.embedURL + "/embed/image"

	// Create request directly with image data
	req, err := http.NewRequest("POST", url, bytes.NewReader(imageData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service returned %d", resp.StatusCode)
	}

	var result struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Embedding, nil
}

func (h *Handlers) getTextEmbedding(text string) ([]float32, error) {
	url := h.embedURL + "/embed/text"

	reqBody, _ := json.Marshal(map[string]string{
		"text": text,
	})

	resp, err := h.httpClient.Post(url, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service returned %d", resp.StatusCode)
	}

	var result struct {
		Embedding []float32 `json:"embedding"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Embedding, nil
}

func createTables(db *sql.DB) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS image_uploads (
			id SERIAL PRIMARY KEY,
			image_id VARCHAR(255) UNIQUE NOT NULL,
			user_id VARCHAR(255) NOT NULL,
			sha256 VARCHAR(64) NOT NULL,
			phash VARCHAR(16),
			width INTEGER,
			height INTEGER,
			format VARCHAR(32),
			created_at TIMESTAMP NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS feedback (
			id SERIAL PRIMARY KEY,
			image_id VARCHAR(255) NOT NULL,
			user_id VARCHAR(255) NOT NULL,
			action VARCHAR(32) NOT NULL,
			note TEXT,
			created_at TIMESTAMP NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON image_uploads(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_uploads_sha256 ON image_uploads(sha256)`,
		`CREATE INDEX IF NOT EXISTS idx_feedback_image_id ON feedback(image_id)`,
		`CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id)`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			slog.Error("Failed to create table", "error", err, "query", query)
		}
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
