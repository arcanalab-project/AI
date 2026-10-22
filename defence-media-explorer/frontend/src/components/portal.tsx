"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePrefs } from "@/lib/preferences";

const POINTS = ["archive", "search", "marking"] as const;

export function PortalHome() {
  const t = useTranslations();
  const { user } = usePrefs();

  return (
    <article className="portal">
      <figure className="portal-cover">
        <img src="/portal-cover.jpg" alt={t("portal.coverAlt")} />
      </figure>
      <header className="portal-intro">
        <p className="page-kicker">{t("portal.kicker")}</p>
        <h1 className="portal-title">{t("portal.title")}</h1>
        <p className="portal-lede">{t("portal.lede")}</p>
      </header>
      <p className="portal-body">{t("portal.body")}</p>
      <div className="portal-points">
        {POINTS.map((key) => (
          <section key={key} className="panel portal-point">
            <h2>{t(`portal.points.${key}.title`)}</h2>
            <p>{t(`portal.points.${key}.body`)}</p>
          </section>
        ))}
      </div>
      <div className="portal-actions">
        <Link href="/search" className="btn btn-primary">
          {t("portal.openSearch")}
        </Link>
        {user ? null : (
          <Link href="/login" className="btn btn-quiet">
            {t("portal.signIn")}
          </Link>
        )}
      </div>
    </article>
  );
}
