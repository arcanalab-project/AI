// Package model is the Sentinel row written through the Logs Ingestion API.
package model

import "encoding/json"

// HeartbeatLogType is written by the connector itself so freshness is visible
// without mixing connector health into audit analytics.
const HeartbeatLogType = "connector-heartbeat"

// Sink is one Logs Ingestion API destination. Values are resource identifiers,
// not secrets.
type Sink struct {
	DCEEndpoint    string `json:"dceEndpoint" yaml:"dceEndpoint"`
	DCRImmutableID string `json:"dcrImmutableId" yaml:"dcrImmutableId"`
	Stream         string `json:"stream" yaml:"stream"`
	Table          string `json:"table" yaml:"table"`
}

// Empty reports whether every field is unset.
func (s Sink) Empty() bool {
	return s.DCEEndpoint == "" && s.DCRImmutableID == "" && s.Stream == "" && s.Table == ""
}

// Key groups records that must be uploaded together.
func (s Sink) Key() string {
	return s.DCEEndpoint + "\n" + s.DCRImmutableID + "\n" + s.Stream
}

// Record is one custom-table row. JSON names match the Data Collection Rule
// and the Log Analytics table column for column.
type Record struct {
	TimeGenerated    string          `json:"TimeGenerated"`
	EventTime        string          `json:"EventTime"`
	TimeAdjusted     bool            `json:"TimeAdjusted"`
	IngestVersion    string          `json:"IngestVersion"`
	IngestReplica    string          `json:"IngestReplica"`
	AtlasOrgID       string          `json:"AtlasOrgId"`
	AtlasGroupID     string          `json:"AtlasGroupId"`
	AtlasProjectName string          `json:"AtlasProjectName"`
	AtlasClusterName string          `json:"AtlasClusterName"`
	AtlasHostName    string          `json:"AtlasHostName"`
	LogType          string          `json:"LogType"`
	Severity         string          `json:"Severity"`
	SeverityNumber   int             `json:"SeverityNumber"`
	Component        string          `json:"Component"`
	MongoLogID       string          `json:"MongoLogId"`
	Message          string          `json:"Message"`
	AType            string          `json:"AType"`
	Result           string          `json:"Result"`
	UserName         string          `json:"UserName"`
	RemoteIP         string          `json:"RemoteIp"`
	LocalIP          string          `json:"LocalIp"`
	RawLog           string          `json:"RawLog"`
	RawLogTruncated  bool            `json:"RawLogTruncated"`
	Attributes       json.RawMessage `json:"Attributes"`
	RecordHash       string          `json:"RecordHash"`
	OtelTraceID      string          `json:"OtelTraceId"`
	OtelSpanID       string          `json:"OtelSpanId"`
	EntraTenantID    string          `json:"EntraTenantId"`
	EntraClientID    string          `json:"EntraClientId"`
}

// ColumnNames is the custom-table schema. infra/modules/monitor.bicep must
// declare every name.
func ColumnNames() []string {
	return []string{
		"TimeGenerated",
		"EventTime",
		"TimeAdjusted",
		"IngestVersion",
		"IngestReplica",
		"AtlasOrgId",
		"AtlasGroupId",
		"AtlasProjectName",
		"AtlasClusterName",
		"AtlasHostName",
		"LogType",
		"Severity",
		"SeverityNumber",
		"Component",
		"MongoLogId",
		"Message",
		"AType",
		"Result",
		"UserName",
		"RemoteIp",
		"LocalIp",
		"RawLog",
		"RawLogTruncated",
		"Attributes",
		"RecordHash",
		"OtelTraceId",
		"OtelSpanId",
		"EntraTenantId",
		"EntraClientId",
	}
}
