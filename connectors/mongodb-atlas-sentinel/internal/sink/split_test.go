package sink

import (
	"encoding/json"
	"testing"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

func TestSplitRespectsSize(t *testing.T) {
	var records []model.Record
	for i := 0; i < 5; i++ {
		records = append(records, model.Record{Message: "a", Attributes: []byte(`{}`)})
	}
	one, err := json.Marshal(records[0])
	if err != nil {
		t.Fatal(err)
	}
	batches, skipped := Split(records, len(one)+2)
	if skipped != 0 {
		t.Fatal(skipped)
	}
	if len(batches) != len(records) {
		t.Fatalf("expected one record per batch, got %d", len(batches))
	}
}

func TestValidateSinkHost(t *testing.T) {
	ok := model.Sink{
		DCEEndpoint:    "https://dce.westeurope-1.ingest.monitor.azure.com",
		DCRImmutableID: "dcr-0123456789abcdef0123456789abcdef",
		Stream:         "Custom-MongoDBAtlasLogs_CL",
		Table:          "MongoDBAtlasLogs_CL",
	}
	if err := Validate(ok); err != nil {
		t.Fatal(err)
	}
	bad := ok
	bad.DCEEndpoint = "https://collector.example.com/v1/logs"
	if err := Validate(bad); err == nil {
		t.Fatal("expected host rejection")
	}
	bad = ok
	bad.DCEEndpoint = "http://dce.westeurope-1.ingest.monitor.azure.com"
	if err := Validate(bad); err == nil {
		t.Fatal("expected https rejection")
	}
}
