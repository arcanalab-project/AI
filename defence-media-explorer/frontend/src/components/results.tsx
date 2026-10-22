"use client";

import Link from "next/link";
import { ArrowUpRight, Info, ScanSearch, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@/components/ui";
import { Clock, LocalDate } from "@/components/format";
import { statusTone } from "@/components/shell";
import { message, statusLabel } from "@/i18n";
import type { SearchResult } from "@/lib/api";
import { formatRelevanceScore, relevanceLabelKey } from "@/lib/relevance";

export type ResultsView = "gallery" | "list";

export function SearchResults({
  results,
  view,
  selectedId,
  onSelect,
}: {
  results: SearchResult[];
  view: ResultsView;
  selectedId: string | null;
  onSelect: (result: SearchResult | null) => void;
}) {
  const t = useTranslations();
  if (!results.length) return <p className="text-base text-[var(--muted)]">{t("search.empty")}</p>;
  const selected = results.find((item) => item.segmentId === selectedId) || null;
  return (
    <div className="search-results-layout">
      <div className="min-w-0 flex-1">
        {view === "gallery" ? (
          <ResultGallery results={results} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <ResultList results={results} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
      {selected ? <ResultDetailPanel result={selected} onClose={() => onSelect(null)} /> : null}
    </div>
  );
}

function ResultGallery({
  results,
  selectedId,
  onSelect,
}: {
  results: SearchResult[];
  selectedId: string | null;
  onSelect: (result: SearchResult | null) => void;
}) {
  const t = useTranslations();
  return (
    <div className="media-grid">
      {results.map((result) => (
        <article
          key={result.segmentId}
          className={`media-card ${selectedId === result.segmentId ? "media-card-selected" : ""}`}
        >
          <button type="button" className="media-card-hit" onClick={() => onSelect(result)}>
            <div className="media-card-preview">
              {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="media-card-image" /> : <div className="media-card-placeholder" />}
              <span className="media-card-rank num">#{result.rank}</span>
            </div>
            <div className="media-card-body">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{message(t, `mediaType.${result.mediaType}`, t("mediaType.unknown"))}</Badge>
                {result.relevance ? <RelevanceBadge relevance={result.relevance} /> : null}
              </div>
              <h3 className="media-card-title">{result.title || t("common.unknown")}</h3>
              {result.description ? <p className="media-card-summary">{result.description}</p> : null}
              {result.matchText && result.matchText !== result.description ? (
                <p className="media-card-match">{result.matchText}</p>
              ) : null}
              <p className="media-card-meta">
                <span>{t("search.uploadedLabel")}: </span>
                {result.uploadedAt ? <LocalDate value={result.uploadedAt} /> : t("common.notAvailable")}
                {result.mediaType === "video" && result.startMs != null ? (
                  <>
                    {" · "}
                    <Clock ms={result.startMs} />
                  </>
                ) : null}
              </p>
            </div>
          </button>
          <div className="media-card-actions action-bar">
            <ActionLink href={assetHref(result)} label={t("common.open")}>
              <ArrowUpRight aria-hidden size={16} />
            </ActionLink>
            <ActionLink href={`/assets/${result.assetId}?segment=${encodeURIComponent(result.segmentId)}&similar=1`} label={t("search.findSimilar")}>
              <ScanSearch aria-hidden size={16} />
            </ActionLink>
          </div>
        </article>
      ))}
    </div>
  );
}

function ResultList({
  results,
  selectedId,
  onSelect,
}: {
  results: SearchResult[];
  selectedId: string | null;
  onSelect: (result: SearchResult | null) => void;
}) {
  const t = useTranslations();
  return (
    <div className="data-table data-table-spacious">
      <table>
        <thead>
          <tr>
            <th>{t("search.rank", { rank: "#" })}</th>
            <th>{t("search.mediaType")}</th>
            <th>{t("common.details")}</th>
            <th>{t("search.relevanceColumn")}</th>
            <th>{t("search.uploadedLabel")}</th>
            <th>{t("asset.timeline")}</th>
            <th>{t("common.open")}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.segmentId} className={selectedId === result.segmentId ? "row-selected" : undefined}>
              <td className="num">{result.rank}</td>
              <td>
                <Badge>{message(t, `mediaType.${result.mediaType}`, t("mediaType.unknown"))}</Badge>
              </td>
              <td>
                <button type="button" className="result-list-hit" onClick={() => onSelect(result)}>
                  <div className="flex items-start gap-4">
                    {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="thumb-lg" /> : <span className="thumb-lg" />}
                    <div className="min-w-0 text-left">
                      <p className="result-title">{result.title || t("common.unknown")}</p>
                      {result.description ? <p className="result-summary">{result.description}</p> : null}
                      {result.matchText ? <p className="match-text">{result.matchText}</p> : null}
                    </div>
                  </div>
                </button>
              </td>
              <td>{result.relevance ? <RelevanceBadge relevance={result.relevance} /> : t("common.notAvailable")}</td>
              <td className="whitespace-nowrap">
                {result.uploadedAt ? <LocalDate value={result.uploadedAt} /> : t("common.notAvailable")}
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

function ResultDetailPanel({ result, onClose }: { result: SearchResult; onClose: () => void }) {
  const t = useTranslations();
  const evidence = result.matchEvidence;
  return (
    <aside className="result-detail panel" aria-label={t("search.detail.title")}>
      <div className="result-detail-header">
        <h2 className="result-detail-title">{result.title || t("common.unknown")}</h2>
        <Button type="button" variant="ghost" onClick={onClose} aria-label={t("search.detail.close")}>
          <X aria-hidden size={18} />
        </Button>
      </div>
      <div className="result-detail-preview">
        {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="result-detail-image" /> : <div className="media-card-placeholder" />}
      </div>
      {result.relevance ? (
        <div className="result-detail-block">
          <RelevanceBadge relevance={result.relevance} large />
          <ScoreComponents relevance={result.relevance} />
        </div>
      ) : null}
      {result.description ? (
        <div className="result-detail-block">
          <h3 className="result-detail-kicker">{t("asset.description")}</h3>
          <p className="result-detail-copy">{result.description}</p>
        </div>
      ) : null}
      <dl className="result-detail-meta">
        <div>
          <dt>{t("search.uploadedLabel")}</dt>
          <dd>{result.uploadedAt ? <LocalDate value={result.uploadedAt} /> : t("common.notAvailable")}</dd>
        </div>
        <div>
          <dt>{t("asset.captured")}</dt>
          <dd>{result.captureDateUnknown ? t("search.captureUnknown") : result.capturedAt ? <LocalDate value={result.capturedAt} /> : t("common.notAvailable")}</dd>
        </div>
        {result.mediaType === "video" ? (
          <div>
            <dt>{t("asset.timeline")}</dt>
            <dd className="num">
              <Clock ms={result.startMs} />
              {result.endMs != null ? (
                <>
                  {" – "}
                  <Clock ms={result.endMs} />
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {evidence ? <EvidenceBlock evidence={evidence} /> : null}
      <div className="result-detail-actions">
        <Link href={assetHref(result)} className="btn btn-primary">
          {t("search.detail.openFull")}
        </Link>
      </div>
    </aside>
  );
}

function EvidenceBlock({ evidence }: { evidence: NonNullable<SearchResult["matchEvidence"]> }) {
  const t = useTranslations();
  const rows: { key: keyof typeof evidence; value?: string | string[] }[] = [
    { key: "sceneDescription", value: evidence.sceneDescription },
    { key: "transcript", value: evidence.transcript },
    { key: "ocrText", value: evidence.ocrText },
    { key: "userDescription", value: evidence.userDescription },
    { key: "tags", value: evidence.tags },
    { key: "embeddingStrategy", value: evidence.embeddingStrategy },
  ];
  const visible = rows.filter((row) => (Array.isArray(row.value) ? row.value.length : row.value));
  if (!visible.length) return null;
  return (
    <div className="result-detail-block">
      <h3 className="result-detail-kicker">{t("search.matchEvidence")}</h3>
      <ul className="result-evidence-list">
        {visible.map((row) => (
          <li key={row.key}>
            <span className="result-evidence-label">{t(`search.evidence.${row.key}`)}</span>
            <span className="result-evidence-value">{Array.isArray(row.value) ? row.value.join(", ") : row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreComponents({ relevance }: { relevance: NonNullable<SearchResult["relevance"]> }) {
  const t = useTranslations();
  const components = relevance.components;
  if (!components || !Object.keys(components).length) return null;
  return (
    <ul className="score-components">
      {Object.entries(components).map(([key, value]) => (
        <li key={key}>
          <span>{message(t, `search.components.${key}`, key)}</span>
          <span className="num">{formatRelevanceScore(value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function RelevanceBadge({ relevance, large }: { relevance: NonNullable<SearchResult["relevance"]>; large?: boolean }) {
  const t = useTranslations();
  const label = message(t, relevanceLabelKey(relevance), t("search.relevance.unknown"));
  return (
    <span className={large ? "relevance-badge relevance-badge-lg" : "relevance-badge"}>
      {label} · <span className="num">{formatRelevanceScore(relevance.score)}</span>
    </span>
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
  returnedCount,
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
  const shown = returnedCount ?? retrievedCandidateCount ?? 0;
  if (countKind === "retrieved_candidates") {
    return <p className="results-count">{t("search.topResults", { count: format.number(shown) })}</p>;
  }
  if (countKind === "matching_segments") {
    return <p className="results-count">{t("search.segments", { count: retrievedCandidateCount || 0 })}</p>;
  }
  return null;
}

export function TechnicalDetails({
  elapsedMs,
  fusion,
  rerankApplied,
  warnings,
}: {
  elapsedMs?: number | null;
  fusion?: string | null;
  rerankApplied?: boolean;
  warnings?: { code: string }[];
}) {
  const t = useTranslations();
  const format = useFormatter();
  const hasFusion = Boolean(fusion && message(t, `search.fusion.${fusion}`, ""));
  const hasWarnings = (warnings || []).length > 0;
  if (!elapsedMs && !hasFusion && !rerankApplied && !hasWarnings) return null;
  return (
    <details className="technical-details panel">
      <summary>{t("search.technicalDetails")}</summary>
      <div className="technical-details-body">
        {typeof elapsedMs === "number" ? <p>{t("search.elapsed", { value: format.number(elapsedMs) })}</p> : null}
        {rerankApplied ? <p>{t("search.rerank")}</p> : null}
        {hasFusion ? <p>{message(t, `search.fusion.${fusion}`, "")}</p> : null}
        {(warnings || []).map((warning) => (
          <p key={warning.code} className="text-[var(--warn)]">
            {warning.code === "SORT_WINDOW" ? t("search.warnings.SORT_WINDOW") : message(t, `errors.${warning.code}`, t("errors.UNKNOWN"))}
          </p>
        ))}
        <p className="text-sm text-[var(--muted)]">{t("search.notComplete")}</p>
      </div>
    </details>
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
      <p className="num text-sm">{pages != null ? t("common.pageKnown", { page: format.number(page), pages: format.number(pages) }) : t("common.pageOpen", { page: format.number(page) })}</p>
      <Button type="button" variant="quiet" disabled={pages != null ? page >= pages : returned < pageSize} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </Button>
    </div>
  );
}

/** @deprecated Use SearchResults */
export function ResultGrid({ results }: { results: SearchResult[] }) {
  return <SearchResults results={results} view="list" selectedId={null} onSelect={() => undefined} />;
}
