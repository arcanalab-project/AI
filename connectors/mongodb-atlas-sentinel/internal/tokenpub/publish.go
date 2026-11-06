package tokenpub

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/atlasapi"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/redact"
)

// Publisher acquires one Entra token and installs it on each Atlas project
// that belongs to the publisher's tenant.
type Publisher struct {
	Projects  func() *config.Set
	Validator *auth.Validator
	Signer    Signer
	Atlas     *atlasapi.Client
	HTTP      *http.Client
	TokenURL  string
	TenantID  string
	ClientID  string
	Scope     string
	Endpoint  string
	Logger    *slog.Logger
	Now       func() time.Time
}

// Once refreshes every eligible project. Missing integration ids are skipped
// so a loop cannot create a duplicate integration on every pass.
func (p *Publisher) Once(ctx context.Context) error {
	token, err := p.accessToken(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, project := range p.Projects().Projects {
		if !project.IsEnabled() {
			continue
		}
		if !strings.EqualFold(project.EntraTenantID, p.TenantID) {
			p.log().Warn("skip project outside publisher tenant", "groupId", project.AtlasGroupID)
			continue
		}
		if !clientAllowed(project, p.ClientID) {
			errs = append(errs, fmt.Errorf("project %s does not allow the publisher client", project.AtlasGroupID))
			continue
		}
		if project.LogIntegrationID == "" {
			errs = append(errs, fmt.Errorf("project %s has no log integration id; run bootstrap", project.AtlasGroupID))
			continue
		}
		if err := p.push(ctx, project, token, false); err != nil {
			errs = append(errs, err)
		}
	}
	return join(errs)
}

// Bootstrap creates integrations that do not yet have an id and prints
// groupId and integrationId pairs to out. It does not print the token.
func (p *Publisher) Bootstrap(ctx context.Context, out io.Writer) error {
	token, err := p.accessToken(ctx)
	if err != nil {
		return err
	}
	for _, project := range p.Projects().Projects {
		if !project.IsEnabled() || !strings.EqualFold(project.EntraTenantID, p.TenantID) {
			continue
		}
		if project.LogIntegrationID != "" {
			fmt.Fprintf(out, "groupId=%s integrationId=%s\n", project.AtlasGroupID, project.LogIntegrationID)
			continue
		}
		id, err := p.create(ctx, project, token)
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "groupId=%s integrationId=%s\n", project.AtlasGroupID, id)
	}
	return nil
}

func (p *Publisher) push(ctx context.Context, project config.Project, token string, create bool) error {
	headers, included, err := BuildHeaders(token, project.AtlasGroupID)
	if err != nil {
		return fmt.Errorf("project %s: %w", project.AtlasGroupID, err)
	}
	body := p.body(project, headers)
	if create {
		_, err = p.Atlas.CreateOTel(ctx, project.AtlasGroupID, body)
	} else {
		err = p.Atlas.PutOTel(ctx, project.AtlasGroupID, project.LogIntegrationID, body)
	}
	if err != nil {
		return fmt.Errorf("project %s: %s", project.AtlasGroupID, redact.Secrets(err.Error(), token))
	}
	p.log().Info("updated atlas otel integration", "groupId", project.AtlasGroupID, "groupHeader", included)
	return nil
}

func (p *Publisher) create(ctx context.Context, project config.Project, token string) (string, error) {
	headers, _, err := BuildHeaders(token, project.AtlasGroupID)
	if err != nil {
		return "", err
	}
	id, err := p.Atlas.CreateOTel(ctx, project.AtlasGroupID, p.body(project, headers))
	if err != nil {
		return "", fmt.Errorf("project %s: %s", project.AtlasGroupID, redact.Secrets(err.Error(), token))
	}
	p.log().Info("created atlas otel integration", "groupId", project.AtlasGroupID, "integrationId", id)
	return id, nil
}

func (p *Publisher) body(project config.Project, headers []atlasapi.Header) atlasapi.OTelExport {
	types := project.LogTypes
	if len(types) == 0 {
		types = config.DefaultLogTypes()
	}
	return atlasapi.OTelExport{
		Type:     "OTEL_LOG_EXPORT",
		LogTypes: types,
		Endpoint: p.Endpoint,
		Headers:  headers,
	}
}

func (p *Publisher) accessToken(ctx context.Context) (string, error) {
	assertion, err := p.Signer.Assertion(ctx, p.TokenURL, p.ClientID, p.now())
	if err != nil {
		return "", err
	}
	form := url.Values{}
	form.Set("client_id", p.ClientID)
	form.Set("scope", p.Scope)
	form.Set("grant_type", "client_credentials")
	form.Set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
	form.Set("client_assertion", assertion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := p.http().Do(req)
	if err != nil {
		return "", fmt.Errorf("entra token request failed")
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 16384))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("entra token status %d: %s", resp.StatusCode, redact.Secrets(string(raw), assertion))
	}
	var doc struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil || doc.AccessToken == "" {
		return "", fmt.Errorf("entra token response")
	}
	if _, err := p.Validator.Validate(ctx, doc.AccessToken); err != nil {
		return "", fmt.Errorf("entra token was not acceptable to ingest: %s", auth.FormatReason(err))
	}
	return doc.AccessToken, nil
}

func (p *Publisher) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}

func (p *Publisher) http() *http.Client {
	if p.HTTP != nil {
		return p.HTTP
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (p *Publisher) log() *slog.Logger {
	if p.Logger != nil {
		return p.Logger
	}
	return slog.Default()
}

func clientAllowed(project config.Project, clientID string) bool {
	for _, id := range project.AllowedClientIDs {
		if strings.EqualFold(id, clientID) {
			return true
		}
	}
	return false
}

func join(errs []error) error {
	if len(errs) == 0 {
		return nil
	}
	parts := make([]string, 0, len(errs))
	for _, err := range errs {
		parts = append(parts, err.Error())
	}
	return fmt.Errorf("%s", strings.Join(parts, "; "))
}
