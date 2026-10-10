"use client";

import { useState } from "react";

function pathMatches(path: string, highlightPath?: string | null) {
  if (!highlightPath) return false;
  const h = highlightPath.replace(/\[]/g, "").replace(/ \/ .*/, "");
  return path === h || path.startsWith(h) || h.startsWith(path);
}

function nestedTopLevel(value: unknown): Set<string> {
  const paths = new Set<string>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return paths;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v && typeof v === "object") paths.add(k);
  }
  return paths;
}

export function JsonDoc({
  value,
  highlight,
  path = "$",
  closed,
  onToggle,
}: {
  value: unknown;
  highlight?: string | null;
  path?: string;
  closed?: Set<string>;
  onToggle?: (path: string) => void;
}) {
  const [localClosed, setLocalClosed] = useState<Set<string>>(() => new Set());
  const shut = closed ?? localClosed;
  const flip = onToggle ?? ((p: string) => {
    setLocalClosed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  });
  if (value === null || value === undefined) {
    return <span style={{ opacity: 0.5 }}>null</span>;
  }
  if (typeof value !== "object") {
    return <span>{JSON.stringify(value)}</span>;
  }
  if (Array.isArray(value)) {
    const isClosed = shut.has(path);
    return (
      <div style={{ paddingLeft: path === "$" ? 0 : 12 }}>
        <button type="button" className="json-toggle" onClick={() => flip(path)} aria-expanded={!isClosed}>
          {isClosed ? "▶" : "▼"} [{value.length}]
        </button>
        {!isClosed &&
          value.map((item, i) => (
            <div key={i}>
              <span className="kicker">[{i}]</span>{" "}
              <JsonDoc value={item} highlight={highlight} path={`${path}[]`} closed={shut} onToggle={flip} />
            </div>
          ))}
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const isClosed = path !== "$" && shut.has(path);
  const body = (
    <div>
      {entries.map(([k, v]) => {
        const child = path === "$" ? k : `${path}.${k}`;
        const on = pathMatches(child, highlight) || pathMatches(k, highlight);
        const nested = typeof v === "object" && v !== null;
        return (
          <div
            key={k}
            className="doc-row"
            style={{
              padding: "1px 4px",
              borderRadius: 6,
              background: on ? "#E9FF99" : "transparent",
              color: on ? "#001E2B" : "inherit",
            }}
          >
            <span className="code" style={{ color: on ? "#001E2B" : "#00684A" }}>{k}</span>
            <span>: </span>
            {nested ? (
              <JsonDoc value={v} highlight={highlight} path={child} closed={shut} onToggle={flip} />
            ) : (
              <span className="code">{JSON.stringify(v)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
  if (path === "$") return body;
  return (
    <div style={{ paddingLeft: 12 }}>
      <button type="button" className="json-toggle" onClick={() => flip(path)} aria-expanded={!isClosed}>
        {isClosed ? "▶ {…}" : "▼"}
      </button>
      {!isClosed && body}
    </div>
  );
}

export function ExpandableDocument({
  value,
  highlight,
  source,
}: {
  value: unknown;
  highlight?: string | null;
  source?: string;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const toggle = (p: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  return (
    <div className="surface" style={{ padding: "0.9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="kicker">1 MongoDB document {source ? `· ${source}` : "· same person"}</div>
        <button
          className="btn btn-quiet"
          type="button"
          onClick={() => setClosed((prev) => (prev.size ? new Set() : nestedTopLevel(value)))}
        >
          {closed.size ? "Expand all" : "Collapse nested"}
        </button>
      </div>
      <div style={{ maxHeight: 520, overflow: "auto", marginTop: 8 }}>
        {value ? (
          <JsonDoc value={value} highlight={highlight} closed={closed} onToggle={toggle} />
        ) : (
          <p>The document appears here — nested objects and arrays, not eight collections.</p>
        )}
      </div>
    </div>
  );
}
