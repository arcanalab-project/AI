"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { usePrefs } from "@/lib/preferences";

export function LocalDate({ value }: { value?: string | null }) {
  const t = useTranslations();
  const format = useFormatter();
  const { timeZone } = usePrefs();
  if (!value) return <>{t("common.unknownDate")}</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{t("common.unknownDate")}</>;
  return <>{format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone })}</>;
}

export function LocalNumber({ value }: { value?: number | null }) {
  const t = useTranslations();
  const format = useFormatter();
  if (value == null || Number.isNaN(value)) return <>{t("common.notAvailable")}</>;
  return <>{format.number(value)}</>;
}

export function Clock({ ms }: { ms?: number | null }) {
  const t = useTranslations();
  if (ms == null) return <>{t("common.notAvailable")}</>;
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <>{hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`}</>;
}

export function DurationText({ ms }: { ms?: number | null }) {
  const t = useTranslations("common.duration");
  const locale = useLocale();
  if (ms == null || Number.isNaN(ms)) return <>{t("unknown")}</>;
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [
    hours ? t("hours", { count: hours }) : "",
    minutes || hours ? t("minutes", { count: minutes }) : "",
    t("seconds", { count: seconds }),
  ].filter(Boolean);
  const spoken = new Intl.ListFormat(locale, { type: "unit" }).format(parts);
  return (
    <>
      {spoken} <span className="text-[var(--muted)]">({timecode(ms)})</span>
    </>
  );
}

export function FileSize({ bytes }: { bytes?: number | null }) {
  const t = useTranslations("common.size");
  const format = useFormatter();
  if (bytes == null || Number.isNaN(bytes)) return <>{t("unknown")}</>;
  if (bytes < 1024) return <>{t("bytes", { value: format.number(bytes) })}</>;
  if (bytes < 1024 * 1024) return <>{t("kilobytes", { value: format.number(bytes / 1024, { maximumFractionDigits: 1 }) })}</>;
  return <>{t("megabytes", { value: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) })}</>;
}

function timecode(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function useLocaleTag() {
  return useLocale();
}
