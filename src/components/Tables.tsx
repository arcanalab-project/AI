"use client";

import { CATEGORY_COLORS, fieldById } from "@/lib/fields";

const TABLE_CATEGORY: Record<string, keyof typeof CATEGORY_COLORS> = {
  users: "identity",
  user_photos: "photos",
  user_interests: "interests",
  user_settings: "settings",
  user_gender_preferences: "settings",
  subscriptions: "subscription",
  user_hobbies: "evolution",
  events: "evolution",
};

export function RelationalTables({
  tables,
  highlight,
}: {
  tables: Record<string, unknown>;
  highlight?: string | null;
}) {
  const field = highlight ? fieldById(highlight) : undefined;
  const keys = [
    "users",
    "user_photos",
    "user_interests",
    "user_settings",
    "user_gender_preferences",
    "subscriptions",
    "user_hobbies",
    "events",
  ];
  return (
    <div style={{ display: "grid", gap: 10, maxHeight: 540, overflow: "auto" }}>
      {keys.map((name) => {
        const rows = tables[name];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const cols = Object.keys(rows[0] as object);
        const cat = TABLE_CATEGORY[name] ?? "identity";
        const color = CATEGORY_COLORS[cat];
        const hotTable = field?.sql.table === name;
        return (
          <div key={name} className="surface" style={{ padding: 0, overflow: "hidden", boxShadow: hotTable ? "0 0 0 2px #00ED64" : undefined }}>
            <div style={{ background: color.bg, color: color.fg, padding: "0.35rem 0.6rem", display: "flex", justifyContent: "space-between" }}>
              <strong className="code">{name}</strong>
              <span className="kicker" style={{ color: "inherit" }}>
                {name === "user_settings" ? "1:1" : name === "users" ? "PK" : "1:N"}
              </span>
            </div>
            <table className="data">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c}
                      className={hotTable && field?.sql.column === c ? "hl" : undefined}
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
          </div>
        );
      })}
    </div>
  );
}

function formatCell(v: unknown) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
