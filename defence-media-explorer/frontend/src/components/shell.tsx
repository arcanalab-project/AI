"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Activity, FolderClosed, Library, Search, Settings, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatZulu } from "@/components/format";
import { message } from "@/i18n";
import { ApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";

const LINKS = [
  ["/", "nav.search", Search],
  ["/upload", "nav.upload", Upload],
  ["/library", "nav.library", Library],
  ["/processing", "nav.processing", Activity],
  ["/collections", "nav.collections", FolderClosed],
  ["/settings", "nav.settings", Settings],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, ready, setUser, locale } = usePrefs();
  const router = useRouter();
  const open = ["/login", "/settings"].includes(pathname) || !!user;
  const isHome = pathname === "/";
  const sync = useSync();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "X-DME-Request": "1" } });
    setUser(null);
    router.push("/login");
  }

  return (
    <div className="app-frame">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-[var(--primary)] focus:px-3 focus:py-1 focus:text-white">
        {t("nav.skip")}
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="18" height="18">
              <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              {[
                ["16", "4"],
                ["22", "5.61"],
                ["26.39", "10"],
                ["28", "16"],
                ["26.39", "22"],
                ["22", "26.39"],
                ["16", "28"],
                ["10", "26.39"],
                ["5.61", "22"],
                ["4", "16"],
                ["5.61", "10"],
                ["10", "5.61"],
              ].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />
              ))}
            </svg>
          </span>
          <span className="min-w-0">
            <span className="brand-kicker">{t("meta.product")}</span>
            <span className="brand-name">{t("meta.appName")}</span>
          </span>
        </Link>
        <nav aria-label={t("nav.primary")} className="side-nav">
          {LINKS.map(([href, key, Icon]) => (
            <Link key={href} href={href} className="side-link" aria-current={pathname === href ? "page" : undefined}>
              <Icon aria-hidden size={15} strokeWidth={2} />
              <span>{t(key)}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="command-bar">
          <div className="command-center">
            <span className="mark mark-restricted">{t("security.classification.restricted")}</span>
          </div>
          <div className="command-meta">
            <UtcClock label={t("shell.zulu")} />
            <span className="text-xs text-[var(--muted)]">{user ? user.displayName : t("shell.operator")}</span>
            <span className="sync" data-state={sync} aria-live="polite">
              <i aria-hidden />
              {sync === "pending" ? t("shell.syncPending") : t(sync === "live" ? "shell.syncLive" : sync === "degraded" ? "shell.syncDegraded" : "shell.syncOffline")}
            </span>
            <span className="mark mark-critical">{t("security.classification.restricted")}</span>
            <span className="mark mark-unclassified">{t("security.classification.unclassified")}</span>
            {user ? (
              <button type="button" className="btn btn-quiet" onClick={() => void logout()}>
                {t("nav.logout")}
              </button>
            ) : (
              <Link href="/login" className="btn btn-primary">
                {t("nav.login")}
              </Link>
            )}
          </div>
        </header>
        <main id="content" className="command-main">
          {!isHome && !ready && pathname !== "/login" && pathname !== "/settings" ? (
            <p className="text-[var(--muted)]">{t("common.loading")}</p>
          ) : !isHome && ready && !open ? (
            <Gate />
          ) : (
            <Suspense fallback={<p className="text-[var(--muted)]">{t("common.loading")}</p>}>{children}</Suspense>
          )}
        </main>
        <footer className="border-t border-[var(--line)] px-3 py-3 text-sm text-[var(--muted)]">
          <a href="https://marionoioso.com/" rel="author">
            Built by Mario Noioso · marionoioso.com
          </a>
        </footer>
      </div>
    </div>
  );
}

function UtcClock({ label }: { label: string }) {
  const [stamp, setStamp] = useState("");
  const [iso, setIso] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setStamp(formatZulu(now, true));
      setIso(now.toISOString());
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time className="num text-xs text-[var(--ink)]" dateTime={iso || undefined} aria-label={label}>
      {stamp || "0000-00-00 00:00:00Z"}
    </time>
  );
}

function useSync() {
  const [status, setStatus] = useState<"pending" | "live" | "degraded" | "offline">("pending");
  useEffect(() => {
    let cancel = false;
    async function tick() {
      try {
        const response = await fetch("/api/health", { credentials: "include" });
        if (!response.ok) throw new Error("health");
        const data = (await response.json()) as { status?: string };
        if (!cancel) setStatus(data.status === "ok" ? "live" : "degraded");
      } catch {
        if (!cancel) setStatus("offline");
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 15000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, []);
  return status;
}

function Gate() {
  const t = useTranslations();
  return (
    <section className="panel mx-auto max-w-xl space-y-3 p-3">
      <h1 className="page-title">{t("auth.requiredTitle")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("auth.requiredBody")}</p>
      <Link href="/login" className="btn btn-primary">
        {t("nav.login")}
      </Link>
    </section>
  );
}

export function ErrorNote({ error }: { error: ApiError | null }) {
  const t = useTranslations();
  if (!error) return null;
  const text = message(t, `errors.${error.code}`, t("errors.UNKNOWN"));
  const details = Object.entries(error.params).flatMap(([name, value]) => {
    if (value == null || value === "") return [];
    const shown = Array.isArray(value) ? value.join(", ") : String(value);
    const line = message(t, `errors.params.${name}`, "", { value: shown });
    return line ? [line] : [];
  });
  return (
    <div role="alert" className="border border-[var(--danger)] bg-[var(--danger-fill)] px-3 py-2 text-sm leading-snug text-[#F8FAFC]">
      <p>{text}</p>
      {details.map((detail) => (
        <p key={detail} className="mt-1">
          {detail}
        </p>
      ))}
    </div>
  );
}

export function PageIntro({ kicker, title, body }: { kicker?: string; title: string; body?: string }) {
  return (
    <header className="mb-3 max-w-4xl">
      {kicker ? <p className="page-kicker">{kicker}</p> : null}
      <h1 className="page-title">{title}</h1>
      {body ? <p className="mt-1 text-sm leading-snug text-[var(--muted)]">{body}</p> : null}
    </header>
  );
}

export function statusTone(status?: string | null): "neutral" | "ok" | "warn" | "danger" {
  if (status === "ready") return "ok";
  if (status === "failed") return "danger";
  if (status === "partial") return "warn";
  return "neutral";
}
