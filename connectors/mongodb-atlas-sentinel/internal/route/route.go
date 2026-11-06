// Package route binds an authenticated caller to one allowlisted Atlas project.
package route

import (
	"errors"
	"strings"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
)

var (
	// ErrForbidden means the token is valid and the record is not allowed.
	ErrForbidden = errors.New("forbidden")
	// ErrBadRecord means the export did not identify a single Atlas project.
	ErrBadRecord = errors.New("bad record")
)

// Decision is the project a record may be written as.
type Decision struct {
	Project config.Project
}

// ResolveGroup picks the Atlas group id for one record.
// A header and an attribute must agree when both are present.
func ResolveGroup(log otlp.DecodedLog, header string) (string, error) {
	header = strings.ToLower(strings.TrimSpace(header))
	record, resource := log.GroupIDs()
	record = strings.ToLower(record)
	resource = strings.ToLower(resource)
	if record != "" && resource != "" && record != resource {
		return "", ErrBadRecord
	}
	attr := record
	if attr == "" {
		attr = resource
	}
	switch {
	case header != "" && attr != "" && header != attr:
		return "", ErrBadRecord
	case attr != "":
		return attr, nil
	case header != "":
		return header, nil
	default:
		return "", ErrBadRecord
	}
}

// Authorize checks the project allowlist against the token tenant and client.
func Authorize(project config.Project, principal auth.Principal, attrOrg string) error {
	if !project.IsEnabled() {
		return ErrForbidden
	}
	if !strings.EqualFold(project.EntraTenantID, principal.TenantID) {
		return ErrForbidden
	}
	ok := false
	for _, id := range project.AllowedClientIDs {
		if strings.EqualFold(id, principal.ClientID) {
			ok = true
			break
		}
	}
	if !ok {
		return ErrForbidden
	}
	attrOrg = strings.ToLower(strings.TrimSpace(attrOrg))
	if project.AtlasOrgID != "" && attrOrg != "" && attrOrg != project.AtlasOrgID {
		return ErrForbidden
	}
	return nil
}

// OrgAttr returns a single org id or an error when the two sides disagree.
func OrgAttr(log otlp.DecodedLog) (string, error) {
	record, resource := log.OrgIDs()
	record = strings.ToLower(record)
	resource = strings.ToLower(resource)
	if record != "" && resource != "" && record != resource {
		return "", ErrBadRecord
	}
	if record != "" {
		return record, nil
	}
	return resource, nil
}
