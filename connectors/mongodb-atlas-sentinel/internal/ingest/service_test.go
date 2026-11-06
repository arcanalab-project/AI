package ingest

import (
	"context"
	"sync"
	"testing"
	"time"

	collogsv1 "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

func TestRoutesTwoProjectsInOneExport(t *testing.T) {
	set := mustSet(t)
	up := &fakeUploader{}
	svc := &Service{
		Projects: func() *config.Set { return set },
		Uploader: up,
		Version:  "0.9.0",
		Now:      func() time.Time { return time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC) },
	}
	body, err := protojson.Marshal(twoProjectExport())
	if err != nil {
		t.Fatal(err)
	}
	result := svc.Ingest(context.Background(), Request{
		ContentType: "application/json",
		Body:        body,
		Principal: auth.Principal{
			TenantID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			ClientID: "11111111-2222-3333-4444-555555555555",
		},
	})
	if result.Status != 200 || result.Accepted != 2 || result.Rejected != 0 {
		t.Fatalf("%+v", result)
	}
	if len(up.batches) != 2 {
		t.Fatalf("sinks %d", len(up.batches))
	}
}

func TestUnknownProjectDoesNotUseAnotherSink(t *testing.T) {
	set := mustSet(t)
	up := &fakeUploader{}
	svc := &Service{Projects: func() *config.Set { return set }, Uploader: up, Now: time.Now}
	body := exportBody(t, "6650aa001122334455667700", "mongod", "nope")
	result := svc.Ingest(context.Background(), Request{
		ContentType: "application/json",
		Body:        body,
		Principal:   auth.Principal{TenantID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ClientID: "11111111-2222-3333-4444-555555555555"},
	})
	if result.Status != 403 || len(up.batches) != 0 {
		t.Fatalf("%+v batches=%d", result, len(up.batches))
	}
}

func TestClientMismatch(t *testing.T) {
	set := mustSet(t)
	up := &fakeUploader{}
	svc := &Service{Projects: func() *config.Set { return set }, Uploader: up, Now: time.Now}
	result := svc.Ingest(context.Background(), Request{
		ContentType: "application/json",
		Body:        exportBody(t, "6650aa001122334455667788", "mongod", "hello"),
		Principal:   auth.Principal{TenantID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ClientID: "22222222-2222-2222-2222-222222222222"},
	})
	if result.Status != 403 {
		t.Fatalf("%+v", result)
	}
}

type fakeUploader struct {
	mu      sync.Mutex
	batches [][]model.Record
}

func (f *fakeUploader) Upload(_ context.Context, _ model.Sink, records []model.Record) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.batches = append(f.batches, records)
	return nil
}

func mustSet(t *testing.T) *config.Set {
	t.Helper()
	set, err := config.Parse([]byte(`{"projects":[
		{"displayName":"tax","atlasOrgId":"6650aa001122334455667701","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"],"sink":{"dceEndpoint":"https://one.westeurope-1.ingest.monitor.azure.com","dcrImmutableId":"dcr-0123456789abcdef0123456789abcdef","stream":"Custom-MongoDBAtlasLogs_CL","table":"MongoDBAtlasLogs_CL"}},
		{"displayName":"customs","atlasOrgId":"6650aa001122334455667702","atlasGroupId":"6650aa001122334455667799","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"],"sink":{"dceEndpoint":"https://two.westeurope-1.ingest.monitor.azure.com","dcrImmutableId":"dcr-fedcba9876543210fedcba9876543210","stream":"Custom-MongoDBAtlasLogs_CL","table":"MongoDBAtlasLogs_CL"}}
	]}`), model.Sink{})
	if err != nil {
		t.Fatal(err)
	}
	return set
}

func twoProjectExport() *collogsv1.ExportLogsServiceRequest {
	return &collogsv1.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{
		resource("6650aa001122334455667788", "tax", "one host"),
		resource("6650aa001122334455667799", "customs", "other host"),
	}}
}

func exportBody(t *testing.T, group, scope, msg string) []byte {
	t.Helper()
	b, err := protojson.Marshal(&collogsv1.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{resource(group, scope, msg)}})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func resource(group, scope, msg string) *logsv1.ResourceLogs {
	return &logsv1.ResourceLogs{
		Resource: &resourcev1.Resource{Attributes: []*commonv1.KeyValue{strAttr("mongodb.atlas.group.id", group)}},
		ScopeLogs: []*logsv1.ScopeLogs{{
			Scope:      &commonv1.InstrumentationScope{Name: scope},
			LogRecords: []*logsv1.LogRecord{{Body: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: msg}}, TimeUnixNano: 1_700_000_000_000_000_000}},
		}},
	}
}

func strAttr(k, v string) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: k, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: v}}}
}
