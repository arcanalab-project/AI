// Package normalize maps an Atlas OTLP record onto the Sentinel custom table.
package normalize

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"net"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
)

const (
	maxRawLog     = 30000
	maxMessage    = 8000
	maxAttributes = 16000
	maxPast       = 6 * 24 * time.Hour
	maxFuture     = 15 * time.Minute
)

// Build produces one ingestion row. The project display name and Entra
// identity come from the authenticated route, not from client-supplied labels.
func Build(in otlp.DecodedLog, project config.Project, principal auth.Principal, received time.Time, replica, version string) model.Record {
	received = received.UTC()
	event := in.EventTime
	if event.IsZero() {
		event = in.ObservedTime
	}
	raw, truncated := truncate(clean(in.Body), maxRawLog)
	rec := model.Record{
		IngestVersion:    version,
		IngestReplica:    replica,
		AtlasOrgID:       project.AtlasOrgID,
		AtlasGroupID:     project.AtlasGroupID,
		AtlasProjectName: project.DisplayName,
		AtlasClusterName: clean(in.ClusterName()),
		AtlasHostName:    clean(in.HostName()),
		LogType:          canonicalLogType(in),
		Severity:         strings.TrimSpace(in.SeverityText),
		SeverityNumber:   int(in.SeverityNumber),
		RawLog:           raw,
		RawLogTruncated:  truncated,
		OtelTraceID:      in.TraceID,
		OtelSpanID:       in.SpanID,
		EntraTenantID:    principal.TenantID,
		EntraClientID:    principal.ClientID,
		Attributes:       []byte(`{}`),
	}
	if parsed, ok := parseBody(raw); ok {
		applyDocument(&rec, parsed, &event)
	}
	if event.IsZero() {
		event = received
	}
	event = event.UTC()
	rec.EventTime = formatTime(event)
	if event.Before(received.Add(-maxPast)) || event.After(received.Add(maxFuture)) {
		rec.TimeGenerated = formatTime(received)
		rec.TimeAdjusted = true
	} else {
		rec.TimeGenerated = formatTime(event)
	}
	rec.Message = truncateOne(clean(rec.Message), maxMessage)
	rec.Attributes = attributesJSON(in.MergedAttrs(), rec)
	rec.RecordHash = hash(rec.AtlasGroupID, rec.AtlasHostName, rec.EventTime, rec.LogType, rec.RawLog)
	return rec
}

func canonicalLogType(in otlp.DecodedLog) string {
	hint := in.LogTypeHint()
	if hint == "" {
		hint = in.ScopeName
	}
	switch strings.ReplaceAll(strings.ToLower(strings.TrimSpace(hint)), "_", "-") {
	case "mongod", "mongodb":
		return "mongod"
	case "mongos":
		return "mongos"
	case "mongod-audit", "mongodaudit":
		return "mongod-audit"
	case "mongos-audit", "mongosaudit":
		return "mongos-audit"
	case "events", "event":
		return "events"
	case "":
		return "unknown"
	default:
		return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(hint)), "_", "-")
	}
}

func parseBody(raw string) (map[string]any, bool) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "{") {
		return nil, false
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return nil, false
	}
	return doc, true
}

func applyDocument(rec *model.Record, doc map[string]any, event *time.Time) {
	if event.IsZero() {
		if t, ok := timeFromBody(doc); ok {
			*event = t
		}
	}
	if s, ok := doc["s"].(string); ok && s != "" {
		rec.Severity = severityText(s)
		if rec.SeverityNumber == 0 {
			rec.SeverityNumber = severityNumber(s)
		}
	}
	if c, ok := doc["c"].(string); ok {
		rec.Component = clean(c)
	}
	if id, ok := doc["id"]; ok {
		rec.MongoLogID = asString(id)
	}
	if msg, ok := doc["msg"].(string); ok {
		rec.Message = msg
	}
	if atype, ok := doc["atype"].(string); ok && atype != "" {
		rec.AType = clean(atype)
		rec.Result = asString(doc["result"])
		rec.UserName = users(doc["users"])
		rec.RemoteIP = nested(doc, "remote", "ip")
		rec.LocalIP = nested(doc, "local", "ip")
		if rec.Message == "" {
			rec.Message = rec.AType
		}
		if rec.LogType == "unknown" {
			rec.LogType = "mongod-audit"
		}
	}
	if rec.RemoteIP == "" {
		if attr, ok := doc["attr"].(map[string]any); ok {
			if remote, ok := attr["remote"].(string); ok {
				rec.RemoteIP = hostOnly(remote)
			}
		}
	}
}

func timeFromBody(doc map[string]any) (time.Time, bool) {
	for _, key := range []string{"t", "ts"} {
		m, ok := doc[key].(map[string]any)
		if !ok {
			continue
		}
		s, ok := m["$date"].(string)
		if !ok {
			continue
		}
		if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func attributesJSON(attrs map[string]any, rec model.Record) json.RawMessage {
	trimmed := make(map[string]any, len(attrs))
	for k, v := range attrs {
		if s, ok := v.(string); ok && len(s) > 2048 {
			s, _ = truncate(s, 2048)
			trimmed[k] = s
			continue
		}
		trimmed[k] = v
	}
	if rec.AType != "" {
		trimmed["auditParamKept"] = true
	}
	b, err := json.Marshal(trimmed)
	if err != nil || len(b) > maxAttributes {
		return []byte(`{"truncated":true}`)
	}
	return b
}

func hash(parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		_, _ = h.Write([]byte(p))
		_, _ = h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func formatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func clean(s string) string {
	return strings.ReplaceAll(s, "\x00", "")
}

func truncate(s string, max int) (string, bool) {
	if len(s) <= max {
		return s, false
	}
	cut := max
	for cut > 0 && !utf8.ValidString(s[:cut]) {
		cut--
	}
	return s[:cut], true
}

func truncateOne(s string, max int) string {
	out, _ := truncate(s, max)
	return out
}

func severityText(s string) string {
	switch strings.ToUpper(s) {
	case "F":
		return "FATAL"
	case "E":
		return "ERROR"
	case "W":
		return "WARN"
	case "I":
		return "INFO"
	case "D":
		return "DEBUG"
	default:
		return s
	}
}

func severityNumber(s string) int {
	switch strings.ToUpper(s) {
	case "F":
		return 21
	case "E":
		return 17
	case "W":
		return 13
	case "I":
		return 9
	case "D":
		return 5
	default:
		return 0
	}
}

func asString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return clean(t)
	case float64:
		if t == math.Trunc(t) && !math.IsInf(t, 0) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func users(v any) string {
	arr, ok := v.([]any)
	if !ok {
		return ""
	}
	var names []string
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _ := m["user"].(string)
		if name == "" {
			continue
		}
		names = append(names, name)
		if len(names) == 5 {
			break
		}
	}
	return strings.Join(names, ",")
}

func nested(doc map[string]any, obj, field string) string {
	m, ok := doc[obj].(map[string]any)
	if !ok {
		return ""
	}
	s, _ := m[field].(string)
	return clean(s)
}

func hostOnly(remote string) string {
	if host, _, err := net.SplitHostPort(remote); err == nil {
		return host
	}
	return remote
}
