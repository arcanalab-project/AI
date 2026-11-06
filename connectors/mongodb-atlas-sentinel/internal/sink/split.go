// Package sink turns Sentinel rows into Logs Ingestion API batches.
package sink

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

// MaxBatchBytes stays under the Logs Ingestion API 1 MiB request limit.
const MaxBatchBytes = 900_000

// Split groups records into JSON arrays that fit in one upload.
// A single oversized record is skipped so the rest of the export can proceed.
func Split(records []model.Record, maxBytes int) (batches [][]model.Record, skipped int) {
	if maxBytes <= 2 {
		maxBytes = MaxBatchBytes
	}
	var cur []model.Record
	curSize := 2
	flush := func() {
		if len(cur) == 0 {
			return
		}
		batches = append(batches, cur)
		cur = nil
		curSize = 2
	}
	for _, rec := range records {
		b, err := json.Marshal(rec)
		if err != nil {
			skipped++
			continue
		}
		need := len(b)
		if len(cur) > 0 {
			need++
		}
		if len(b)+2 > maxBytes {
			skipped++
			continue
		}
		if curSize+need > maxBytes {
			flush()
			need = len(b)
		}
		cur = append(cur, rec)
		curSize += need
	}
	flush()
	return batches, skipped
}

// Validate checks that a sink can only receive an Azure Monitor token at a
// Logs Ingestion API host.
func Validate(s model.Sink) error {
	u, err := url.Parse(s.DCEEndpoint)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return errors.New("dce endpoint must be an https url")
	}
	if u.User != nil {
		return errors.New("dce endpoint must not contain credentials")
	}
	host := strings.ToLower(u.Hostname())
	if net.ParseIP(host) != nil {
		return errors.New("dce endpoint must not be an ip address")
	}
	if !allowedIngestionHost(host) {
		return fmt.Errorf("dce host %s is not an Azure Monitor ingestion endpoint", host)
	}
	if !strings.HasPrefix(s.DCRImmutableID, "dcr-") || len(s.DCRImmutableID) < 8 {
		return errors.New("dcr immutable id must start with dcr-")
	}
	if s.Stream == "" || !strings.HasPrefix(s.Stream, "Custom-") {
		return errors.New("stream must be a custom table stream")
	}
	if s.Table == "" || !strings.HasSuffix(s.Table, "_CL") {
		return errors.New("table must be a custom log table")
	}
	if strings.ContainsAny(s.Stream, " \t\r\n/\\") || strings.ContainsAny(s.Table, " \t\r\n/\\") {
		return errors.New("stream or table contains an illegal character")
	}
	return nil
}

func allowedIngestionHost(host string) bool {
	suffixes := []string{
		".ingest.monitor.azure.com",
		".ingest.monitor.azure.us",
		".ingest.monitor.azure.cn",
	}
	for _, s := range suffixes {
		if strings.HasSuffix(host, s) && len(host) > len(s) {
			return true
		}
	}
	return false
}
