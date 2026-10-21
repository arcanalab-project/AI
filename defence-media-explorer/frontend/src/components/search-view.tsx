"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { readFilters, toSearchFilters, writeFilters, type FilterState } from "@/lib/search-state";
import { Button, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { message } from "@/i18n";
import { FilterPanel } from "@/components/filters";
import { CountLine, Pager, ResultGrid } from "@/components/results";

const EXAMPLES = ["tracked", "drones", "maintenance", "inspections"] as const;
const PAGE_SIZE = 12;

type SearchPayload = {
  results: Parameters<typeof ResultGrid>[0]["results"];
  mode?: string;
  fusion?: string | null;
  retrievedCandidateCount?: number | null;
  returnedCount?: number;
  completeMatchCount?: number | null;
  assetCount?: number | null;
  countKind?: string;
  rerankApplied?: boolean;
  elapsedMs?: number;
  warnings?: { code: string }[];
  page?: number;
  pageSize?: number;
  timeZone?: string;
};

type Saved = {
  id: string;
  name: string;
  query?: string;
  mode?: string;
  filters?: Record<string, unknown>;
  sort?: string | null;
};

export function SearchView() {
  const t = useTranslations();
  const { user, timeZone, locale } = usePrefs();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => readFilters(params), [params]);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [facets, setFacets] = useState({ tags: [] as string[], sources: [] as string[], sourceLanguages: [] as string[], categories: [] as string[] });
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState("");

  function replace(next: FilterState) {
    const query = writeFilters(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    api<{ collections: { id: string; name: string }[] }>("/api/collections")
      .then((data) => {
        if (!cancel) setCollections(data.collections);
      })
      .catch(() => undefined);
    api<typeof facets>("/api/facets")
      .then((data) => {
        if (!cancel) setFacets(data);
      })
      .catch(() => undefined);
    api<{ savedSearches: Saved[] }>("/api/saved-searches")
      .then((data) => {
        if (!cancel) setSaved(data.savedSearches);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    const handle = window.setTimeout(() => {
    api<SearchPayload>("/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: state.q,
        mode: state.mode,
        queryLanguage: locale,
        filters: toSearchFilters(state, timeZone),
        sort: state.q ? state.sort : state.sort === "relevance" ? "uploadedAt_desc" : state.sort,
        page: state.page,
        pageSize: PAGE_SIZE,
      }),
    })
      .then((data) => {
        if (!cancel) setPayload(data);
      })
      .catch((reason) => {
        if (!cancel) {
          setPayload(null);
          setError(asApiError(reason));
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    }, 250);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [user, state, timeZone, locale]);

  async function saveSearch() {
    if (!saveName.trim()) return;
    try {
      const data = await api<{ savedSearch: Saved }>("/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({
          name: saveName.trim(),
          query: state.q,
          mode: state.mode,
          queryLanguage: locale,
          filters: toSearchFilters(state, timeZone),
          sort: state.sort,
        }),
      });
      setSaved((current) => [data.savedSearch, ...current]);
      setSaveName("");
      setError(null);
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function deleteSaved(id: string) {
    try {
      await api(`/api/saved-searches/${id}`, { method: "DELETE" });
      setSaved((current) => current.filter((item) => item.id !== id));
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  function applySaved(item: Saved) {
    const filters = item.filters || {};
    replace({
      q: item.query || "",
      mode: item.mode === "semantic" || item.mode === "fulltext" || item.mode === "hybrid" ? item.mode : "hybrid",
      sort: item.sort || "relevance",
      dateField: filters.dateField === "uploadedAt" ? "uploadedAt" : "capturedAt",
      dateFrom: typeof filters.dateFrom === "string" ? filters.dateFrom.slice(0, 10) : "",
      dateTo: typeof filters.dateTo === "string" ? filters.dateTo.slice(0, 10) : "",
      unknownCapture: filters.unknownCapture === "exclude" || filters.unknownCapture === "only" ? filters.unknownCapture : "include",
      mediaTypes: asList(filters.mediaTypes),
      collectionIds: asList(filters.collectionIds),
      sources: asList(filters.sources),
      tags: asList(filters.tags),
      categories: asList(filters.categories),
      sourceLanguages: asList(filters.sourceLanguages),
      processingStatuses: asList(filters.processingStatuses),
      page: 1,
    });
  }

  return (
    <div className="space-y-4">
      <PageIntro kicker={t("meta.product")} title={t("medex.brand.title")} body={t("medex.brand.subtitle")} />
      <form
        className="panel min-w-0 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          replace({ ...state, page: 1 });
        }}
      >
        <label className="grid min-w-0 gap-3">
          <span className="text-sm font-semibold">{t("search.queryLabel")}</span>
          <input
            name="q"
            value={state.q}
            onChange={(event) => replace({ ...state, q: event.target.value, page: 1 })}
            placeholder={t("medex.search.placeholder")}
            className="field"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t("search.modeLabel")}</span>
          {(["hybrid", "semantic", "fulltext"] as const).map((mode) => (
            <Button key={mode} type="button" variant={state.mode === mode ? "primary" : "quiet"} onClick={() => replace({ ...state, mode, page: 1 })}>
              {t(`search.mode.${mode}`)}
            </Button>
          ))}
          <Button type="submit">{t("search.submit")}</Button>
        </div>
      </form>
      <div>
        <h2 className="mb-3 text-sm font-semibold">{t("search.examplesLabel")}</h2>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((key) => (
            <button
              key={key}
              type="button"
              className="choice text-left"
              onClick={() => replace({ ...state, q: t(`search.examples.${key}`), mode: "hybrid", page: 1 })}
            >
              {t(`search.examples.${key}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{t("search.languageNote")}</p>
      </div>
      <FilterPanel
        state={state}
        timeZone={payload?.timeZone || timeZone}
        collections={collections}
        facets={facets}
        sortOptions={["relevance", "capturedAt_desc", "capturedAt_asc", "uploadedAt_desc", "uploadedAt_asc"]}
        onChange={replace}
      />
      <div className="min-w-0 space-y-4">
          <ErrorNote error={error} />
          {!state.q ? <p className="text-sm leading-snug text-[var(--muted)]">{t("search.browseNote")}</p> : null}
          {loading ? <p className="text-[var(--muted)]">{t("common.loading")}</p> : null}
          {payload ? (
            <>
              <CountLine
                countKind={payload.countKind}
                retrievedCandidateCount={payload.retrievedCandidateCount}
                completeMatchCount={payload.completeMatchCount}
                assetCount={payload.assetCount}
                elapsedMs={payload.elapsedMs}
              />
              {payload.rerankApplied ? <p className="text-sm leading-snug">{t("search.rerank")}</p> : null}
              {payload.fusion ? <FusionNote code={payload.fusion} /> : null}
              {(payload.warnings || []).map((warning) => (
                <p key={warning.code} className="text-sm leading-snug text-[var(--warn)]">
                  {warning.code === "SORT_WINDOW" ? t("search.warnings.SORT_WINDOW") : message(t, `errors.${warning.code}`, t("errors.UNKNOWN"))}
                </p>
              ))}
              <ResultGrid results={payload.results || []} />
              <Pager
                page={state.page}
                pageSize={PAGE_SIZE}
                complete={payload.completeMatchCount ?? null}
                returned={payload.returnedCount || payload.results?.length || 0}
                onPage={(page) => replace({ ...state, page })}
              />
            </>
          ) : null}
          <section className="panel min-w-0 space-y-2 p-3">
            <h2 className="section-title">{t("search.saved")}</h2>
            <form
              className="flex min-w-0 flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveSearch();
              }}
            >
              <TextInput value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder={t("search.saveName")} className="min-w-[12rem] flex-1" aria-label={t("search.saveName")} />
              <Button type="submit" variant="quiet">
                {t("search.save")}
              </Button>
            </form>
            {saved.length ? (
              <ul className="space-y-2">
                {saved.map((item) => (
                  <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-2">
                    <button type="button" className="max-w-full break-words text-left font-medium underline-offset-2 hover:underline" onClick={() => applySaved(item)}>
                      {item.name}
                    </button>
                    <Button type="button" variant="ghost" onClick={() => void deleteSaved(item.id)} aria-label={t("search.deleteSaved", { name: item.name })}>
                      {t("common.delete")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">{t("search.noSaved")}</p>
            )}
          </section>
      </div>
    </div>
  );
}

function FusionNote({ code }: { code?: string | null }) {
  const t = useTranslations();
  if (!code) return null;
  const text = message(t, `search.fusion.${code}`, "");
  if (!text) return null;
  return <p className="text-sm leading-snug">{text}</p>;
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
