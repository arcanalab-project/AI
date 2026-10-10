"use client";

import { useCallback, useEffect, useState } from "react";
import { Inspector } from "./Inspector";
import { JsonDoc } from "./JsonDoc";
import { ProfileCard, type CardPerson } from "./ProfileCard";
import { isLiveUnavailable, liveGet, livePost, STATIC_LIVE_CONNECTION } from "@/lib/liveClient";
import type { ConnectionState, InspectorRecord } from "@/lib/types";

type Identity = { profileId: string; displayName: string; city: string; age: number; gender: string };
type MatchRow = { matchId: string; other: CardPerson & { profileId: string }; pairKey: string };

export function LiveView() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [me, setMe] = useState<string>("giulia");
  const [user, setUser] = useState<CardPerson | null>(null);
  const [cards, setCards] = useState<(CardPerson & { profileId: string })[]>([]);
  const [idx, setIdx] = useState(0);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ fromProfileId: string; body: string; createdAt: string }[]>([]);
  const [inspector, setInspector] = useState<InspectorRecord | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "mvp" | "lesson">(null);
  const [panel, setPanel] = useState<"discover" | "edit" | "prefs" | "sub" | "events">("discover");
  const [behind, setBehind] = useState<unknown>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const flash = (t: string) => {
    setSaved(t);
    setTimeout(() => setSaved(null), 2500);
  };

  const loadMe = useCallback(async (id: string) => {
    const json = await liveGet(`/api/live?op=me&profileId=${id}`);
    setUser(json.user);
    setConnection(json.connection);
    setError(null);
  }, []);

  const loadDiscovery = useCallback(async (id: string) => {
    const json = await liveGet(`/api/live?op=discovery&profileId=${id}`);
    setCards(json.cards ?? []);
    setIdx(0);
    if (json.inspector) setInspector(json.inspector);
    setBehind({ filter: json.filter, semantics: json.semantics });
  }, []);

  const loadMatches = useCallback(async (id: string) => {
    const json = await liveGet(`/api/live?op=matches&profileId=${id}`);
    setMatches(json.matches ?? []);
  }, []);

  useEffect(() => {
    liveGet("/api/status")
      .then((j) => setConnection(j.connection))
      .catch(() => setConnection(STATIC_LIVE_CONNECTION));
    liveGet("/api/live?op=identities")
      .then((j) => setIdentities(j.identities ?? []))
      .catch((e) => {
        if (isLiveUnavailable(e)) {
          setConnection(STATIC_LIVE_CONNECTION);
          setIdentities([]);
          setError(null);
          return;
        }
        setError(String(e));
      });
  }, []);

  useEffect(() => {
    loadMe(me)
      .then(() => loadDiscovery(me))
      .then(() => loadMatches(me))
      .catch((e) => {
        if (isLiveUnavailable(e)) {
          setConnection(STATIC_LIVE_CONNECTION);
          setError(null);
          return;
        }
        setError(e.message);
      });
  }, [me, loadMe, loadDiscovery, loadMatches]);

  async function post(body: object) {
    setBusy(true);
    try {
      const json = await livePost(body);
      if (json.inspector) {
        setInspector(json.inspector);
        setInspectOpen(true);
      }
      return json;
    } catch (e) {
      if (isLiveUnavailable(e)) {
        setConnection(STATIC_LIVE_CONNECTION);
        throw new Error(STATIC_LIVE_CONNECTION.error);
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const card = cards[idx];

  async function judge(type: "like" | "pass") {
    if (!card) return;
    const json = await post({ action: "like", fromProfileId: me, toProfileId: card.profileId, type });
    flash(json.matchCreated ? "It's a match!" : type === "like" ? "Like saved" : "Pass saved");
    await loadDiscovery(me);
    await loadMatches(me);
  }

  async function openThread(id: string) {
    setMatchId(id);
    const json = await liveGet(`/api/live?op=messages&matchId=${id}`);
    setMessages(json.messages ?? []);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ color: "white" }}>
          <span className="kicker">Demo identity — this is not a sign-up</span>
          <select value={me} onChange={(e) => setMe(e.target.value)} aria-label="Demo identity">
            {identities.map((i) => (
              <option key={i.profileId} value={i.profileId}>
                {i.displayName} · {i.city} · {i.age}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => post({ action: "prepare" }).then(() => { flash("Match scenario ready"); loadDiscovery(me); loadMatches(me); })}>
            Prepare Giulia ↔ Luca scenario
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm("mvp")}>Reset MVP dataset</button>
          <button className="btn btn-ghost" onClick={() => setConfirm("lesson")}>Reset lesson dataset</button>
        </div>
      </div>

      {connection && (
        <div className={connection.mode === "offline" ? "error-banner" : "ok-banner"} style={{ marginBottom: 12 }}>
          {connection.mode === "atlas" && `Atlas live · DB ${connection.db} · ${connection.host}`}
          {connection.mode === "embedded" && `Offline embedded MongoDB (NOT Atlas) · ${connection.host}. Set MONGODB_URI for federazionecup.7qr2i.mongodb.net / TIN.`}
          {connection.mode === "offline" && `Offline: ${connection.error ?? "MONGODB_URI missing. No Atlas persistence."}`}
        </div>
      )}
      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
      {saved && <div className="ok-banner" style={{ marginBottom: 12 }}>{saved}</div>}

      {confirm && (
        <div className="surface" style={{ padding: "1rem", marginBottom: 12 }}>
          <strong>Confirm reset</strong>
          <p>
            Only <code className="code">bootcamp_*</code> documents with
            <code className="code"> datasetId={confirm}</code> will be deleted and reseeded. The TIN database is not dropped. Non-demo collections stay intact.
          </p>
          <button className="btn btn-primary" onClick={async () => { await post({ action: "reset", dataset: confirm }); setConfirm(null); flash(`Dataset ${confirm} restored`); await loadMe(me); await loadDiscovery(me); }}>
            Restore {confirm}
          </button>{" "}
          <button className="btn btn-navy" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(["discover", "edit", "prefs", "sub", "events"] as const).map((p) => (
          <button key={p} className="tab" role="tab" aria-selected={panel === p} onClick={() => setPanel(p)}>
            {{ discover: "Discovery", edit: "Profile", prefs: "Preferences", sub: "Subscription", events: "Events" }[p]}
          </button>
        ))}
      </div>

      <div className="live-grid">
        <div>
          {user && <ProfileCard person={user} compact />}
          <p className="kicker">You, now: demo identity</p>
        </div>

        <div>
          {panel === "discover" && (
            <div>
              {card ? (
                <>
                  <ProfileCard person={card} />
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => judge("pass")}>Pass</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => judge("like")}>Like</button>
                  </div>
                  <p className="kicker">{idx + 1}/{cards.length} · filters: distance, age, gender, no self/hidden/paused/already judged</p>
                </>
              ) : (
                <div className="empty" style={{ background: "white", minHeight: 220, display: "flex", alignItems: "center" }}>
                  No cards in discovery. Widen the distance, switch identity, or “Prepare Giulia ↔ Luca scenario”.
                </div>
              )}
            </div>
          )}
          {panel === "edit" && user && (
            <ProfileForm user={user} busy={busy} onSave={async (patch) => {
              const json = await post({ action: "profile", profileId: me, patch });
              setUser(json.user);
              flash("Profile saved on the server");
            }} />
          )}
          {panel === "prefs" && user?.settings && (
            <PrefsForm settings={user.settings} busy={busy} onSave={async (patch) => {
              const json = await post({ action: "settings", profileId: me, patch });
              setUser(json.user);
              flash("Preferences saved");
              await loadDiscovery(me);
            }} />
          )}
          {panel === "sub" && user?.subscription && (
            <SubForm sub={user.subscription} busy={busy} onSave={async (patch) => {
              const json = await post({ action: "subscription", profileId: me, patch });
              setUser(json.user);
              flash("Demo subscription saved — no real payment");
            }} />
          )}
          {panel === "events" && (
            <EventForm me={me} busy={busy} onCreate={async (payload) => {
              await post({ action: "event", ...payload, organizerProfileId: me });
              flash("Event created in bootcamp_events (referenced)");
              await loadMe(me);
            }} />
          )}
        </div>

        <div className="surface" style={{ padding: "0.9rem" }}>
          <h3 style={{ marginTop: 0 }}>Matches and messages</h3>
          {matches.length === 0 && <div className="empty">No matches. Reciprocal likes Giulia ↔ Luca.</div>}
          {matches.map((m) => (
            <button key={m.matchId} className="btn btn-quiet" style={{ width: "100%", marginBottom: 6 }} onClick={() => openThread(m.matchId)}>
              {m.other?.displayName ?? m.pairKey}
            </button>
          ))}
          {matchId && (
            <div>
              <div style={{ maxHeight: 240, overflow: "auto", margin: "8px 0" }}>
                {messages.map((m, i) => (
                  <p key={i} style={{ textAlign: m.fromProfileId === me ? "right" : "left" }}>
                    <span className="chip" style={{ background: m.fromProfileId === me ? "#00ED64" : "#E3FCF7", color: "#001E2B" }}>{m.body}</span>
                  </p>
                ))}
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!msg.trim()) return;
                await post({ action: "message", matchId, fromProfileId: me, body: msg });
                setMsg("");
                await openThread(matchId);
                flash("Message persisted");
              }}>
                <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write…" />
                <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={busy}>Send</button>
              </form>
            </div>
          )}
          <button className="btn btn-navy" style={{ marginTop: 12 }} onClick={() => setInspectOpen(true)}>Behind the scenes</button>
          {behind ? (
            <div style={{ marginTop: 12 }}>
              <div className="kicker">Last discovery filter</div>
              <JsonDoc value={behind} />
            </div>
          ) : null}
        </div>
      </div>
      <Inspector record={inspector} open={inspectOpen} onToggle={() => setInspectOpen((v) => !v)} />
    </div>
  );
}

function ProfileForm({ user, onSave, busy }: { user: CardPerson; onSave: (p: object) => Promise<void>; busy: boolean }) {
  return (
    <form className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const hobbies = String(fd.get("hobbies") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const pronouns = String(fd.get("pronouns") ?? "").trim();
      await onSave({
        displayName: fd.get("displayName"),
        bio: fd.get("bio"),
        city: fd.get("city"),
        profession: fd.get("profession") || null,
        interests: String(fd.get("interests")).split(",").map((s) => s.trim()).filter(Boolean),
        hobbies: hobbies.length ? hobbies : null,
        pronouns: pronouns || null,
      });
    }}>
      <h3 style={{ margin: 0 }}>Edit profile</h3>
      <label>Name <input name="displayName" defaultValue={user.displayName} required /></label>
      <label>City <input name="city" defaultValue={user.city} /></label>
      <label>Profession <input name="profession" defaultValue={user.profession ?? ""} /></label>
      <label>Bio <textarea name="bio" defaultValue={user.bio ?? ""} rows={3} /></label>
      <label>Interests (comma-separated) <input name="interests" defaultValue={user.interests.join(", ")} /></label>
      <label>Optional hobbies <input name="hobbies" defaultValue={(user.hobbies ?? []).join(", ")} /></label>
      <label>Optional pronouns <input name="pronouns" defaultValue={user.pronouns ?? ""} /></label>
      <button className="btn btn-primary" disabled={busy}>Save (after server confirm)</button>
    </form>
  );
}

function PrefsForm({ settings, onSave, busy }: { settings: NonNullable<CardPerson["settings"]>; onSave: (p: object) => Promise<void>; busy: boolean }) {
  return (
    <form className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      await onSave({
        discoveryDistanceKm: Number(fd.get("km")),
        minDesiredAge: Number(fd.get("min")),
        maxDesiredAge: Number(fd.get("max")),
        notificationsEnabled: fd.get("n") === "on",
        profileVisibility: fd.get("vis"),
        pausedAccount: fd.get("p") === "on",
        genderPreferences: fd.getAll("g"),
      });
    }}>
      <h3 style={{ margin: 0 }}>Preferences (they affect discovery)</h3>
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
      <label><input name="p" type="checkbox" defaultChecked={settings.pausedAccount} /> Pause</label>
      {["woman", "man", "nonbinary", "unspecified"].map((g) => (
        <label key={g}><input name="g" type="checkbox" value={g} defaultChecked={settings.genderPreferences.includes(g)} /> {g}</label>
      ))}
      <button className="btn btn-primary" disabled={busy}>Save preferences</button>
    </form>
  );
}

function SubForm({ sub, onSave, busy }: { sub: NonNullable<CardPerson["subscription"]>; onSave: (p: object) => Promise<void>; busy: boolean }) {
  return (
    <form className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      await onSave({ plan: fd.get("plan"), paymentStatus: fd.get("st"), autoRenew: fd.get("ar") === "on" });
    }}>
      <h3 style={{ margin: 0 }}>Demo subscription</h3>
      <label>Plan <select name="plan" defaultValue={sub.plan}><option>Free</option><option>Premium</option><option>Gold</option></select></label>
      <label>Payment status <select name="st" defaultValue={sub.paymentStatus}><option>Success</option><option>Failed</option><option>Pending</option></select></label>
      <label><input name="ar" type="checkbox" defaultChecked={sub.autoRenew} /> Auto-renew</label>
      <button className="btn btn-primary" disabled={busy}>Save</button>
    </form>
  );
}

function EventForm({ me, onCreate, busy }: { me: string; onCreate: (p: object) => Promise<void>; busy: boolean }) {
  return (
    <form className="surface" style={{ padding: "1rem", display: "grid", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      await onCreate({
        title: fd.get("title"),
        city: fd.get("city"),
        startsAt: fd.get("startsAt"),
        description: fd.get("description"),
      });
    }}>
      <h3 style={{ margin: 0 }}>Create event</h3>
      <p>Collection <code className="code">bootcamp_events</code>, reference to organizer {me}. On the profile, only a bounded summary (max 3).</p>
      <label>Title <input name="title" required /></label>
      <label>City <input name="city" defaultValue="Milano" /></label>
      <label>Start <input name="startsAt" type="datetime-local" required /></label>
      <label>Description <textarea name="description" rows={2} /></label>
      <button className="btn btn-primary" disabled={busy}>Create event</button>
    </form>
  );
}
