"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LessonView } from "./LessonView";
import { LiveView } from "./LiveView";
import { SCENES } from "@/lib/scenes";

export function TinApp() {
  const [tab, setTab] = useState<"lesson" | "live">("lesson");
  const [scene, setScene] = useState(1);
  const root = useRef<HTMLDivElement>(null);

  const go = useCallback((n: number) => {
    setScene(Math.min(8, Math.max(1, n)));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      if (tab !== "lesson") return;
      if (e.key === "ArrowRight") go(scene + 1);
      if (e.key === "ArrowLeft") go(scene - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, tab, go]);

  return (
    <div className="tin-shell" ref={root}>
      <header style={{ padding: "1rem 1.4rem 0.4rem", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div className="kicker">MongoDB · Finding Love in Data</div>
          <div style={{ fontSize: "2rem", fontWeight: 500, lineHeight: 1.1 }}>TIN — Match your data</div>
        </div>
        <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.06)", padding: 4, borderRadius: 999 }}>
          <button className="tab" role="tab" aria-selected={tab === "lesson"} onClick={() => setTab("lesson")}>La lezione</button>
          <button className="tab" role="tab" aria-selected={tab === "live"} onClick={() => setTab("live")}>L&apos;app live</button>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const el = root.current;
            if (!el) return;
            if (document.fullscreenElement) document.exitFullscreen();
            else el.requestFullscreen();
          }}
        >
          Schermo intero
        </button>
      </header>

      {tab === "lesson" && (
        <div style={{ padding: "0.4rem 1.4rem 0" }}>
          <div className="progress" aria-label="Progresso scene" style={{ marginBottom: 12 }}>
            {SCENES.map((s) => (
              <span key={s.id} className={s.id <= scene ? "on" : undefined} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => go(scene - 1)} disabled={scene === 1}>Indietro</button>
            <div className="kicker" style={{ textAlign: "center" }}>{scene}/8 · {SCENES[scene - 1].title}</div>
            <button className="btn btn-primary" onClick={() => go(scene + 1)} disabled={scene === 8}>Avanti</button>
          </div>
        </div>
      )}

      <main style={{ padding: "1rem 1.4rem 2rem" }}>
        {tab === "lesson" ? <LessonView scene={scene} setScene={setScene} /> : <LiveView />}
      </main>
    </div>
  );
}
