package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"log/slog"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	sloggin "github.com/samber/slog-gin"
	"github.com/visual-anomaly/api-go/internal/auth"
	"github.com/visual-anomaly/api-go/internal/handlers"
	"github.com/visual-anomaly/api-go/internal/middleware"
	"github.com/visual-anomaly/api-go/internal/qdrant"
	"github.com/visual-anomaly/api-go/internal/storage"
)

func main() {
	// Load environment variables
	_ = godotenv.Load()

	// Setup logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// Check if running as worker
	if len(os.Args) > 1 && os.Args[1] == "worker" {
		runWorker()
		return
	}

	// Initialize services
	ctx := context.Background()

	// Initialize storage
	storageClient, err := storage.NewMinioClient(
		os.Getenv("S3_ENDPOINT"),
		os.Getenv("S3_ACCESS_KEY"),
		os.Getenv("S3_SECRET_KEY"),
		os.Getenv("S3_BUCKET"),
		os.Getenv("S3_REGION"),
	)
	if err != nil {
		log.Fatal("Failed to initialize storage client:", err)
	}

	// Initialize Qdrant client
	qdrantClient, err := qdrant.NewClient(os.Getenv("QDRANT_URL"), os.Getenv("QDRANT_API_KEY"))
	if err != nil {
		log.Fatal("Failed to initialize Qdrant client:", err)
	}

	// Ensure collections exist
	if err := qdrantClient.EnsureCollection(ctx); err != nil {
		log.Fatal("Failed to ensure Qdrant collection:", err)
	}

	// Initialize auth service
	authService := auth.NewService(os.Getenv("JWT_SECRET"))

	// Initialize handlers
	h := handlers.New(storageClient, qdrantClient, authService, os.Getenv("EMBED_URL"))

	// Setup Gin router
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(sloggin.New(logger))
	r.Use(middleware.RequestID())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health check endpoints
	r.GET("/healthz", h.Health)
	r.GET("/readyz", h.Ready)
	r.GET("/metrics", h.Metrics)

	// API routes
	api := r.Group("/api")
	{
		// Public routes
		api.POST("/auth/login", h.Login)
		api.POST("/auth/register", h.Register)

		// Protected routes
		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware(authService))
		{
			// Upload & ingest
			protected.POST("/images/presign", h.GetPresignedURL)
			protected.POST("/images/ingest", h.IngestImage)
			protected.GET("/images", h.ListImages)

			// Search & discovery
			protected.POST("/search/similar", h.SearchSimilar)
			protected.POST("/search/cluster", h.ClusterImages)
			protected.POST("/deduplicate", h.Deduplicate)

			protected.DELETE("/images/:id", h.DeleteImage)
			protected.POST("/images/:id/reindex", h.ReindexImage)
			protected.POST("/images/:id/thumbnail", h.RegenerateThumbnail)

			protected.POST("/feedback", h.SubmitFeedback)
			protected.GET("/qa/anomalies", h.GetAnomalies)
		}
	}

	// Start server
	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Failed to start server:", err)
		}
	}()

	logger.Info("Server started", "port", port)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown:", "error", err)
	}

	logger.Info("Server exited")
}

func runWorker() {
	// Worker implementation for background jobs
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	workerType := ""
	if len(os.Args) > 2 && os.Args[2] == "--type=thumbnailer" {
		workerType = "thumbnailer"
	}

	logger.Info("Starting worker", "type", workerType)

	// TODO: Implement worker logic
	// For now, just keep the worker running
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Worker shutting down")
}
