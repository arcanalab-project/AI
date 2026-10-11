"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LessonView } from "./LessonView";
import { LiveView } from "./LiveView";
import { SCENES } from "@/lib/scenes";

export function TinApp() {
  const [tab, setTab] = useState<"lesson" | "live">("lesson");
  const [scene, setScene] = useState(1);
  const [resetToken, setResetToken] = useState(0);
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
    <div className={tab === "lesson" ? "tin-shell lesson-fit" : "tin-shell"} ref={root}>
      <header className="app-head">
        <div>
          <div className="kicker">MongoDB · Finding Love in Data</div>
          <div className="app-title">TIN — Match your data</div>
        </div>
        <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.06)", padding: 4, borderRadius: 999 }}>
          <button className="tab" role="tab" aria-selected={tab === "lesson"} onClick={() => setTab("lesson")}>The lesson</button>
          <button className="tab" role="tab" aria-selected={tab === "live"} onClick={() => setTab("live")}>The live app</button>
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
          Fullscreen
        </button>
      </header>

      {tab === "lesson" && (
        <div className="lesson-nav">
          <button className="btn btn-ghost" type="button" onClick={() => go(scene - 1)} disabled={scene === 1}>Back</button>
          <div className="progress" aria-label="Scene progress">
            {SCENES.map((s) => (
              <span key={s.id} className={s.id <= scene ? "on" : undefined} />
            ))}
          </div>
          <div className="kicker nav-label">{scene}/8 · {SCENES[scene - 1].title}</div>
          <button className="btn btn-ghost" type="button" onClick={() => setResetToken((n) => n + 1)}>Reset scene</button>
          <button className="btn btn-primary" type="button" onClick={() => go(scene + 1)} disabled={scene === 8}>Next</button>
        </div>
      )}

      <main className={tab === "lesson" ? "lesson-main" : "live-main"}>
        {tab === "lesson" ? <LessonView scene={scene} resetToken={resetToken} /> : <LiveView />}
      </main>
    </div>
  );
}
