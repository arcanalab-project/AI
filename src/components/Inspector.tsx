"use client";

import type { InspectorRecord } from "@/lib/types";

export function Inspector({
  record,
  open,
  onToggle,
}: {
  record: InspectorRecord | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="surface" style={{ marginTop: "0.85rem" }}>
      <button
        className="btn btn-quiet"
        style={{ width: "100%", borderRadius: "14px 14px 0 0", justifyContent: "space-between" }}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>Dietro le quinte</span>
        <span className="kicker">{open ? "chiudi" : "apri"}</span>
      </button>
      {open && (
        <div style={{ padding: "0.9rem 1rem 1.1rem" }}>
          {!record ? (
            <div className="empty">Nessuna operazione ancora. Ogni azione reale lascia qui query, esito e tempo misurato.</div>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <div>
                <div className="kicker">Cosa è successo</div>
                <strong>{record.description}</strong>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="chip" style={{ background: record.engine === "MongoDB" ? "#00ED64" : "#E9FF99", color: "#001E2B" }}>
                  {record.engine}
                </span>
                <span className="chip code" style={{ background: "#E3FCF7" }}>{record.target}</span>
                {record.measured && record.elapsedMs != null && (
                  <span className="chip" style={{ background: "#F9EBFF" }}>{record.elapsedMs} ms misurati</span>
                )}
                {record.explanatory && (
                  <span className="chip" style={{ background: "#fff3c4" }}>solo spiegazione, non eseguita</span>
                )}
              </div>
              <div>
                <div className="kicker">Operazione</div>
                <pre className="inspect-pre">{JSON.stringify(record.operation, null, 2)}</pre>
              </div>
              <div>
                <div className="kicker">Esito</div>
                <div>{String(record.outcome)}</div>
              </div>
              {record.result !== undefined && (
                <div>
                  <div className="kicker">Risultato</div>
                  <pre className="inspect-pre">{JSON.stringify(record.result, null, 2)}</pre>
                </div>
              )}
              {(record.before != null || record.after != null) && (
                <div className="lesson-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <div className="kicker">Prima</div>
                    <pre className="inspect-pre">{JSON.stringify(record.before, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="kicker">Dopo</div>
                    <pre className="inspect-pre">{JSON.stringify(record.after, null, 2)}</pre>
                  </div>
                </div>
              )}
              {record.note && <p style={{ margin: 0, color: "#4c6a75" }}>{record.note}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
