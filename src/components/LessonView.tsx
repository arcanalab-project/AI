"use client";

import { useEffect, useMemo, useState } from "react";
import { Inspector } from "./Inspector";
import { JsonDoc } from "./JsonDoc";
import { MappingStrip, ProfileCard } from "./ProfileCard";
import { RelationalTables } from "./Tables";
import { fieldById } from "@/lib/fields";
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
  const meta = SCENES[scene - 1];

  async function load() {
    const res = await fetch("/api/lesson", { cache: "no-store" });
    const json = await res.json();
    setState(json);
    setTables(json.tables ?? {});
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
    const res = await fetch("/api/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Errore");
    if (json.tables) setTables(json.tables);
    if (json.inspector) setInspector(json.inspector);
    await load();
    return json;
  }

  async function loadSql() {
    const res = await fetch("/api/lesson?op=sql", { cache: "no-store" });
    const json = await res.json();
    setSqlResult(json);
    setInspector(json.inspector);
  }

  async function loadDoc() {
    const res = await fetch("/api/lesson?op=document", { cache: "no-store" });
    const json = await res.json();
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
        <div className="kicker">{meta.pdfPages} · scena {scene}/8</div>
        <h2 style={{ margin: "0.2rem 0", fontSize: "1.85rem", fontWeight: 500 }}>{meta.title}</h2>
        <p style={{ margin: "0.2rem 0 0.6rem", fontSize: "1.15rem" }}>{meta.question}</p>
        <p style={{ margin: 0, opacity: 0.85 }}>{meta.action}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? "Nascondi soluzione" : "Rivela soluzione (tutor)"}
          </button>
          {scene === 5 && (
            <button className="btn btn-primary" onClick={() => loadSql()}>Esegui SQL reale</button>
          )}
          {scene === 6 && (
            <>
              <button className="btn btn-primary" onClick={() => setAnimStep((s) => (s + 1) % 4)}>Anima righe → documento</button>
              <button className="btn btn-ghost" onClick={() => loadDoc()}>Lettura MongoDB</button>
            </>
          )}
        </div>
        {showSolution && (
          <p className="rise" style={{ margin: "0.8rem 0 0", color: "#E9FF99" }}>{meta.solution}</p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <MappingStrip highlight={highlight} />

      <div className="lesson-grid" style={{ marginTop: 12 }}>
        <div>
          {person && (
            <ProfileCard person={person} highlight={highlight} onHighlight={setHighlight} reveal={scene === 1 ? reveal : 99} />
          )}
          <p className="kicker" style={{ marginTop: 8 }}>Stessa persona al centro: Giulia Conti</p>
        </div>

        <div>
          {scene === 1 && (
            <div className="surface" style={{ padding: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>I campi emergono</h3>
              <p>Una card credibile nasconde già molte entità. L’esercizio si concentra su utente, preferenze, abbonamento — non su swipe e messaggi.</p>
            </div>
          )}
          {scene >= 2 && scene !== 8 && (
            <RelationalTables tables={tables} highlight={highlight} />
          )}
          {scene === 2 && (
            <p style={{ color: "#E3FCF7" }}>
              user_gender_preferences esiste perché un utente può cercare più generi: 1:N normalizzato, non un CSV. Non è l’unico schema relazionale possibile.
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
              <h3 style={{ margin: 0 }}>Modifica preferenze (lezione)</h3>
              <label>Distanza km <input name="km" type="number" defaultValue={settings.discoveryDistanceKm} /></label>
              <label>Età min <input name="min" type="number" defaultValue={settings.minDesiredAge} /></label>
              <label>Età max <input name="max" type="number" defaultValue={settings.maxDesiredAge} /></label>
              <label><input name="n" type="checkbox" defaultChecked={settings.notificationsEnabled} /> Notifiche</label>
              <label>Visibilità
                <select name="vis" defaultValue={settings.profileVisibility}>
                  <option value="public">public</option>
                  <option value="hidden">hidden</option>
                </select>
              </label>
              <label><input name="p" type="checkbox" defaultChecked={settings.pausedAccount} /> Account in pausa</label>
              <div>
                {GENDERS.map((g) => (
                  <label key={g} style={{ marginRight: 8 }}>
                    <input name="g" type="checkbox" value={g} defaultChecked={settings.genderPreferences.includes(g)} /> {g}
                  </label>
                ))}
              </div>
              <button className="btn btn-primary" type="submit">Salva preferenze</button>
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
              <h3 style={{ margin: 0 }}>Abbonamento corrente</h3>
              <p>Lo storico Free di Giulia resta in un’altra riga (`is_current=0`). Bisogni diversi: storico vs corrente.</p>
              <label>Piano
                <select name="plan" defaultValue={person.subscription.plan}>
                  <option>Free</option><option>Premium</option><option>Gold</option>
                </select>
              </label>
              <label>Pagamento (demo)
                <select name="st" defaultValue={person.subscription.paymentStatus}>
                  <option>Success</option><option>Failed</option><option>Pending</option>
                </select>
              </label>
              <label>Inizio <input name="sd" defaultValue={person.subscription.startDate} /></label>
              <label>Fine <input name="ed" defaultValue={person.subscription.endDate} /></label>
              <label><input name="ar" type="checkbox" defaultChecked={person.subscription.autoRenew} /> Auto-renew</label>
              <button className="btn btn-primary" type="submit">Salva abbonamento</button>
            </form>
          )}
          {scene === 5 && sqlResult && (
            <div className="surface" style={{ padding: "1rem", marginTop: 10 }}>
              <div className="kicker">Risultato SQL · {String(sqlResult.photoCount)} foto · {String(sqlResult.interestCount)} interessi · cartesiano ingenuo = {String(sqlResult.cartesianIfNaive)} righe</div>
              <pre className="inspect-pre">{JSON.stringify(sqlResult.row, null, 2)}</pre>
              <p>Una riga → oggetto UI. Il conteggio ingenuo mostra il prodotto cartesiano che abbiamo evitato. SQLite è il motore della lezione, non un confronto di performance con Atlas.</p>
            </div>
          )}
          {scene === 7 && (
            <div className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }}>
              <p>Tre cambi prodotto. Francesca e altri documenti restano senza i nuovi campi.</p>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "hobbies" }).then(loadDoc)}>Aggiungi hobby</button>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "pronouns" }).then(loadDoc)}>Pronomi opzionali</button>
              <button className="btn btn-primary" onClick={() => post("evolve", { feature: "organizer" }).then(loadDoc)}>Profilo organizzatore</button>
              <p className="kicker">SQL: CREATE/ALTER. MongoDB: campi opzionali. UI: assenza gestita. Feature = frontend + backend in entrambi i mondi. ALTER non significa downtime.</p>
            </div>
          )}
          {scene === 8 && (
            <Quiz quizOpen={quizOpen} setQuizOpen={setQuizOpen} />
          )}
        </div>

        <div className="surface" style={{ padding: "0.9rem" }}>
          <div className="kicker">Documento MongoDB {docSource && `· ${docSource}`}</div>
          {scene >= 6 && animStep > 0 && (
            <p className="kicker">Passo animazione {animStep}/3: {["", "righe", "gruppi nidificati", "documento"][animStep]}</p>
          )}
          <div style={{ maxHeight: 520, overflow: "auto" }}>
            {document ? (
              <JsonDoc value={stripMongo(document)} highlight={mongoPath} />
            ) : (
              <p>Apri la scena 6 per la lettura del documento, oppure resta sulle tabelle.</p>
            )}
          </div>
        </div>
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
      q: "Perché settings e l’abbonamento corrente stanno nel documento user, mentre i messaggi no?",
      a: "Si incorporano dati limitati e letti insieme alla card (1:1 / 1:corrente). I messaggi crescono senza bound: collection referenziata. Vedi unbounded arrays.",
    },
    {
      q: "Se metto 10.000 like dentro il documento user, quale anti-pattern tocco?",
      a: "Array non limitato. Peggiora documento, indici e scritture. Like e pass stanno in bootcamp_interactions.",
    },
    {
      q: "Like reciproci creano un match in un’altra collection. L’atomicità del singolo documento copre anche questa operazione?",
      a: "No. Atomicità del documento ≠ transazione multi-documento automatica. Servono unicità sul pairKey e upsert idempotenti, altrimenti due like simultanei possono perdere o duplicare il match. Evitare JOIN su questo aggregato non significa che MongoDB non sappia fare $lookup.",
    },
  ];
  return (
    <div className="surface" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Quiz lampo</h3>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <p><strong>{i + 1}. {item.q}</strong></p>
          <button className="btn btn-quiet" onClick={() => setQuizOpen(quizOpen === i ? null : i)}>
            {quizOpen === i ? "Nascondi" : "Rivela"}
          </button>
          {quizOpen === i && <p className="rise">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}
