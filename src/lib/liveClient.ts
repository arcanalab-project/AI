import { withBase } from "./paths";
import type { ConnectionState } from "./types";

export const STATIC_LIVE_CONNECTION: ConnectionState = {
  mode: "offline",
  db: "TIN",
  error:
    "This host has no live API. The lesson tab works in the browser with no install. Live MVP needs a Node host (Vercel, Fly.io, or Render) with MONGODB_URI and MONGODB_DB=TIN.",
};

export async function liveGet(path: string) {
  const res = await fetch(withBase(path), { cache: "no-store" });
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("json")) {
    const err = new Error("LIVE_UNAVAILABLE");
    (err as Error & { unavailable: boolean }).unavailable = true;
    throw err;
  }
  return res.json();
}

export async function livePost(body: object) {
  const res = await fetch(withBase("/api/live"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Error");
  return json;
}

export function isLiveUnavailable(err: unknown): boolean {
  if (err && typeof err === "object" && "unavailable" in err) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /LIVE_UNAVAILABLE|Failed to fetch|NetworkError|404/.test(msg);
}
