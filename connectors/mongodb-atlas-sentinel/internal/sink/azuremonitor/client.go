// Package azuremonitor uploads rows with a managed identity.
// The credential is never read from a configuration file.
package azuremonitor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/monitor/ingestion/azlogs"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/sink"
)

// Client posts JSON batches to a Data Collection Endpoint.
type Client struct {
	cred    azcore.TokenCredential
	mu      sync.Mutex
	clients map[string]*azlogs.Client
}

// New returns a client that creates one Logs Ingestion client per endpoint.
func New(cred azcore.TokenCredential) *Client {
	return &Client{cred: cred, clients: map[string]*azlogs.Client{}}
}

// Upload validates the sink, splits the batch, and retries throttling.
func (c *Client) Upload(ctx context.Context, dest model.Sink, records []model.Record) error {
	if err := sink.Validate(dest); err != nil {
		return err
	}
	if len(records) == 0 {
		return nil
	}
	batches, skipped := sink.Split(records, sink.MaxBatchBytes)
	if skipped > 0 {
		return fmt.Errorf("%d records exceed the ingestion request size", skipped)
	}
	client, err := c.client(dest.DCEEndpoint)
	if err != nil {
		return err
	}
	for _, batch := range batches {
		body, err := json.Marshal(batch)
		if err != nil {
			return err
		}
		if err := uploadRetry(ctx, func() error {
			_, err := client.Upload(ctx, dest.DCRImmutableID, dest.Stream, body, nil)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) client(endpoint string) (*azlogs.Client, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if existing, ok := c.clients[endpoint]; ok {
		return existing, nil
	}
	client, err := azlogs.NewClient(endpoint, c.cred, nil)
	if err != nil {
		return nil, err
	}
	c.clients[endpoint] = client
	return client, nil
}

func uploadRetry(ctx context.Context, fn func() error) error {
	var last error
	backoff := 200 * time.Millisecond
	for attempt := 0; attempt < 4; attempt++ {
		err := fn()
		if err == nil {
			return nil
		}
		last = scrub(err)
		var resp *azcore.ResponseError
		if !errors.As(err, &resp) || (resp.StatusCode != 429 && resp.StatusCode != 503 && resp.StatusCode != 500) {
			return last
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
	}
	return last
}

func scrub(err error) error {
	var resp *azcore.ResponseError
	if errors.As(err, &resp) {
		return fmt.Errorf("logs ingestion status %d", resp.StatusCode)
	}
	return fmt.Errorf("logs ingestion failed")
}
