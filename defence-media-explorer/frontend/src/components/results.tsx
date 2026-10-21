"use client";

import Link from "next/link";
import { ArrowUpRight, Info, ScanSearch } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@/components/ui";
import { Clock, LocalDate } from "@/components/format";
import { statusTone } from "@/components/shell";
import type { SearchResult } from "@/lib/api";

export function ResultGrid({ results }: { results: SearchResult[] }) {
  const t = useTranslations();
  if (!results.length) return <p className="text-sm text-[var(--muted)]">{t("search.empty")}</p>;
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>{t("search.rank", { rank: "#" })}</th>
            <th>{t("search.mediaType")}</th>
            <th>{t("common.details")}</th>
            <th>{t("search.source")}</th>
            <th>{t("asset.captured")}</th>
            <th>{t("search.processingStatus")}</th>
            <th>{t("asset.timeline")}</th>
            <th>{t("common.open")}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.segmentId}>
              <td className="num">{result.rank}</td>
              <td>
                <Badge>{t.has(`mediaType.${result.mediaType}`) ? t(`mediaType.${result.mediaType}`) : t("mediaType.unknown")}</Badge>
              </td>
              <td>
                <div className="flex items-start gap-3">
                  {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="thumb" /> : <span className="thumb" />}
                  <div className="min-w-0">
                    <p className="break-words font-sans font-semibold text-[var(--ink)]">{result.title || t("common.unknown")}</p>
                    {result.matchText ? <p className="match-text">{result.matchText}</p> : null}
                    {result.nearbyCount > 0 ? <p className="text-[var(--muted)]">{t("search.nearby", { count: result.nearbyCount })}</p> : null}
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap">{result.source || t("common.notAvailable")}</td>
              <td className="whitespace-nowrap">{result.captureDateUnknown ? t("search.captureUnknown") : <LocalDate value={result.capturedAt} />}</td>
              <td>
                {result.processingStatus ? (
                  <Badge tone={statusTone(result.processingStatus)}>
                    {t.has(`status.${result.processingStatus}`) ? t(`status.${result.processingStatus}`) : t("status.unknown")}
                  </Badge>
                ) : (
                  t("common.notAvailable")
                )}
              </td>
              <td className="num whitespace-nowrap">
                <Clock ms={result.startMs} />
                {result.endMs != null ? (
                  <>
                    {" – "}
                    <Clock ms={result.endMs} />
                  </>
                ) : null}
              </td>
              <td>
                <div className="action-bar">
                  <ActionLink href={assetHref(result)} label={t("common.open")}>
                    <ArrowUpRight aria-hidden size={15} />
                  </ActionLink>
                  <ActionLink href={`/assets/${result.assetId}?segment=${encodeURIComponent(result.segmentId)}&similar=1`} label={t("search.findSimilar")}>
                    <ScanSearch aria-hidden size={15} />
                  </ActionLink>
                  <ActionLink href={`/assets/${result.assetId}?segment=${encodeURIComponent(result.segmentId)}#metadata`} label={t("common.details")}>
                    <Info aria-hidden size={15} />
                  </ActionLink>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActionLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="icon-btn" aria-label={label} title={label}>
      {children}
    </Link>
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
    <div className="metric space-y-0.5 text-xs leading-snug text-[var(--muted)]">
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
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("common.previous")}
      </Button>
      <p className="num text-xs">{pages != null ? t("common.pageKnown", { page: format.number(page), pages: format.number(pages) }) : t("common.pageOpen", { page: format.number(page) })}</p>
      <Button type="button" variant="quiet" disabled={pages != null ? page >= pages : returned < pageSize} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </Button>
    </div>
  );
}
