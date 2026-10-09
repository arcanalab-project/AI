"use client";

function pathMatches(path: string, highlightPath?: string | null) {
  if (!highlightPath) return false;
  const h = highlightPath.replace(/\[]/g, "").replace(/ \/ .*/, "");
  return path === h || path.startsWith(h) || h.startsWith(path);
}

export function JsonDoc({
  value,
  highlight,
  path = "$",
}: {
  value: unknown;
  highlight?: string | null;
  path?: string;
}) {
  if (value === null || value === undefined) {
    return <span style={{ opacity: 0.5 }}>null</span>;
  }
  if (typeof value !== "object") {
    return <span>{JSON.stringify(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: 12 }}>
        {value.map((item, i) => (
          <div key={i}>
            <span className="kicker">[{i}]</span>{" "}
            <JsonDoc value={item} highlight={highlight} path={`${path}[]`} />
          </div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <div>
      {entries.map(([k, v]) => {
        const child = path === "$" ? k : `${path}.${k}`;
        const on = pathMatches(child, highlight) || pathMatches(k, highlight);
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
            {typeof v === "object" && v !== null ? (
              <JsonDoc value={v} highlight={highlight} path={child} />
            ) : (
              <span className="code">{JSON.stringify(v)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
