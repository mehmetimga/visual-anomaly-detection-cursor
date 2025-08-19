package storage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinioClient struct {
	client *minio.Client
	bucket string
}

func NewMinioClient(endpoint, accessKey, secretKey, bucket, region string) (*MinioClient, error) {
	// Parse endpoint to check if it's using HTTPS
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}

	useSSL := u.Scheme == "https"

	// Initialize minio client
	minioClient, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: region,
	})
	if err != nil {
		return nil, err
	}

	// Create bucket if it doesn't exist
	ctx := context.Background()
	exists, err := minioClient.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}

	if !exists {
		err = minioClient.MakeBucket(ctx, bucket, minio.MakeBucketOptions{Region: region})
		if err != nil {
			return nil, err
		}
	}

	return &MinioClient{
		client: minioClient,
		bucket: bucket,
	}, nil
}

func (m *MinioClient) GetPresignedUploadURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	url, err := m.client.PresignedPutObject(ctx, m.bucket, key, expiry)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}

func (m *MinioClient) GetPresignedDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	url, err := m.client.PresignedGetObject(ctx, m.bucket, key, expiry, nil)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}

func (m *MinioClient) DownloadFile(ctx context.Context, key string) ([]byte, error) {
	object, err := m.client.GetObject(ctx, m.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer object.Close()

	data, err := io.ReadAll(object)
	if err != nil {
		return nil, err
	}

	return data, nil
}

func (m *MinioClient) UploadFile(ctx context.Context, key string, data []byte, contentType string) error {
	_, err := m.client.PutObject(ctx, m.bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}

func (m *MinioClient) DeleteFile(ctx context.Context, key string) error {
	return m.client.RemoveObject(ctx, m.bucket, key, minio.RemoveObjectOptions{})
}

func (m *MinioClient) FileExists(ctx context.Context, key string) (bool, error) {
	_, err := m.client.StatObject(ctx, m.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		errResponse := minio.ToErrorResponse(err)
		if errResponse.Code == "NoSuchKey" {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func ComputeSHA256(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func GenerateImageKey(userID, imageID string) string {
	return fmt.Sprintf("images/%s/%s", userID, imageID)
}

func GenerateThumbnailKey(userID, imageID string) string {
	return fmt.Sprintf("thumbnails/%s/%s.webp", userID, imageID)
}
