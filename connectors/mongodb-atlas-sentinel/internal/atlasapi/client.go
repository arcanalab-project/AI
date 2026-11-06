// Package atlasapi updates Atlas OpenTelemetry log integrations.
package atlasapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/redact"
)

const (
	// APIVersion is the Atlas Admin API v2 date this client sends.
	APIVersion = "application/vnd.atlas.2025-03-12+json"
	// GroupHeader is the per-project routing hint carried with the Entra token.
	GroupHeader = "X-Atlas-Group-Id"
)

// Header is one otelSuppliedHeaders entry.
type Header struct {
	Name  string `json:"name"`
	Value string `json:"value,omitempty"`
}

// OTelExport is the project log integration body.
type OTelExport struct {
	Type     string   `json:"type"`
	LogTypes []string `json:"logTypes"`
	Endpoint string   `json:"otelEndpoint"`
	Headers  []Header `json:"otelSuppliedHeaders"`
}

// Client calls the Atlas Admin API with a service-account token.
// The service-account secret is supplied by Secret and is not stored here.
type Client struct {
	BaseURL  string
	HTTP     *http.Client
	ClientID string
	Secret   func(ctx context.Context) (string, error)
	mu       sync.Mutex
	token    string
	tokenExp time.Time
	Now      func() time.Time
}

// PutOTel replaces the headers on an existing integration.
func (c *Client) PutOTel(ctx context.Context, groupID, integrationID string, body OTelExport) error {
	if integrationID == "" {
		return fmt.Errorf("log integration id is required")
	}
	return c.write(ctx, http.MethodPut, c.resource(groupID, integrationID), body)
}

// CreateOTel creates an integration and returns its id. The response redacts
// header values, so the id is the only field this method returns.
func (c *Client) CreateOTel(ctx context.Context, groupID string, body OTelExport) (string, error) {
	var created struct {
		ID string `json:"id"`
	}
	if err := c.writeJSON(ctx, http.MethodPost, c.resource(groupID, ""), body, &created); err != nil {
		return "", err
	}
	if created.ID == "" {
		return "", fmt.Errorf("atlas did not return an integration id")
	}
	return created.ID, nil
}

func (c *Client) write(ctx context.Context, method, rawURL string, body OTelExport) error {
	return c.writeJSON(ctx, method, rawURL, body, nil)
}

func (c *Client) writeJSON(ctx context.Context, method, rawURL string, body OTelExport, dest any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	token, secret, err := c.accessToken(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", APIVersion)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http().Do(req)
	if err != nil {
		return fmt.Errorf("atlas request failed")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("atlas status %d: %s", resp.StatusCode, redact.Secrets(string(respBody), secret, token))
	}
	if dest != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, dest); err != nil {
			return fmt.Errorf("atlas response")
		}
	}
	return nil
}

func (c *Client) accessToken(ctx context.Context) (string, string, error) {
	secret, err := c.Secret(ctx)
	if err != nil {
		return "", "", err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && c.now().Before(c.tokenExp.Add(-time.Minute)) {
		return c.token, secret, nil
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.BaseURL, "/")+"/api/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", secret, err
	}
	req.SetBasicAuth(c.ClientID, secret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http().Do(req)
	if err != nil {
		return "", secret, fmt.Errorf("atlas token request failed")
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode != http.StatusOK {
		return "", secret, fmt.Errorf("atlas token status %d: %s", resp.StatusCode, redact.Secrets(string(raw), secret))
	}
	var doc struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil || doc.AccessToken == "" {
		return "", secret, fmt.Errorf("atlas token response")
	}
	ttl := time.Duration(doc.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	c.token = doc.AccessToken
	c.tokenExp = c.now().Add(ttl)
	return c.token, secret, nil
}

func (c *Client) resource(groupID, integrationID string) string {
	base := strings.TrimRight(c.BaseURL, "/") + "/api/atlas/v2/groups/" + url.PathEscape(groupID) + "/logIntegrations"
	if integrationID == "" {
		return base
	}
	return base + "/" + url.PathEscape(integrationID)
}

func (c *Client) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (c *Client) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}
