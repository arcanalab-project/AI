"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { cn } from "@/lib/cn";

const LINKS = [
  ["/", "nav.search"],
  ["/upload", "nav.upload"],
  ["/library", "nav.library"],
  ["/processing", "nav.processing"],
  ["/collections", "nav.collections"],
  ["/settings", "nav.settings"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, ready, setUser, locale } = usePrefs();
  const router = useRouter();
  const open = ["/login", "/settings"].includes(pathname) || !!user;

  useEffect(() => {
    document.title = t("meta.documentTitle");
    document.documentElement.lang = locale;
  }, [t, locale]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "X-DME-Request": "1" } });
    setUser(null);
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-spring focus:px-4 focus:py-2">
        {t("nav.skip")}
      </a>
      <div className="h-1 bg-spring" />
      <header className="border-b border-[var(--line)] bg-[var(--bg-elev)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#001E2B] text-spring" aria-hidden>
              <svg viewBox="0 0 32 32" width="24" height="24" className="h-6 w-6">
                <path d="M7 23c4.5-10 13.5-10 18 0" fill="none" stroke="currentColor" strokeWidth="2.4" />
                <circle cx="16" cy="13" r="2.2" fill="currentColor" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{t("meta.product")}</span>
              <span className="block font-serif text-lg leading-tight">{t("meta.appName")}</span>
            </span>
          </Link>
          <nav aria-label={t("nav.primary")} className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {LINKS.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "max-w-full whitespace-normal break-words rounded-full px-3 py-2 text-sm leading-snug",
                  pathname === href ? "bg-[#001E2B] text-white dark:bg-spring dark:text-[#001E2B]" : "hover:bg-[var(--bg)]",
                )}
                aria-current={pathname === href ? "page" : undefined}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {user ? (
              <>
                <span className="max-w-[16rem] leading-snug text-[var(--muted)]">{user.displayName}</span>
                <button type="button" className="rounded-full px-3 py-2 leading-snug hover:bg-[var(--bg)]" onClick={() => void logout()}>
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <Link href="/login" className="rounded-full bg-spring px-4 py-2 font-semibold text-[#001E2B]">
                {t("nav.login")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-6xl px-5 py-8">
        {!ready && pathname !== "/login" && pathname !== "/settings" ? (
          <p className="text-[var(--muted)]">{t("common.loading")}</p>
        ) : ready && !open ? (
          <Gate />
        ) : (
          <Suspense fallback={<p className="text-[var(--muted)]">{t("common.loading")}</p>}>{children}</Suspense>
        )}
      </main>
    </div>
  );
}

function Gate() {
  const t = useTranslations();
  return (
    <section className="panel mx-auto max-w-xl p-8">
      <h1 className="font-serif text-3xl">{t("auth.requiredTitle")}</h1>
      <p className="mt-3 text-[var(--muted)]">{t("auth.requiredBody")}</p>
      <Link href="/login" className="mt-6 inline-flex rounded-full bg-spring px-4 py-2.5 font-semibold text-[#001E2B]">
        {t("nav.login")}
      </Link>
    </section>
  );
}

export function ErrorNote({ error }: { error: ApiError | null }) {
  const t = useTranslations();
  if (!error) return null;
  const key = `errors.${error.code}`;
  const message = t.has(key) ? t(key) : t("errors.UNKNOWN");
  const details = Object.entries(error.params).flatMap(([name, value]) => {
    const paramKey = `errors.params.${name}`;
    if (value == null || value === "" || !t.has(paramKey)) return [];
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    return [t(paramKey, { value: text })];
  });
  return (
    <div role="alert" className="rounded-2xl border border-[var(--danger)] px-4 py-3 text-sm leading-snug text-[var(--danger)]">
      <p>{message}</p>
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
    <header className="mb-8 max-w-3xl">
      {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ok)]">{kicker}</p> : null}
      <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{title}</h1>
      {body ? <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">{body}</p> : null}
    </header>
  );
}
