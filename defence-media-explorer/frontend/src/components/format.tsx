"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";

/** Calendar timestamps are Zulu (YYYY-MM-DD HH:mmZ) in every locale. The live clock adds seconds. */
export function formatZulu(value: Date, withSeconds = false): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  const clock = withSeconds
    ? `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
    : `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  return `${day} ${clock}Z`;
}

export function LocalDate({ value }: { value?: string | null }) {
  const t = useTranslations();
  if (!value) return <>{t("common.unknownDate")}</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{t("common.unknownDate")}</>;
  return (
    <time className="num" dateTime={date.toISOString()}>
      {formatZulu(date)}
    </time>
  );
}

export function LocalNumber({ value }: { value?: number | null }) {
  const t = useTranslations();
  const format = useFormatter();
  if (value == null || Number.isNaN(value)) return <>{t("common.notAvailable")}</>;
  return <span className="num">{format.number(value)}</span>;
}

export function Clock({ ms }: { ms?: number | null }) {
  const t = useTranslations();
  if (ms == null) return <span className="num">{t("common.notAvailable")}</span>;
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="num">{hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`}</span>;
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
  if (bytes < 1024) return <span className="num">{t("bytes", { value: format.number(bytes) })}</span>;
  if (bytes < 1024 * 1024) return <span className="num">{t("kilobytes", { value: format.number(bytes / 1024, { maximumFractionDigits: 1 }) })}</span>;
  return <span className="num">{t("megabytes", { value: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) })}</span>;
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
