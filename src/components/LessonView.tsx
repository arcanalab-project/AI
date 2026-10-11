"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedJson } from "./FormattedJson";
import { computeAge } from "@/lib/age";
import { evolveOfflineLesson, listOfflineTables, revertOfflineLesson } from "@/lib/lessonOffline";
import { projectLesson, type HighlightSpec, type StageTable } from "@/lib/lessonStage";
import { SCENES } from "@/lib/scenes";
import { withBase } from "@/lib/paths";

type Phase = "request" | "before" | "apply" | "after";

const PHASES: Phase[] = ["request", "before", "apply", "after"];
const PHASE_LABEL: Record<Phase, string> = {
  request: "New request",
  before: "Before",
  apply: "Apply change",
  after: "After",
};

export function LessonView({ scene, resetToken }: { scene: number; setScene?: (n: number) => void; resetToken: number }) {
  const [tick, setTick] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [phaseByScene, setPhaseByScene] = useState<Record<number, Phase>>({});
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const phase: Phase = scene === 6 || scene === 7 ? (phaseByScene[scene] ?? "request") : "after";
  const revealExtension = phase === "after";
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    setHighlight(null);
    setNotesOpen(false);
    setTechOpen(false);
  }, [scene]);

  useEffect(() => {
    if (resetToken === 0) return;
    const current = sceneRef.current;
    if (current === 6) revertOfflineLesson("pronouns");
    if (current === 7) {
      revertOfflineLesson("hobbies");
      revertOfflineLesson("organizer");
      setShowOrganizer(false);
    }
    setPhaseByScene((prev) => ({ ...prev, [current]: "request" }));
    setHighlight(null);
    setTick((n) => n + 1);
  }, [resetToken]);

  const stage = useMemo(
    () => projectLesson(scene, { revealExtension, showOrganizer: scene === 7 && showOrganizer, revision: tick }),
    [scene, revealExtension, showOrganizer, tick],
  );

  const spec = stage.highlights.find((h) => h.id === highlight) ?? null;
  const giulia = listOfflineTables(1);
  const user = giulia.users[0];
  const age = user ? computeAge(String(user.birth_date)) : null;
  const meta = SCENES[scene - 1];
  const dim = revealExtension && stage.changedPaths.length > 0;

  useEffect(() => {
    if (!highlight) return;
    const nodes = document.querySelectorAll('[data-hot="true"]');
    nodes.forEach((node) => node.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }, [highlight, stage, showAll]);

  useEffect(() => {
    if (highlight) return;
    const panels = document.querySelectorAll(".lesson-panel");
    const pinBottom = scene === 3 || scene === 4 || scene === 5 || scene === 8 || (scene === 7 && revealExtension);
    panels.forEach((panel) => {
      panel.scrollTop = pinBottom ? panel.scrollHeight : 0;
    });
  }, [scene, revealExtension, tick, highlight]);

  function setPhase(next: Phase) {
    setPhaseByScene((prev) => ({ ...prev, [scene]: next }));
  }

  function apply() {
    if (scene === 6) evolveOfflineLesson("pronouns");
    if (scene === 7) evolveOfflineLesson("hobbies");
    setTick((n) => n + 1);
    setPhase("after");
    setHighlight(scene === 6 ? "pronouns" : "hobbies");
  }

  return (
    <div className="lesson-stage">
      <div className="lesson-top">
        <div>
          <h2 className="lesson-title">{meta.title}</h2>
          <p className="lesson-question">{meta.question}</p>
          {spec && <p className="lesson-label">{spec.label}</p>}
          <div className="fact-row">
            {stage.highlights.map((item) => (
              <button
                key={item.id}
                type="button"
                className="fact"
                data-on={String(highlight === item.id)}
                onClick={() => setHighlight(item.id)}
              >
                {item.label.split(" · ")[0]}
              </button>
            ))}
          </div>
          {(scene === 6 || scene === 7) && (
            <div className="phase-row" role="tablist" aria-label="Experiment steps">
              {PHASES.map((p) => (
                <button key={p} type="button" role="tab" className="phase" aria-selected={phase === p} onClick={() => setPhase(p)}>
                  {PHASE_LABEL[p]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="giulia-chip" onClick={() => setHighlight("displayName")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBase("/avatars/giulia-1.jpg")} alt="" />
          <span>
            <strong className={highlight === "displayName" ? "card-hot" : undefined} data-hot={highlight === "displayName" ? "true" : undefined}>
              Giulia Conti
            </strong>
            <span className={highlight === "birthDate" ? "card-hot" : "kicker"} style={{ display: "block", color: highlight === "birthDate" ? "#001E2B" : "#E3FCF7" }} data-hot={highlight === "birthDate" ? "true" : undefined}>
              Age {age} · derived from birth date
            </span>
            {spec && highlight !== "displayName" && highlight !== "birthDate" && (
              <span className="card-hot" data-hot="true">{cardFact(spec.id, stage.documents[0]?.value)}</span>
            )}
          </span>
        </button>
      </div>

      {stage.operations && phase === "apply" && (
        <div className="op-row">
          <p><strong>Relational. </strong>{stage.operations.relational}</p>
          <p><strong>Document. </strong>{stage.operations.document}</p>
          <p><strong>Application. </strong>{stage.operations.application}</p>
        </div>
      )}

      {phase === "apply" && (
        <div className="apply-row">
          <button type="button" className="btn btn-primary" onClick={apply}>
            Apply change
          </button>
          <span className="kicker" style={{ color: "#E3FCF7" }}>Repeatable. Applying again replaces the same rows.</span>
        </div>
      )}

      <div className="lesson-panels">
        <section className="lesson-panel" aria-label="Relational — tables">
          <div className="panel-sticky">
            <header className="panel-head">
              <strong>Relational — tables</strong>
              <button type="button" className="text-btn" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Hide extra fields" : "Show all fields"}
              </button>
            </header>
            <p className="panel-count">{stage.countsLabel}</p>
            {spec?.link && <p className="fk-callout">{spec.link}</p>}
          </div>
          {stage.tables.map((table) => (
            <TableBlock
              key={table.name}
              table={table}
              showAll={showAll}
              spec={spec}
              changed={dim ? stage.changedColumns : []}
              dim={dim}
              onPick={(column) => {
                const hit = stage.highlights.find((h) =>
                  h.tables.some((t) => t.name === table.name && t.columns.includes(column)),
                );
                if (hit) setHighlight(hit.id);
              }}
            />
          ))}
          {stage.history && (
            <div className="aside-block">
              <strong>Plan history — outside this profile</strong>
              <p>{stage.history.note}</p>
              <table className="data">
                <thead>
                  <tr>
                    {stage.history.rows[0] ? Object.keys(stage.history.rows[0]).map((c) => <th key={c}>{c}</th>) : null}
                  </tr>
                </thead>
                <tbody>
                  {stage.history.rows.map((row, i) => (
                    <tr key={i}>
                      {Object.keys(row).map((c) => (
                        <td key={c}>{formatCell(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lesson-panel" aria-label="MongoDB — document">
          <div className="panel-sticky">
            <header className="panel-head">
              <strong>MongoDB — document</strong>
            </header>
            <p className="panel-note">JSON representation of the MongoDB document. Braces are objects. Brackets are arrays.</p>
            {scene === 6 && revealExtension && (
              <p className="fk-callout">Giulia stores pronouns (she/her). Francesca omits the field. Her table cell is NULL. The application treats both as no pronouns.</p>
            )}
            {scene === 7 && revealExtension && (
              <p className="fk-callout">Interests are match tags and already exist. Hobbies are a separate list. Giulia has them. Francesca has interests and no hobbies array.</p>
            )}
          </div>
          {stage.documents.map((doc) => (
            <div key={doc.who} className="doc-block">
              <div className="kicker" style={{ color: "#00684A" }}>{doc.who}</div>
              <FormattedJson
                value={doc.value}
                highlight={spec?.paths ?? null}
                changedPaths={dim && doc.who.startsWith("Giulia") ? stage.changedPaths : []}
                dimUnchanged={dim}
              />
            </div>
          ))}
          {stage.eventCompare && (
            <div className="aside-block">
              <strong>Event summary is not the event</strong>
              <p>The profile would keep only the summary. These fields stay on the event: {stage.eventCompare.onlyOnEvent.join(", ")}.</p>
              <div className="doc-pair">
                <div>
                  <div className="kicker" style={{ color: "#00684A" }}>Summary on the profile</div>
                  <FormattedJson value={stage.eventCompare.summary} />
                </div>
                <div>
                  <div className="kicker" style={{ color: "#00684A" }}>Event document</div>
                  <FormattedJson value={stage.eventCompare.full} />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="lesson-foot">
        <p className="takeaway">{stage.takeaway}</p>
        <div className="foot-actions">
          {scene === 7 && (
            <button type="button" className="text-btn" onClick={() => setShowOrganizer((v) => !v)}>
              {showOrganizer ? "Hide organizer note" : "Optional: organizer profile"}
            </button>
          )}
          <button type="button" className="text-btn" aria-expanded={notesOpen} onClick={() => setNotesOpen((v) => !v)}>
            Teacher notes
          </button>
          <button type="button" className="text-btn" aria-expanded={techOpen} onClick={() => setTechOpen((v) => !v)}>
            Technical details
          </button>
        </div>
      </div>
      {showOrganizer && scene === 7 && (
        <p className="fold-note">
          An organizer profile points at events. A short summary on the person (title, start) is not the event. City and description stay on the event document. Scene 8 shows that split.
        </p>
      )}
      {notesOpen && <p className="fold-note">{stage.teacherNote}</p>}
      {techOpen && (
        <div className="fold-note">
          <p>{stage.technicalNote}</p>
          <pre className="inspect-pre">{stage.simulatedSql}</pre>
          <pre className="inspect-pre">{stage.simulatedFind}</pre>
        </div>
      )}
    </div>
  );
}

function TableBlock({
  table,
  showAll,
  spec,
  changed,
  dim,
  onPick,
}: {
  table: StageTable;
  showAll: boolean;
  spec: HighlightSpec | null;
  changed: { table: string; column: string }[];
  dim: boolean;
  onPick?: (column: string) => void;
}) {
  const hotCols = new Set(spec?.tables.find((t) => t.name === table.name)?.columns ?? []);
  const columns = table.columns.filter((c) => showAll || c.focus || hotCols.has(c.key));
  const tableHot = hotCols.size > 0;
  return (
    <div className="table-block" data-hot={tableHot ? "true" : undefined}>
      <div className="table-title">
        <span className="code">{table.name}</span>
        <span>Row identifier: {table.pk}{table.fk ? ` · ${table.fk} (reference to another row)` : ""}</span>
      </div>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={hotCols.has(c.key) ? "hl" : undefined}>
                {c.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const isChanged = changed.some((ch) => ch.table === table.name && ch.column === c.key);
                const isHot = hotCols.has(c.key);
                const faded = dim && changed.length > 0 && !isChanged && !isHot;
                return (
                  <td
                    key={c.key}
                    className={isHot || isChanged ? "hl" : undefined}
                    style={faded ? { opacity: 0.4 } : undefined}
                    data-hot={isHot ? "true" : undefined}
                    onClick={() => onPick?.(c.key)}
                  >
                    {formatCell(row[c.key])}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function cardFact(id: string, doc: Record<string, unknown> | undefined): string {
  if (!doc) return "";
  const settings = (doc.settings ?? {}) as Record<string, unknown>;
  const sub = (doc.subscription ?? {}) as Record<string, unknown>;
  switch (id) {
    case "gender":
      return String(doc.gender ?? "");
    case "city":
      return String(doc.city ?? "");
    case "bio":
      return String(doc.bio ?? "");
    case "photos":
      return `${Array.isArray(doc.photos) ? doc.photos.length : 0} photos`;
    case "interests":
      return Array.isArray(doc.interests) ? doc.interests.join(", ") : "";
    case "notifications":
      return settings.notificationsEnabled ? "notifications on" : "notifications off";
    case "distance":
      return `${settings.discoveryDistanceKm ?? ""} km`;
    case "ageRange":
      return `${settings.minDesiredAge ?? ""}–${settings.maxDesiredAge ?? ""}`;
    case "genders":
      return Array.isArray(settings.genderPreferences) ? settings.genderPreferences.join(", ") : "";
    case "plan":
      return String(sub.plan ?? "");
    case "pronouns":
      return doc.pronouns ? String(doc.pronouns) : "not set";
    case "hobbies":
      return Array.isArray(doc.hobbies) ? doc.hobbies.join(", ") : "none";
    default:
      return "";
  }
}
