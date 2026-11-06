// Package otlp decodes Atlas OpenTelemetry log exports.
package otlp

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	collogsv1 "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// DecodedLog is one OTLP log record with resource and record attributes separated
// so a conflict between them can be rejected.
type DecodedLog struct {
	ResourceAttrs  map[string]any
	RecordAttrs    map[string]any
	Body           string
	EventTime      time.Time
	ObservedTime   time.Time
	SeverityText   string
	SeverityNumber int32
	TraceID        string
	SpanID         string
	ScopeName      string
}

var groupKeys = []string{
	"mongodb.atlas.group.id",
	"atlas.group.id",
	"atlas.project.id",
	"mongodb.project.id",
	"group.id",
	"group_id",
}

var orgKeys = []string{
	"mongodb.atlas.org.id",
	"atlas.org.id",
	"org.id",
	"org_id",
}

var clusterKeys = []string{
	"mongodb.atlas.cluster.name",
	"atlas.cluster.name",
	"cluster.name",
	"mongodb.cluster",
}

var hostKeys = []string{
	"mongodb.atlas.host.name",
	"host.name",
	"server.address",
	"hostname",
	"host",
}

var logTypeKeys = []string{
	"mongodb.atlas.log.type",
	"atlas.log.type",
	"log.type",
	"log_type",
	"mongodb.log.type",
}

// GroupIDs returns the record-level and resource-level group ids.
func (l DecodedLog) GroupIDs() (record, resource string) {
	return lookup(l.RecordAttrs, groupKeys...), lookup(l.ResourceAttrs, groupKeys...)
}

// OrgIDs returns the record-level and resource-level organization ids.
func (l DecodedLog) OrgIDs() (record, resource string) {
	return lookup(l.RecordAttrs, orgKeys...), lookup(l.ResourceAttrs, orgKeys...)
}

// ClusterName returns the first cluster attribute.
func (l DecodedLog) ClusterName() string { return l.first(clusterKeys...) }

// HostName returns the first host attribute.
func (l DecodedLog) HostName() string { return l.first(hostKeys...) }

// LogTypeHint returns the first log-type attribute.
func (l DecodedLog) LogTypeHint() string { return l.first(logTypeKeys...) }

func (l DecodedLog) first(keys ...string) string {
	if s := lookup(l.RecordAttrs, keys...); s != "" {
		return s
	}
	return lookup(l.ResourceAttrs, keys...)
}

// MergedAttrs overlays record attributes on resource attributes.
func (l DecodedLog) MergedAttrs() map[string]any {
	out := make(map[string]any, len(l.ResourceAttrs)+len(l.RecordAttrs))
	for k, v := range l.ResourceAttrs {
		out[k] = v
	}
	for k, v := range l.RecordAttrs {
		out[k] = v
	}
	return out
}

// Decode unmarshals an OTLP ExportLogsServiceRequest.
func Decode(contentType string, body []byte) ([]DecodedLog, error) {
	var req collogsv1.ExportLogsServiceRequest
	switch media(contentType) {
	case "application/json":
		if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(body, &req); err != nil {
			return nil, fmt.Errorf("otlp json: %w", err)
		}
	case "application/x-protobuf", "application/protobuf":
		if err := proto.Unmarshal(body, &req); err != nil {
			return nil, fmt.Errorf("otlp protobuf: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported content type %q", contentType)
	}
	var out []DecodedLog
	for _, rl := range req.ResourceLogs {
		var resource map[string]any
		if rl.GetResource() != nil {
			resource = attrs(rl.GetResource().GetAttributes())
		}
		for _, sl := range rl.ScopeLogs {
			scope := ""
			if sl.GetScope() != nil {
				scope = sl.GetScope().GetName()
			}
			for _, rec := range sl.LogRecords {
				if rec == nil {
					continue
				}
				out = append(out, DecodedLog{
					ResourceAttrs:  resource,
					RecordAttrs:    attrs(rec.GetAttributes()),
					Body:           bodyString(rec.GetBody()),
					EventTime:      unixNano(rec.GetTimeUnixNano()),
					ObservedTime:   unixNano(rec.GetObservedTimeUnixNano()),
					SeverityText:   rec.GetSeverityText(),
					SeverityNumber: int32(rec.GetSeverityNumber()),
					TraceID:        hex.EncodeToString(rec.GetTraceId()),
					SpanID:         hex.EncodeToString(rec.GetSpanId()),
					ScopeName:      scope,
				})
			}
		}
	}
	return out, nil
}

// ResponseBody encodes an OTLP partial-success response.
func ResponseBody(contentType string, rejected int64, message string) ([]byte, string, error) {
	resp := &collogsv1.ExportLogsServiceResponse{}
	if rejected > 0 {
		resp.PartialSuccess = &collogsv1.ExportLogsPartialSuccess{
			RejectedLogRecords: rejected,
			ErrorMessage:       message,
		}
	}
	switch media(contentType) {
	case "application/x-protobuf", "application/protobuf":
		b, err := proto.Marshal(resp)
		return b, "application/x-protobuf", err
	default:
		b, err := protojson.MarshalOptions{EmitUnpopulated: false}.Marshal(resp)
		return b, "application/json", err
	}
}

func media(contentType string) string {
	if i := strings.Index(contentType, ";"); i >= 0 {
		contentType = contentType[:i]
	}
	return strings.ToLower(strings.TrimSpace(contentType))
}

func attrs(kvs []*commonv1.KeyValue) map[string]any {
	out := make(map[string]any, len(kvs))
	for _, kv := range kvs {
		if kv == nil || kv.Key == "" {
			continue
		}
		out[kv.Key] = anyValue(kv.Value)
	}
	return out
}

func anyValue(v *commonv1.AnyValue) any {
	if v == nil {
		return nil
	}
	switch t := v.Value.(type) {
	case *commonv1.AnyValue_StringValue:
		return t.StringValue
	case *commonv1.AnyValue_BoolValue:
		return t.BoolValue
	case *commonv1.AnyValue_IntValue:
		return t.IntValue
	case *commonv1.AnyValue_DoubleValue:
		return t.DoubleValue
	case *commonv1.AnyValue_BytesValue:
		return t.BytesValue
	case *commonv1.AnyValue_ArrayValue:
		arr := make([]any, 0, len(t.ArrayValue.GetValues()))
		for _, item := range t.ArrayValue.GetValues() {
			arr = append(arr, anyValue(item))
		}
		return arr
	case *commonv1.AnyValue_KvlistValue:
		return attrs(t.KvlistValue.GetValues())
	default:
		return nil
	}
}

func bodyString(v *commonv1.AnyValue) string {
	if v == nil {
		return ""
	}
	if s := v.GetStringValue(); s != "" || v.GetValue() != nil && v.GetStringValue() == "" {
		if _, ok := v.Value.(*commonv1.AnyValue_StringValue); ok {
			return v.GetStringValue()
		}
	}
	val := anyValue(v)
	if val == nil {
		return ""
	}
	if s, ok := val.(string); ok {
		return s
	}
	b, err := json.Marshal(val)
	if err != nil {
		return ""
	}
	return string(b)
}

func unixNano(ns uint64) time.Time {
	if ns == 0 || ns > uint64(^uint64(0)>>1) {
		return time.Time{}
	}
	return time.Unix(0, int64(ns)).UTC()
}

func lookup(m map[string]any, keys ...string) string {
	if len(m) == 0 {
		return ""
	}
	folded := make(map[string]any, len(m))
	for k, v := range m {
		folded[strings.ToLower(k)] = v
	}
	for _, k := range keys {
		v, ok := folded[strings.ToLower(k)]
		if !ok || v == nil {
			continue
		}
		switch t := v.(type) {
		case string:
			if s := strings.TrimSpace(t); s != "" {
				return s
			}
		}
	}
	return ""
}

// Ensure the logs import is used when a resource has no records in tests.
var _ = logsv1.SeverityNumber_SEVERITY_NUMBER_UNSPECIFIED
