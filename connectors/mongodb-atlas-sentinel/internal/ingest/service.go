// Package ingest routes an OTLP export onto one or more Sentinel sinks.
package ingest

import (
	"context"
	"log/slog"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/normalize"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/route"
)

// Uploader persists a batch for one sink.
type Uploader interface {
	Upload(ctx context.Context, sink model.Sink, records []model.Record) error
}

// Projects is the current allowlist.
type Projects func() *config.Set

// Service is the stateless ingest path.
type Service struct {
	Projects Projects
	Uploader Uploader
	Replica  string
	Version  string
	Logger   *slog.Logger
	Now      func() time.Time
}

// Request is one authenticated OTLP export.
type Request struct {
	ContentType string
	Body        []byte
	Principal   auth.Principal
	GroupHeader string
}

// Result is the outcome of one export.
type Result struct {
	Status   int
	Accepted int
	Rejected int
	Message  string
}

// Ingest decodes, authorizes, and uploads. Unknown projects are rejected.
// There is no catch-all workspace.
func (s *Service) Ingest(ctx context.Context, req Request) Result {
	logs, err := otlp.Decode(req.ContentType, req.Body)
	if err != nil {
		return Result{Status: 400, Message: "invalid otlp payload"}
	}
	if len(logs) == 0 {
		return Result{Status: 200}
	}
	projects := s.Projects()
	type bucket struct {
		sink model.Sink
		rows []model.Record
	}
	buckets := map[string]*bucket{}
	rejected := 0
	forbidden := 0
	bad := 0
	message := ""
	for _, log := range logs {
		groupID, err := route.ResolveGroup(log, req.GroupHeader)
		if err != nil {
			rejected++
			bad++
			message = "record did not identify one Atlas project"
			continue
		}
		project, ok := projects.ByGroup(groupID)
		if !ok {
			rejected++
			forbidden++
			message = "Atlas project is not enabled for this deployment"
			continue
		}
		org, err := route.OrgAttr(log)
		if err != nil {
			rejected++
			bad++
			message = "record organization id conflicted"
			continue
		}
		if err := route.Authorize(project, req.Principal, org); err != nil {
			rejected++
			forbidden++
			message = "token is not allowed to write this Atlas project"
			continue
		}
		row := normalize.Build(log, project, req.Principal, s.now(), s.Replica, s.Version)
		b := buckets[project.Sink.Key()]
		if b == nil {
			b = &bucket{sink: project.Sink}
			buckets[project.Sink.Key()] = b
		}
		b.rows = append(b.rows, row)
	}
	accepted := 0
	for _, b := range buckets {
		if err := s.Uploader.Upload(ctx, b.sink, b.rows); err != nil {
			if s.Logger != nil {
				s.Logger.Error("upload failed", "rows", len(b.rows), "err", err.Error())
			}
			return Result{Status: 503, Message: "ingestion backend unavailable"}
		}
		accepted += len(b.rows)
	}
	if accepted == 0 && forbidden > 0 {
		return Result{Status: 403, Rejected: rejected, Message: message}
	}
	if accepted == 0 && bad > 0 {
		return Result{Status: 400, Rejected: rejected, Message: message}
	}
	if rejected > 0 && message == "" {
		message = "some records were rejected"
	}
	return Result{Status: 200, Accepted: accepted, Rejected: rejected, Message: message}
}

// Heartbeat writes one freshness row per enabled project.
func (s *Service) Heartbeat(ctx context.Context) {
	projects := s.Projects()
	if projects == nil {
		return
	}
	stamp := s.now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, project := range projects.Projects {
		if !project.IsEnabled() {
			continue
		}
		row := model.Record{
			TimeGenerated:    stamp,
			EventTime:        stamp,
			IngestVersion:    s.Version,
			IngestReplica:    s.Replica,
			AtlasOrgID:       project.AtlasOrgID,
			AtlasGroupID:     project.AtlasGroupID,
			AtlasProjectName: project.DisplayName,
			LogType:          model.HeartbeatLogType,
			Severity:         "INFO",
			Message:          "ingest-alive",
			Attributes:       []byte(`{}`),
		}
		if err := s.Uploader.Upload(ctx, project.Sink, []model.Record{row}); err != nil && s.Logger != nil {
			s.Logger.Error("heartbeat failed", "groupId", project.AtlasGroupID, "err", err.Error())
		}
	}
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}
