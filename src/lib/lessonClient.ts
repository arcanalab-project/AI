import { offlineLessonGet, offlineLessonPost } from "./lessonOffline";
import { withBase } from "./paths";

type HostMode = "unknown" | "api" | "offline";

let mode: HostMode = "unknown";

export function lessonHostMode(): HostMode {
  return mode;
}

function missingApi(res: Response | null): boolean {
  if (!res) return true;
  if (res.status === 404 || res.status === 405) return true;
  const ct = res.headers.get("content-type") ?? "";
  if (res.ok && ct.includes("text/html") && !ct.includes("json")) return true;
  if (!res.ok && ct.includes("text/html")) return true;
  return false;
}

async function tryFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { cache: "no-store", ...init });
  } catch {
    return null;
  }
}

export async function lessonGet(op?: string) {
  if (mode !== "offline") {
    const path = op ? `/api/lesson?op=${encodeURIComponent(op)}` : "/api/lesson";
    const res = await tryFetch(withBase(path));
    if (res && res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        mode = "api";
        return res.json();
      }
    }
    if (mode === "api" && res && !res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? `Lesson API ${res.status}`);
    }
    if (missingApi(res)) mode = "offline";
    else if (res && !res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? `Lesson API ${res.status}`);
    }
  }
  return offlineLessonGet(op ?? "state");
}

export async function lessonPost(action: string, extra: object = {}) {
  if (mode === "unknown") {
    await lessonGet();
  }
  if (mode === "api") {
    const res = await tryFetch(withBase("/api/lesson"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res) {
      mode = "offline";
    } else {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Error");
      return json;
    }
  }
  return offlineLessonPost(action, extra as Record<string, unknown>);
}
