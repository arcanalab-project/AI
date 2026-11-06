package config

import (
	"os"
	"strings"
	"testing"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

func TestExampleFile(t *testing.T) {
	set, err := LoadFile("../../config/projects.example.yaml", testSink())
	if err != nil {
		t.Fatal(err)
	}
	if set.Len() < 2 {
		t.Fatalf("example has %d projects", set.Len())
	}
	if _, ok := set.ByGroup("6650aa001122334455667788"); !ok {
		t.Fatal("missing first example project")
	}
	ids := set.TenantIDs()
	if len(ids) < 2 {
		t.Fatalf("expected multiple tenants, got %v", ids)
	}
}

func TestDuplicateGroupRejected(t *testing.T) {
	body := []byte(`{"projects":[
	  {"displayName":"a","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"]},
	  {"displayName":"b","atlasGroupId":"6650AA001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"]}
	]}`)
	_, err := Parse(body, testSink())
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("got %v", err)
	}
}

func TestEmptyAllowlistRejected(t *testing.T) {
	body := []byte(`{"projects":[{"displayName":"a","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":[]}]}`)
	_, err := Parse(body, testSink())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestDefaultSinkApplied(t *testing.T) {
	body := []byte(`{"projects":[{"displayName":"a","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"]}]}`)
	set, err := Parse(body, testSink())
	if err != nil {
		t.Fatal(err)
	}
	p, _ := set.ByGroup("6650aa001122334455667788")
	if p.Sink.DCRImmutableID != testSink().DCRImmutableID {
		t.Fatalf("sink not applied: %+v", p.Sink)
	}
	if len(p.LogTypes) != 5 {
		t.Fatalf("default log types: %v", p.LogTypes)
	}
}

func TestDisabledProject(t *testing.T) {
	body := []byte(`{"projects":[{"displayName":"a","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"],"enabled":false}]}`)
	set, err := Parse(body, testSink())
	if err != nil {
		t.Fatal(err)
	}
	p, _ := set.ByGroup("6650aa001122334455667788")
	if p.IsEnabled() {
		t.Fatal("expected disabled")
	}
}

func TestParseProjectValues(t *testing.T) {
	raw := `{"displayName":"a","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"]}`
	set, err := ParseProjectValues([]string{raw}, testSink())
	if err != nil {
		t.Fatal(err)
	}
	if set.Len() != 1 {
		t.Fatal(set.Len())
	}
}

func TestExamplesHaveNoSecretMaterial(t *testing.T) {
	paths := []string{
		"../../config/projects.example.yaml",
		"../../infra/parameters.example.json",
	}
	forbidden := []string{"BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY", "client_secret=", "AccountKey="}
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(body)
		for _, f := range forbidden {
			if strings.Contains(text, f) {
				t.Errorf("%s contains %s", path, f)
			}
		}
	}
}

func testSink() model.Sink {
	return model.Sink{
		DCEEndpoint:    "https://dce-example.westeurope-1.ingest.monitor.azure.com",
		DCRImmutableID: "dcr-0123456789abcdef0123456789abcdef",
		Stream:         "Custom-MongoDBAtlasLogs_CL",
		Table:          "MongoDBAtlasLogs_CL",
	}
}
