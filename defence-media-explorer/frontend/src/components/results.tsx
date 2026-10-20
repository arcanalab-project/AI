"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@/components/ui";
import { Clock, LocalDate } from "@/components/format";
import type { SearchResult } from "@/lib/api";

export function ResultGrid({ results }: { results: SearchResult[] }) {
  const t = useTranslations();
  if (!results.length) return <p className="text-[var(--muted)]">{t("search.empty")}</p>;
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      {results.map((result) => (
        <article key={result.segmentId} className="panel flex min-w-0 flex-col">
          <div className="aspect-video overflow-hidden rounded-t-[20px] bg-[#001E2B]">
            {result.thumbnailUrl ? (
              <img src={result.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-sm font-semibold text-spring">
                {t.has(`mediaType.${result.mediaType}`) ? t(`mediaType.${result.mediaType}`) : t("mediaType.unknown")}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge>{t.has(`mediaType.${result.mediaType}`) ? t(`mediaType.${result.mediaType}`) : t("mediaType.unknown")}</Badge>
              <Badge tone="ok">{t("search.rank", { rank: result.rank })}</Badge>
              {result.processingStatus ? (
                <Badge tone={result.processingStatus === "failed" ? "danger" : result.processingStatus === "partial" ? "warn" : "neutral"}>
                  {t.has(`status.${result.processingStatus}`) ? t(`status.${result.processingStatus}`) : t("status.unknown")}
                </Badge>
              ) : null}
            </div>
            <h3 className="break-words font-serif text-2xl leading-tight">{result.title || t("common.unknown")}</h3>
            <p className="break-words text-sm leading-snug text-[var(--muted)]">
              {result.source || t("common.notAvailable")}
              {" · "}
              {result.captureDateUnknown ? t("search.captureUnknown") : <LocalDate value={result.capturedAt} />}
            </p>
            {result.matchText ? (
              <p className="break-words text-sm leading-relaxed">
                <span className="font-semibold">{t("search.match")}: </span>
                {result.matchText}
              </p>
            ) : null}
            <p className="text-sm">
              <Clock ms={result.startMs} />
              {result.endMs != null ? (
                <>
                  {" – "}
                  <Clock ms={result.endMs} />
                </>
              ) : null}
            </p>
            {result.nearbyCount > 0 ? <p className="text-sm leading-snug text-[var(--muted)]">{t("search.nearby", { count: result.nearbyCount })}</p> : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Link href={assetHref(result)} className="inline-flex max-w-full whitespace-normal break-words rounded-full bg-spring px-4 py-2.5 text-sm font-semibold leading-snug text-[#001E2B]">
                {t("common.open")}
              </Link>
              <Link
                href={`/assets/${result.assetId}?segment=${encodeURIComponent(result.segmentId)}&similar=1`}
                className="inline-flex max-w-full whitespace-normal break-words rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold leading-snug"
              >
                {t("search.findSimilar")}
              </Link>
              <Link
                href={`/assets/${result.assetId}?segment=${encodeURIComponent(result.segmentId)}#metadata`}
                className="inline-flex max-w-full whitespace-normal break-words rounded-full px-4 py-2.5 text-sm font-semibold leading-snug"
              >
                {t("common.details")}
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function assetHref(result: SearchResult) {
  const params = new URLSearchParams();
  params.set("segment", result.segmentId);
  if (result.startMs != null) params.set("t", String(result.startMs));
  return `/assets/${result.assetId}?${params.toString()}`;
}

export function CountLine({
  countKind,
  retrievedCandidateCount,
  completeMatchCount,
  assetCount,
  returnedCount,
  elapsedMs,
}: {
  countKind?: string | null;
  retrievedCandidateCount?: number | null;
  completeMatchCount?: number | null;
  assetCount?: number | null;
  returnedCount?: number | null;
  elapsedMs?: number | null;
}) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <div className="space-y-1 text-sm leading-snug text-[var(--muted)]">
      {countKind === "retrieved_candidates" ? (
        <>
          <p>{t("search.candidates", { count: retrievedCandidateCount || 0 })}</p>
          <p>{t("search.notComplete")}</p>
        </>
      ) : null}
      {countKind === "matching_segments" ? (
        <p>
          {t("search.segments", { count: completeMatchCount || 0 })}
          {assetCount != null ? ` · ${t("search.assets", { count: assetCount })}` : ""}
        </p>
      ) : null}
      {countKind === "matching_assets" ? <p>{t("library.count", { count: completeMatchCount || 0 })}</p> : null}
      {returnedCount != null ? null : null}
      {typeof elapsedMs === "number" ? <p>{t("search.elapsed", { value: format.number(elapsedMs) })}</p> : null}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  complete,
  returned,
  onPage,
}: {
  page: number;
  pageSize: number;
  complete: number | null;
  returned: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const pages = complete != null ? Math.max(1, Math.ceil(complete / pageSize)) : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("common.previous")}
      </Button>
      <p className="text-sm">{pages != null ? t("common.pageKnown", { page: format.number(page), pages: format.number(pages) }) : t("common.pageOpen", { page: format.number(page) })}</p>
      <Button type="button" variant="quiet" disabled={pages != null ? page >= pages : returned < pageSize} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </Button>
    </div>
  );
}
