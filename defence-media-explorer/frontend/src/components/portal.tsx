"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LOCALES, api, asApiError, type ApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Button, FieldLabel, TextInput } from "@/components/ui";
import { ErrorNote } from "@/components/shell";

export function PortalHome() {
  const t = useTranslations();
  const { user, ready, locale, setLocale } = usePrefs();

  return (
    <article className="landing">
      <div className="landing-media" aria-hidden={false}>
        <img src="/portal-cover.jpg" alt={t("portal.coverAlt")} />
        <div className="landing-shade" />
      </div>
      <div className="landing-shell">
        <header className="landing-top">
          <Link href="/" className="landing-brand">
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
            <span className="landing-brand-name">{t("meta.product")}</span>
          </Link>
          <label className="landing-lang">
            <span className="sr-only">{t("settings.language")}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as (typeof LOCALES)[number])}>
              {LOCALES.map((item) => (
                <option key={item} value={item}>
                  {t(`language.${item}`)}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main id="content" tabIndex={-1} className="landing-hero">
          <h1 className="landing-title">
            <span className="landing-product">{t("portal.product")}</span>
            <span className="landing-subtitle">{t("portal.subtitle")}</span>
          </h1>
          <div className="landing-copy">
            <p>{t("portal.lead")}</p>
            <p>{t("portal.detail")}</p>
            <p>{t("portal.outcome")}</p>
          </div>
          <AccessPanel ready={ready} signedIn={!!user} />
        </main>
      </div>
    </article>
  );
}

function AccessPanel({ ready, signedIn }: { ready: boolean; signedIn: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const { refreshUser } = usePrefs();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await refreshUser();
      router.push("/search");
    } catch (reason) {
      setError(asApiError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="landing-access" aria-busy="true">
        <p className="landing-status">{t("common.loading")}</p>
      </section>
    );
  }

  if (signedIn) {
    return (
      <section className="landing-access" aria-label={t("portal.enter")}>
        <Link href="/search" className="btn btn-primary landing-submit">
          {t("portal.enter")}
        </Link>
      </section>
    );
  }

  return (
    <section className="landing-access" aria-labelledby="secure-access">
      <h2 id="secure-access">{t("portal.accessTitle")}</h2>
      <form className="landing-form" onSubmit={(event) => void submit(event)}>
        <ErrorNote error={error} />
        <FieldLabel label={t("auth.email")}>
          <TextInput type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </FieldLabel>
        <FieldLabel label={t("auth.password")}>
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </FieldLabel>
        <Button type="submit" className="landing-submit" disabled={busy}>
          {busy ? t("auth.working") : t("portal.signIn")}
        </Button>
      </form>
    </section>
  );
}
