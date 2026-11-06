package otlp

import (
	"testing"
	"time"

	collogsv1 "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/proto"
)

func TestRoundTripProtobufAndJSON(t *testing.T) {
	req := sampleRequest()
	pb, err := proto.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	logs, err := Decode("application/x-protobuf", pb)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("len %d", len(logs))
	}
	rec, res := logs[0].GroupIDs()
	if res != "6650aa001122334455667788" || rec != "" {
		t.Fatalf("group record=%s resource=%s", rec, res)
	}
	if logs[0].ClusterName() != "tax-prod" || logs[0].HostName() == "" {
		t.Fatalf("identity %+v", logs[0])
	}
	if logs[0].Body == "" || logs[0].EventTime.IsZero() {
		t.Fatalf("body/time missing")
	}
	js, ctype, err := ResponseBody("application/json", 0, "")
	if err != nil || ctype != "application/json" || len(js) == 0 {
		t.Fatalf("response %s %v %s", ctype, err, js)
	}
}

func TestRejectsUnknownContentType(t *testing.T) {
	if _, err := Decode("text/plain", []byte("x")); err == nil {
		t.Fatal("expected error")
	}
}

func sampleRequest() *collogsv1.ExportLogsServiceRequest {
	return &collogsv1.ExportLogsServiceRequest{
		ResourceLogs: []*logsv1.ResourceLogs{{
			Resource: &resourcev1.Resource{
				Attributes: []*commonv1.KeyValue{
					kv("mongodb.atlas.group.id", "6650aa001122334455667788"),
					kv("mongodb.atlas.cluster.name", "tax-prod"),
					kv("host.name", "atlas-shard-00-00.example.mongodb.net"),
				},
			},
			ScopeLogs: []*logsv1.ScopeLogs{{
				Scope: &commonv1.InstrumentationScope{Name: "mongodb-atlas"},
				LogRecords: []*logsv1.LogRecord{{
					TimeUnixNano:   uint64(time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC).UnixNano()),
					SeverityText:   "INFO",
					SeverityNumber: logsv1.SeverityNumber_SEVERITY_NUMBER_INFO,
					Body:           &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: `{"s":"I","c":"NETWORK","id":22944,"msg":"Connection accepted"}`}},
				}},
			}},
		}},
	}
}

func kv(k, v string) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: k, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: v}}}
}
