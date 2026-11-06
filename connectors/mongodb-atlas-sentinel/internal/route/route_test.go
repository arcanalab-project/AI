package route

import (
	"errors"
	"testing"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
)

func TestResolveGroup(t *testing.T) {
	log := otlp.DecodedLog{ResourceAttrs: map[string]any{"mongodb.atlas.group.id": "6650aa001122334455667788"}}
	id, err := ResolveGroup(log, "")
	if err != nil || id != "6650aa001122334455667788" {
		t.Fatalf("%s %v", id, err)
	}
	id, err = ResolveGroup(otlp.DecodedLog{}, "6650aa001122334455667788")
	if err != nil || id != "6650aa001122334455667788" {
		t.Fatalf("header %s %v", id, err)
	}
	if _, err := ResolveGroup(log, "6650aa001122334455667799"); !errors.Is(err, ErrBadRecord) {
		t.Fatal(err)
	}
	if _, err := ResolveGroup(otlp.DecodedLog{}, ""); !errors.Is(err, ErrBadRecord) {
		t.Fatal(err)
	}
}

func TestAuthorize(t *testing.T) {
	p := config.Project{
		AtlasGroupID:     "6650aa001122334455667788",
		AtlasOrgID:       "6650aa001122334455667701",
		EntraTenantID:    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		AllowedClientIDs: []string{"11111111-2222-3333-4444-555555555555"},
	}
	good := auth.Principal{TenantID: p.EntraTenantID, ClientID: p.AllowedClientIDs[0]}
	if err := Authorize(p, good, p.AtlasOrgID); err != nil {
		t.Fatal(err)
	}
	if err := Authorize(p, auth.Principal{TenantID: p.EntraTenantID, ClientID: "22222222-2222-2222-2222-222222222222"}, ""); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	if err := Authorize(p, good, "6650aa001122334455667702"); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	off := false
	p.Enabled = &off
	if err := Authorize(p, good, ""); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
}
