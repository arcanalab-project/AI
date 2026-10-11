"use client";

import { CATEGORY_COLORS, fieldById } from "@/lib/fields";
import { CORE_LESSON_TABLES, LESSON_TABLES, tableCount } from "@/lib/lessonTables";

export function ContrastBanner({
  tables,
  documentReady,
}: {
  tables: Record<string, unknown>;
  documentReady?: boolean;
}) {
  const counts = tableCount(tables, true);
  const extras = LESSON_TABLES.filter((t) => !t.core && Array.isArray(tables[t.name]) && (tables[t.name] as unknown[]).length > 0);
  const totalTables = counts.tables + extras.length;
  const extraRows = extras.reduce((n, t) => n + ((tables[t.name] as unknown[])?.length ?? 0), 0);
  return (
    <div className="contrast-banner" role="status">
      <div>
        <div className="kicker" style={{ color: "#E9FF99" }}>Same person · two models</div>
        <strong style={{ fontSize: "1.35rem" }}>
          {totalTables} tables · {counts.rows + extraRows} rows
        </strong>
        <span style={{ opacity: 0.8 }}> vs </span>
        <strong style={{ fontSize: "1.35rem", color: "#00ED64" }}>1 JSON document</strong>
      </div>
      <p style={{ margin: "0.35rem 0 0", maxWidth: 720, opacity: 0.9 }}>
        Giulia is fragmented across a normalized schema (this one, not the only possible RDBMS). Reconstituting the card takes work — joins and subqueries assemble one object. Table count is not query count, and this is not a speed contest.
        {documentReady ? " The document on the right is the same person, nested." : ""}
      </p>
    </div>
  );
}

export function SchemaConnectors({ highlight }: { highlight?: string | null }) {
  const field = highlight ? fieldById(highlight) : undefined;
  return (
    <div className="schema-connectors" aria-label="Primary keys and foreign keys">
      {CORE_LESSON_TABLES.map((spec) => {
        const hot = field?.sql.table === spec.name;
        const color = CATEGORY_COLORS[spec.category];
        return (
          <span
            key={spec.name}
            className="schema-chip"
            data-on={String(hot)}
            style={{ background: color.bg, color: color.fg }}
            title={`${spec.section} · PK ${spec.pk}${spec.fk ? ` · FK ${spec.fk}` : ""}`}
          >
            <span className="code">{spec.name}</span>
            <span className="kicker" style={{ color: "inherit", letterSpacing: "0.06em" }}>
              {spec.cardinality}
              {spec.fk ? ` · ${spec.fk}` : ` · PK ${spec.pk}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function RelationalTables({
  tables,
  highlight,
  showEmpty = true,
}: {
  tables: Record<string, unknown>;
  highlight?: string | null;
  showEmpty?: boolean;
}) {
  const field = highlight ? fieldById(highlight) : undefined;
  const flags = (tables.flags as { hobbies?: boolean; organizer?: boolean } | undefined) ?? {};
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <SchemaConnectors highlight={highlight} />
      <div style={{ display: "grid", gap: 10, maxHeight: 540, overflow: "auto" }}>
        {LESSON_TABLES.map((spec) => {
          const rows = tables[spec.name];
          const evolvedMissing =
            (spec.name === "user_hobbies" && !flags.hobbies) ||
            (spec.name === "events" && !flags.organizer);
          if (!Array.isArray(rows)) return null;
          if (!spec.core && rows.length === 0) return null;
          if (!showEmpty && rows.length === 0) return null;
          const cols = rows.length ? Object.keys(rows[0] as object) : [];
          const color = CATEGORY_COLORS[spec.category];
          const hotTable = field?.sql.table === spec.name;
          return (
            <div
              key={spec.name}
              className="surface"
              style={{ padding: 0, overflow: "hidden", boxShadow: hotTable ? "0 0 0 2px #00ED64" : undefined }}
            >
              <div style={{ background: color.bg, color: color.fg, padding: "0.35rem 0.6rem", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <strong className="code">{spec.name}</strong>
                  <span className="kicker" style={{ color: "inherit", marginLeft: 8 }}>{spec.section}</span>
                </div>
                <span className="kicker" style={{ color: "inherit" }}>
                  {spec.cardinality} · PK {spec.pk}
                  {spec.fk ? ` · FK ${spec.fk}` : ""} · {rows.length} row{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              {rows.length === 0 ? (
                <div className="empty" style={{ margin: 0, border: 0, borderRadius: 0 }}>
                  {evolvedMissing ? "Not created yet — scene 7." : "No row for Giulia in this table."}
                </div>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th
                          key={c}
                          className={hotTable && (field?.sql.column === c || c.endsWith("_id")) ? (field?.sql.column === c ? "hl" : undefined) : undefined}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as Record<string, unknown>[]).map((row, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c} className={hotTable && field?.sql.column === c ? "hl" : undefined}>
                            {formatCell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCell(v: unknown) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
