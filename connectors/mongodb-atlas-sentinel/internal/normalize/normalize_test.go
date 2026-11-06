package normalize

import (
	"strings"
	"testing"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
)

func TestMongoAndAuditBodies(t *testing.T) {
	received := time.Date(2026, 1, 2, 3, 4, 10, 0, time.UTC)
	project := config.Project{DisplayName: "tax", AtlasGroupID: "6650aa001122334455667788", AtlasOrgID: "6650aa001122334455667701"}
	principal := auth.Principal{TenantID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ClientID: "11111111-2222-3333-4444-555555555555"}
	mongo := Build(otlp.DecodedLog{
		Body:           `{"t":{"$date":"2026-01-02T03:04:05.000Z"},"s":"I","c":"NETWORK","id":22944,"msg":"Connection accepted","attr":{"remote":"203.0.113.8:4000"}}`,
		SeverityNumber: 9,
		ScopeName:      "mongod",
	}, project, principal, received, "replica-a", "0.9.0")
	if mongo.Component != "NETWORK" || mongo.MongoLogID != "22944" || mongo.Message != "Connection accepted" {
		t.Fatalf("%+v", mongo)
	}
	if mongo.RemoteIP != "203.0.113.8" || mongo.Severity != "INFO" || mongo.LogType != "mongod" {
		t.Fatalf("enrichment %+v", mongo)
	}
	if mongo.AtlasProjectName != "tax" || mongo.RecordHash == "" {
		t.Fatal(mongo)
	}

	audit := Build(otlp.DecodedLog{
		Body:      `{"atype":"authenticate","ts":{"$date":"2026-01-02T03:04:05.000Z"},"local":{"ip":"10.0.0.1"},"remote":{"ip":"203.0.113.10"},"users":[{"user":"alice","db":"admin"}],"result":18}`,
		ScopeName: "mongod-audit",
	}, project, principal, received, "replica-a", "0.9.0")
	if audit.AType != "authenticate" || audit.Result != "18" || audit.UserName != "alice" || audit.RemoteIP != "203.0.113.10" {
		t.Fatalf("%+v", audit)
	}
}

func TestOldEventTimeIsPreservedSeparately(t *testing.T) {
	received := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rec := Build(otlp.DecodedLog{EventTime: received.Add(-30 * 24 * time.Hour), Body: "stale", ScopeName: "mongod"}, config.Project{DisplayName: "tax", AtlasGroupID: "6650aa001122334455667788"}, auth.Principal{}, received, "r", "0.9.0")
	if !rec.TimeAdjusted || rec.TimeGenerated == rec.EventTime {
		t.Fatalf("time not adjusted: %+v", rec)
	}
}

func TestRawLogTruncation(t *testing.T) {
	body := strings.Repeat("é", maxRawLog)
	rec := Build(otlp.DecodedLog{Body: body, ScopeName: "mongod", EventTime: time.Now()}, config.Project{DisplayName: "tax", AtlasGroupID: "6650aa001122334455667788"}, auth.Principal{}, time.Now(), "r", "0.9.0")
	if !rec.RawLogTruncated || len(rec.RawLog) > maxRawLog {
		t.Fatalf("truncated=%v len=%d", rec.RawLogTruncated, len(rec.RawLog))
	}
}
