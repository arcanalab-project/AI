"use client";

import { useEffect, useMemo, useState } from "react";
import { Inspector } from "./Inspector";
import { ExpandableDocument } from "./JsonDoc";
import { MappingStrip, ProfileCard } from "./ProfileCard";
import { ContrastBanner, RelationalTables } from "./Tables";
import { fieldById } from "@/lib/fields";
import { lessonGet, lessonHostMode, lessonPost } from "@/lib/lessonClient";
import { SCENES } from "@/lib/scenes";
import type { InspectorRecord } from "@/lib/types";

const GENDERS = ["woman", "man", "nonbinary", "unspecified"] as const;

export function LessonView({
  scene,
}: {
  scene: number;
  setScene: (n: number) => void;
}) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [tables, setTables] = useState<Record<string, unknown>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [inspector, setInspector] = useState<InspectorRecord | null>(null);
  const [inspectOpen, setInspectOpen] = useState(true);
  const [showSolution, setShowSolution] = useState(false);
  const [document, setDocument] = useState<unknown>(null);
  const [docSource, setDocSource] = useState<string>("");
  const [sqlResult, setSqlResult] = useState<Record<string, unknown> | null>(null);
  const [reveal, setReveal] = useState(1);
  const [animStep, setAnimStep] = useState(0);
  const [quizOpen, setQuizOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"unknown" | "api" | "offline">("unknown");
  const meta = SCENES[scene - 1];

  async function load() {
    const json = await lessonGet();
    setEngine(lessonHostMode());
    setState(json);
    setTables(json.tables ?? {});
    if (json.documentPreview) {
      setDocument((d: unknown) => d ?? json.documentPreview);
      setDocSource((s: string) => s || (json.engine === "browser" ? "browser-lesson" : "sqlite-assembled"));
    }
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setShowSolution(false);
    if (scene === 1) setReveal(1);
    else setReveal(99);
  }, [scene]);

  useEffect(() => {
    if (scene !== 1) return;
    const t = setInterval(() => setReveal((r) => Math.min(12, r + 1)), 900);
    return () => clearInterval(t);
  }, [scene]);

  const person = useMemo(() => {
    const retrieved = state?.retrieved as Record<string, unknown> | undefined;
    const base = (state?.person ?? state?.core) as Record<string, unknown> | undefined;
    if (!retrieved && !base) return null;
    const photos = (retrieved?.photos as { url: string }[]) ?? (base?.photos as { url: string }[]);
    return {
      displayName: String(retrieved?.display_name ?? base?.displayName ?? "Giulia Conti"),
      gender: String(retrieved?.gender ?? base?.gender ?? "woman"),
      birthDate: String(retrieved?.birth_date ?? base?.birthDate ?? "1997-03-14"),
      heightCm: Number(retrieved?.height_cm ?? base?.heightCm ?? 168),
      bodyType: (retrieved?.body_type ?? base?.bodyType) as string | undefined,
      profession: (retrieved?.profession ?? base?.profession) as string | undefined,
      education: (retrieved?.education ?? base?.education) as string | undefined,
      city: String(retrieved?.city ?? base?.city ?? "Milano"),
      bio: (retrieved?.bio ?? base?.bio) as string | undefined,
      photos: photos ?? [{ url: "/avatars/giulia-1.svg" }],
      interests: (retrieved?.interests as string[]) ?? (base?.interests as string[]) ?? [],
      hobbies: (document as { hobbies?: string[] } | null)?.hobbies,
      pronouns: (document as { pronouns?: string } | null)?.pronouns,
      profileType: (document as { profileType?: string } | null)?.profileType,
      settings: {
        notificationsEnabled: Boolean(retrieved?.notifications_enabled),
        discoveryDistanceKm: Number(retrieved?.discovery_distance_km ?? 40),
        minDesiredAge: Number(retrieved?.min_desired_age ?? 26),
        maxDesiredAge: Number(retrieved?.max_desired_age ?? 38),
        profileVisibility: String(retrieved?.profile_visibility ?? "public"),
        pausedAccount: Boolean(retrieved?.paused_account),
        genderPreferences: (retrieved?.gender_preferences as string[]) ?? ["man"],
      },
      subscription: {
        plan: String(retrieved?.plan ?? "Premium"),
        paymentStatus: String(retrieved?.payment_status ?? "Success"),
        autoRenew: Boolean(retrieved?.auto_renew),
        startDate: String(retrieved?.start_date ?? ""),
        endDate: String(retrieved?.end_date ?? ""),
      },
    };
  }, [state, document]);

  async function post(action: string, extra: object = {}) {
    const json = await lessonPost(action, extra);
    if (json.tables) setTables(json.tables);
    if (json.inspector) setInspector(json.inspector);
    await load();
    return json;
  }

  async function loadSql() {
    const json = await lessonGet("sql");
    setSqlResult(json);
    setInspector(json.inspector);
  }

  async function loadDoc() {
    const json = await lessonGet("document");
    setDocument(json.document);
    setDocSource(json.source);
    setInspector(json.inspector);
  }

  useEffect(() => {
    if (scene >= 6) loadDoc().catch(() => undefined);
  }, [scene, tables]);

  const mongoPath = highlight ? fieldById(highlight)?.mongo : undefined;
  const settings = person?.settings;

  return (
    <div>
      <div className="surface-deep" style={{ padding: "1rem 1.1rem", borderRadius: 16, marginBottom: 12 }}>
        <div className="kicker">{meta.pdfPages} · scene {scene}/8</div>
        <h2 style={{ margin: "0.2rem 0", fontSize: "1.85rem", fontWeight: 500 }}>{meta.title}</h2>
        <p style={{ margin: "0.2rem 0 0.6rem", fontSize: "1.15rem" }}>{meta.question}</p>
        <p style={{ margin: 0, opacity: 0.85 }}>{meta.action}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Hide solution" : "Reveal solution (tutor)"}
          </button>
          {scene === 5 && (
            <button className="btn btn-primary" onClick={() => loadSql()}>Run real SQL</button>
          )}
          {scene === 6 && (
            <>
              <button className="btn btn-primary" onClick={() => setAnimStep((s) => (s + 1) % 4)}>Animate rows → document</button>
              <button className="btn btn-ghost" onClick={() => loadDoc()}>MongoDB read</button>
            </>
          )}
        </div>
        {showSolution && (
          <p className="rise" style={{ margin: "0.8rem 0 0", color: "#E9FF99" }}>{meta.solution}</p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {engine === "offline" && (
        <div className="ok-banner" style={{ marginBottom: 12 }}>
          Lesson running in the browser — no install. Nine tables vs one JSON document. Not Atlas.
        </div>
      )}

      <MappingStrip highlight={highlight} />

      {scene !== 8 && Object.keys(tables).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <ContrastBanner tables={tables} documentReady={scene >= 2 && Boolean(document)} />
        </div>
      )}

      <div className="lesson-grid" style={{ marginTop: 12, gridTemplateColumns: scene >= 2 && scene !== 8 ? undefined : "280px minmax(0, 1fr)" }}>
        <div>
          {person && (
            <ProfileCard person={person} highlight={highlight} onHighlight={setHighlight} reveal={scene === 1 ? reveal : 99} />
          )}
          <p className="kicker" style={{ marginTop: 8 }}>Same person in the center: Giulia Conti</p>
        </div>

        <div>
          {scene === 1 && (
            <div className="surface" style={{ padding: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>The fields emerge</h3>
              <p>A credible card already hides many sections. This exercise is the person: profile, photos, interests, preferences, subscription — not swipes, matches, or messages.</p>
            </div>
          )}
          {scene >= 2 && scene !== 8 && (
            <RelationalTables tables={tables} highlight={highlight} />
          )}
          {scene === 2 && (
            <p style={{ color: "#E3FCF7" }}>
              user_gender_preferences exists because a user can look for more than one gender: normalized 1:N, not a CSV. It is not the only possible relational schema.
            </p>
          )}
          {scene === 3 && settings && (
            <form
              className="surface"
              style={{ padding: "1rem", marginTop: 10, display: "grid", gap: 8 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                await post("settings", {
                  patch: {
                    discoveryDistanceKm: Number(fd.get("km")),
                    minDesiredAge: Number(fd.get("min")),
                    maxDesiredAge: Number(fd.get("max")),
                    notificationsEnabled: fd.get("n") === "on",
                    profileVisibility: fd.get("vis"),
                    pausedAccount: fd.get("p") === "on",
                    genderPreferences: fd.getAll("g"),
                  },
                });
              }}
            >
              <h3 style={{ margin: 0 }}>Edit preferences (lesson)</h3>
              <label>Distance km <input name="km" type="number" defaultValue={settings.discoveryDistanceKm} /></label>
              <label>Min age <input name="min" type="number" defaultValue={settings.minDesiredAge} /></label>
              <label>Max age <input name="max" type="number" defaultValue={settings.maxDesiredAge} /></label>
              <label><input name="n" type="checkbox" defaultChecked={settings.notificationsEnabled} /> Notifications</label>
              <label>Visibility
                <select name="vis" defaultValue={settings.profileVisibility}>
                  <option value="public">public</option>
                  <option value="hidden">hidden</option>
                </select>
              </label>
              <label><input name="p" type="checkbox" defaultChecked={settings.pausedAccount} /> Paused account</label>
              <div>
                {GENDERS.map((g) => (
                  <label key={g} style={{ marginRight: 8 }}>
                    <input name="g" type="checkbox" value={g} defaultChecked={settings.genderPreferences.includes(g)} /> {g}
                  </label>
                ))}
              </div>
              <button className="btn btn-primary" type="submit">Save preferences</button>
            </form>
          )}
          {scene === 4 && person?.subscription && (
            <form
              className="surface"
              style={{ padding: "1rem", marginTop: 10, display: "grid", gap: 8 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                await post("subscription", {
                  patch: {
                    plan: fd.get("plan"),
                    paymentStatus: fd.get("st"),
                    autoRenew: fd.get("ar") === "on",
                    startDate: fd.get("sd"),
                    endDate: fd.get("ed"),
                  },
                });
              }}
            >
              <h3 style={{ margin: 0 }}>Current subscription</h3>
              <p>Current plan is `subscriptions` (1:1). Giulia’s Free past is `subscription_history` (1:N). Different tables, different needs.</p>
              <label>Plan
                <select name="plan" defaultValue={person.subscription.plan}>
                  <option>Free</option><option>Premium</option><option>Gold</option>
                </select>
              </label>
              <label>Payment (demo)
                <select name="st" defaultValue={person.subscription.paymentStatus}>
                  <option>Success</option><option>Failed</option><option>Pending</option>
                </select>
              </label>
              <label>Start <input name="sd" defaultValue={person.subscription.startDate} /></label>
              <label>End <input name="ed" defaultValue={person.subscription.endDate} /></label>
              <label><input name="ar" type="checkbox" defaultChecked={person.subscription.autoRenew} /> Auto-renew</label>
              <button className="btn btn-primary" type="submit">Save subscription</button>
            </form>
          )}
          {scene === 5 && sqlResult && (
            <div className="surface" style={{ padding: "1rem", marginTop: 10 }}>
              <div className="kicker">SQL result · {String(sqlResult.photoCount)} photos · {String(sqlResult.interestCount)} interests · naive cartesian = {String(sqlResult.cartesianIfNaive)} rows</div>
              <pre className="inspect-pre">{JSON.stringify(sqlResult.row, null, 2)}</pre>
              <p>One row → UI object. The naive count shows the cartesian product we avoided. SQLite is the lesson engine, not a performance comparison with Atlas.</p>
            </div>
          )}
          {scene === 7 && (
            <div className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }}>
              <p>Three product changes. Francesca and other documents stay without the new fields.</p>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "hobbies" }).then(loadDoc)}>Add hobbies</button>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "pronouns" }).then(loadDoc)}>Optional pronouns</button>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "organizer" }).then(loadDoc)}>Organizer profile</button>
              <p className="kicker">SQL: CREATE/ALTER. MongoDB: optional fields. UI: missing fields handled. A feature is frontend + backend in both worlds. ALTER does not mean downtime.</p>
            </div>
          )}
          {scene === 8 && (
            <Quiz quizOpen={quizOpen} setQuizOpen={setQuizOpen} />
          )}
        </div>

        {scene >= 2 && scene !== 8 && (
          <div>
            {animStep > 0 && (
              <p className="kicker">Animation step {animStep}/3: {["", "rows", "nested groups", "document"][animStep]}</p>
            )}
            <ExpandableDocument value={stripMongo(document)} highlight={mongoPath} source={docSource} />
          </div>
        )}
      </div>

      <p style={{ margin: "0.8rem 0 0", opacity: 0.85 }}>{meta.conclusion}</p>
      <Inspector record={inspector} open={inspectOpen} onToggle={() => setInspectOpen((v) => !v)} />
    </div>
  );
}

function stripMongo(doc: unknown) {
  if (!doc || typeof doc !== "object") return doc;
  const copy = { ...(doc as Record<string, unknown>) };
  delete copy._id;
  return copy;
}

function Quiz({
  quizOpen,
  setQuizOpen,
}: {
  quizOpen: number | null;
  setQuizOpen: (n: number | null) => void;
}) {
  const items = [
    {
      q: "Why do settings and the current subscription live in the user document, while messages do not?",
      a: "Embed data that is bounded and read with the card (1:1 / 1:current). Messages grow without bound: referenced collection. See unbounded arrays.",
    },
    {
      q: "If I put 10,000 likes inside the user document, which anti-pattern am I hitting?",
      a: "Unbounded array. It inflates the document, indexes, and writes. Likes and passes live in bootcamp_interactions.",
    },
    {
      q: "Reciprocal likes create a match in another collection. Does single-document atomicity cover that operation too?",
      a: "No. Document atomicity ≠ automatic multi-document transaction. You need uniqueness on pairKey and idempotent upserts, otherwise two simultaneous likes can lose or duplicate the match. Avoiding JOIN on this aggregate does not mean MongoDB cannot do $lookup.",
    },
  ];
  return (
    <div className="surface" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Lightning quiz</h3>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <p><strong>{i + 1}. {item.q}</strong></p>
          <button className="btn btn-quiet" onClick={() => setQuizOpen(quizOpen === i ? null : i)}>
            {quizOpen === i ? "Hide" : "Reveal"}
          </button>
          {quizOpen === i && <p className="rise">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}
