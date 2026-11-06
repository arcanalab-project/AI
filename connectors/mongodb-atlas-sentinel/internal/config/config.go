// Package config is the allowlist of Atlas projects served by one deployment.
// The file holds identifiers only. Credentials stay in Key Vault.
package config

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"gopkg.in/yaml.v3"
)

const maxFileBytes = 1 << 20

var (
	groupIDPattern = regexp.MustCompile(`(?i)^[a-f0-9]{24}$`)
	guidPattern    = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	logTypes       = map[string]struct{}{
		"MONGOD": {}, "MONGOS": {}, "MONGOD_AUDIT": {}, "MONGOS_AUDIT": {}, "EVENTS": {},
	}
)

// DefaultLogTypes is the Atlas OTel export set used when a project omits logTypes.
func DefaultLogTypes() []string {
	return []string{"MONGOD", "MONGOS", "MONGOD_AUDIT", "MONGOS_AUDIT", "EVENTS"}
}

// Project is one Atlas project (group) and the Sentinel sink it may write.
type Project struct {
	DisplayName      string     `json:"displayName" yaml:"displayName"`
	AtlasOrgID       string     `json:"atlasOrgId" yaml:"atlasOrgId"`
	AtlasGroupID     string     `json:"atlasGroupId" yaml:"atlasGroupId"`
	EntraTenantID    string     `json:"entraTenantId" yaml:"entraTenantId"`
	AllowedClientIDs []string   `json:"allowedClientIds" yaml:"allowedClientIds"`
	LogIntegrationID string     `json:"logIntegrationId,omitempty" yaml:"logIntegrationId,omitempty"`
	LogTypes         []string   `json:"logTypes,omitempty" yaml:"logTypes,omitempty"`
	Enabled          *bool      `json:"enabled,omitempty" yaml:"enabled,omitempty"`
	Sink             model.Sink `json:"sink,omitempty" yaml:"sink,omitempty"`
}

// IsEnabled treats a missing flag as enabled.
func (p Project) IsEnabled() bool {
	return p.Enabled == nil || *p.Enabled
}

// File is the on-disk document.
type File struct {
	Projects []Project `json:"projects" yaml:"projects"`
}

// Set is an immutable, indexed allowlist.
type Set struct {
	Projects []Project
	byGroup  map[string]Project
}

// Len is the number of projects.
func (s *Set) Len() int {
	if s == nil {
		return 0
	}
	return len(s.Projects)
}

// ByGroup returns the project for an Atlas group id.
func (s *Set) ByGroup(groupID string) (Project, bool) {
	if s == nil {
		return Project{}, false
	}
	p, ok := s.byGroup[strings.ToLower(groupID)]
	return p, ok
}

// TenantIDs is the Entra tenant allowlist used to bound JWKS fetches.
func (s *Set) TenantIDs() []string {
	if s == nil {
		return nil
	}
	seen := map[string]struct{}{}
	var out []string
	for _, p := range s.Projects {
		id := strings.ToLower(p.EntraTenantID)
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, p.EntraTenantID)
	}
	return out
}

// LoadFile reads a YAML or JSON allowlist and fills an empty sink from defaultSink.
func LoadFile(path string, defaultSink model.Sink) (*Set, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, maxFileBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxFileBytes {
		return nil, fmt.Errorf("project config exceeds %d bytes", maxFileBytes)
	}
	return Parse(body, defaultSink)
}

// Parse validates a document and applies defaultSink where a project omits one.
func Parse(body []byte, defaultSink model.Sink) (*Set, error) {
	if len(bytes.TrimSpace(body)) == 0 {
		return nil, errors.New("project config is empty")
	}
	var doc File
	dec := yaml.NewDecoder(bytes.NewReader(body))
	dec.KnownFields(true)
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("parse project config: %w", err)
	}
	return assemble(doc.Projects, defaultSink, true)
}

// ParseProjectValues parses one JSON object per App Configuration entry.
func ParseProjectValues(values []string, defaultSink model.Sink) (*Set, error) {
	projects := make([]Project, 0, len(values))
	for i, raw := range values {
		var p Project
		dec := json.NewDecoder(strings.NewReader(raw))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&p); err != nil {
			return nil, fmt.Errorf("project value %d: %w", i, err)
		}
		projects = append(projects, p)
	}
	return assemble(projects, defaultSink, true)
}

// New validates projects and indexes them by group id.
func New(projects []Project, defaultSink model.Sink) (*Set, error) {
	return assemble(projects, defaultSink, true)
}

// LoadRemoteAllowEmptySink reads projects that do not carry a Sentinel sink.
// The token publisher uses this. Ingest does not.
func LoadRemoteAllowEmptySink(ctx context.Context, lister ValueLister) (*Set, error) {
	values, err := lister.Values(ctx)
	if err != nil {
		return nil, err
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("app configuration returned no projects")
	}
	projects := make([]Project, 0, len(values))
	for i, raw := range values {
		var p Project
		dec := json.NewDecoder(strings.NewReader(raw))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&p); err != nil {
			return nil, fmt.Errorf("project value %d: %w", i, err)
		}
		projects = append(projects, p)
	}
	return assemble(projects, model.Sink{}, false)
}

// LoadFileAllowEmptySink is the file equivalent of LoadRemoteAllowEmptySink.
func LoadFileAllowEmptySink(path string) (*Set, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, maxFileBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxFileBytes {
		return nil, fmt.Errorf("project config exceeds %d bytes", maxFileBytes)
	}
	var doc File
	dec := yaml.NewDecoder(bytes.NewReader(body))
	dec.KnownFields(true)
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("parse project config: %w", err)
	}
	return assemble(doc.Projects, model.Sink{}, false)
}

func assemble(projects []Project, defaultSink model.Sink, requireSink bool) (*Set, error) {
	if len(projects) == 0 {
		return nil, errors.New("at least one Atlas project is required")
	}
	if len(projects) > 5000 {
		return nil, errors.New("project config exceeds 5000 entries")
	}
	out := make([]Project, len(projects))
	index := make(map[string]Project, len(projects))
	for i, p := range projects {
		p.AtlasGroupID = strings.ToLower(strings.TrimSpace(p.AtlasGroupID))
		p.AtlasOrgID = strings.ToLower(strings.TrimSpace(p.AtlasOrgID))
		p.EntraTenantID = strings.ToLower(strings.TrimSpace(p.EntraTenantID))
		p.DisplayName = strings.TrimSpace(p.DisplayName)
		p.LogIntegrationID = strings.ToLower(strings.TrimSpace(p.LogIntegrationID))
		if err := validateProject(p); err != nil {
			return nil, fmt.Errorf("projects[%d] %s: %w", i, p.AtlasGroupID, err)
		}
		if p.Sink.Empty() {
			p.Sink = defaultSink
		}
		if requireSink && p.Sink.Empty() {
			return nil, fmt.Errorf("projects[%d] %s: sink is empty and no default sink is configured", i, p.AtlasGroupID)
		}
		clients := make([]string, 0, len(p.AllowedClientIDs))
		seenClient := map[string]struct{}{}
		for _, c := range p.AllowedClientIDs {
			c = strings.ToLower(strings.TrimSpace(c))
			if !guidPattern.MatchString(c) {
				return nil, fmt.Errorf("projects[%d]: allowed client id %q is not a GUID", i, c)
			}
			if _, ok := seenClient[c]; ok {
				continue
			}
			seenClient[c] = struct{}{}
			clients = append(clients, c)
		}
		p.AllowedClientIDs = clients
		if len(p.LogTypes) == 0 {
			p.LogTypes = DefaultLogTypes()
		}
		if _, ok := index[p.AtlasGroupID]; ok {
			return nil, fmt.Errorf("duplicate atlas group id %s", p.AtlasGroupID)
		}
		out[i] = p
		index[p.AtlasGroupID] = p
	}
	return &Set{Projects: out, byGroup: index}, nil
}

func validateProject(p Project) error {
	if p.DisplayName == "" || len(p.DisplayName) > 80 {
		return errors.New("displayName is required and must be at most 80 characters")
	}
	if strings.ContainsAny(p.DisplayName, "\r\n\t") {
		return errors.New("displayName contains a control character")
	}
	if !groupIDPattern.MatchString(p.AtlasGroupID) {
		return errors.New("atlasGroupId must be 24 hex characters")
	}
	if p.AtlasOrgID != "" && !groupIDPattern.MatchString(p.AtlasOrgID) {
		return errors.New("atlasOrgId must be 24 hex characters")
	}
	if !guidPattern.MatchString(p.EntraTenantID) {
		return errors.New("entraTenantId must be a GUID")
	}
	if len(p.AllowedClientIDs) == 0 {
		return errors.New("allowedClientIds must list at least one Entra application")
	}
	if p.LogIntegrationID != "" && !groupIDPattern.MatchString(p.LogIntegrationID) {
		return errors.New("logIntegrationId must be 24 hex characters")
	}
	if len(p.LogTypes) > 10 {
		return errors.New("logTypes exceeds the Atlas limit of 10")
	}
	for _, lt := range p.LogTypes {
		if _, ok := logTypes[lt]; !ok {
			return fmt.Errorf("unsupported log type %s", lt)
		}
	}
	return nil
}
