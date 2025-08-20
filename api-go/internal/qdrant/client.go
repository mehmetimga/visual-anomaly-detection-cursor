package qdrant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	CollectionName = "images"
	VectorSize     = 512
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type Vector []float32

type Payload map[string]interface{}

type Point struct {
	ID      interface{}       `json:"id"`
	Vectors map[string]Vector `json:"vectors"`
	Payload Payload           `json:"payload"`
}

type SearchRequest struct {
	Vector      []float32              `json:"vector"`
	VectorName  string                 `json:"vector_name,omitempty"`
	Filter      map[string]interface{} `json:"filter,omitempty"`
	Limit       int                    `json:"limit"`
	WithPayload bool                   `json:"with_payload"`
	WithVector  bool                   `json:"with_vector"`
	Threshold   *float32               `json:"score_threshold,omitempty"`
}

type SearchResult struct {
	ID      string  `json:"id"`
	Score   float32 `json:"score"`
	Payload Payload `json:"payload,omitempty"`
	Vector  Vector  `json:"vector,omitempty"`
}

type CreateCollectionRequest struct {
	Vectors map[string]VectorConfig `json:"vectors"`
}

type VectorConfig struct {
	Size     int    `json:"size"`
	Distance string `json:"distance"`
}

type SearchByPointRequest struct {
	Vector         map[string]interface{} `json:"vector"`
	VectorName     string                 `json:"using,omitempty"`
	Filter         map[string]interface{} `json:"filter,omitempty"`
	Limit          int                    `json:"limit"`
	WithPayload    bool                   `json:"with_payload"`
	WithVector     bool                   `json:"with_vector"`
	ScoreThreshold *float32               `json:"score_threshold,omitempty"`
}

func NewClient(baseURL, apiKey string) (*Client, error) {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	var reqBody []byte
	var err error
	if body != nil {
		reqBody, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("api-key", c.apiKey)
	}

	return c.httpClient.Do(req)
}

func (c *Client) EnsureCollection(ctx context.Context) error {
	// Check if collection exists
	resp, err := c.doRequest(ctx, "GET", "/collections/"+CollectionName, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return nil // Collection already exists
	}

	// Create collection
	createReq := CreateCollectionRequest{
		Vectors: map[string]VectorConfig{
			"clip_global": {
				Size:     VectorSize,
				Distance: "Cosine",
			},
		},
	}

	resp, err = c.doRequest(ctx, "PUT", "/collections/"+CollectionName, createReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to create collection: %s", resp.Status)
	}

	// Create payload indices
	indices := []struct {
		field    string
		dataType string
	}{
		{"tags", "keyword"},
		{"owner_user_id", "keyword"},
		{"created_at", "datetime"},
		{"nsfw_score", "float"},
		{"sha256", "keyword"},
		{"phash", "keyword"},
	}

	for _, idx := range indices {
		indexReq := map[string]interface{}{
			"field_name": idx.field,
			"field_type": idx.dataType,
		}
		resp, err := c.doRequest(ctx, "PUT", fmt.Sprintf("/collections/%s/index", CollectionName), indexReq)
		if err != nil {
			return err
		}
		resp.Body.Close()
	}

	return nil
}

func (c *Client) UpsertPoint(ctx context.Context, point Point) error {
	req := map[string]interface{}{
		"points": []Point{point},
	}

	resp, err := c.doRequest(ctx, "PUT", fmt.Sprintf("/collections/%s/points", CollectionName), req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to upsert point: %s", resp.Status)
	}

	return nil
}

func (c *Client) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/collections/%s/points/search", CollectionName), req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search failed: %s", resp.Status)
	}

	var result struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Result, nil
}

func (c *Client) SearchByPoint(ctx context.Context, vectorName string, pointID interface{}, limit int, filter map[string]interface{}, scoreThreshold *float32) ([]SearchResult, error) {
	req := SearchByPointRequest{
		Vector:         map[string]interface{}{"id": pointID},
		VectorName:     vectorName,
		Filter:         filter,
		Limit:          limit,
		WithPayload:    true,
		WithVector:     false,
		ScoreThreshold: scoreThreshold,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/collections/%s/points/search", CollectionName), req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search failed: %s", resp.Status)
	}

	var result struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Result, nil
}

func (c *Client) GetPoint(ctx context.Context, id string) (*Point, error) {
	resp, err := c.doRequest(ctx, "GET", fmt.Sprintf("/collections/%s/points/%s", CollectionName, id), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get point: %s", resp.Status)
	}

	var result struct {
		Result Point `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result.Result, nil
}

func (c *Client) ScrollPoints(ctx context.Context, filter map[string]interface{}, limit int) ([]Point, error) {
	// Translate simple equality filter map into Qdrant filter structure
	var qFilter map[string]interface{}
	if len(filter) > 0 {
		must := make([]map[string]interface{}, 0, len(filter))
		for k, v := range filter {
			must = append(must, map[string]interface{}{
				"key": k,
				"match": map[string]interface{}{
					"value": v,
				},
			})
		}
		qFilter = map[string]interface{}{"must": must}
	}

	req := map[string]interface{}{
		"filter":       qFilter,
		"limit":        limit,
		"with_payload": true,
		"with_vector":  false,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/collections/%s/points/scroll", CollectionName), req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scroll failed: %s", resp.Status)
	}

	var result struct {
		Result struct {
			Points []Point `json:"points"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Result.Points, nil
}

func (c *Client) DeletePoint(ctx context.Context, id interface{}) error {
	req := map[string]interface{}{
		"points": []interface{}{id},
	}
	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/collections/%s/points/delete", CollectionName), req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to delete point: %s", resp.Status)
	}
	return nil
}
