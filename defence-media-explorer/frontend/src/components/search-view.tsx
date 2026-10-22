"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { readFilters, toSearchFilters, writeFilters, type FilterState } from "@/lib/search-state";
import { Button, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { FilterPanel } from "@/components/filters";
import { CountLine, Pager, SearchResults, TechnicalDetails, type ResultsView } from "@/components/results";

const EXAMPLES = ["tracked", "drones", "maintenance", "inspections"] as const;
const PAGE_SIZE = 12;

type SearchPayload = {
  results: import("@/lib/api").SearchResult[];
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
  const [draft, setDraft] = useState(state.q);
  const [view, setView] = useState<ResultsView>("gallery");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    setDraft(state.q);
  }, [state.q]);

  useEffect(() => {
    setSelectedId(null);
  }, [state.q, state.mode, state.page]);

  useEffect(() => {
    if (!user) return;
    if (!state.q.trim()) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
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
    return () => {
      cancel = true;
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
      dateField: filters.dateField === "capturedAt" ? "capturedAt" : "uploadedAt",
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
    <div className="search-page space-y-6">
      <PageIntro kicker={t("meta.product")} title={t("medex.brand.title")} body={t("medex.brand.subtitle")} />
      <form
        className="search-hero panel"
        onSubmit={(event) => {
          event.preventDefault();
          const phrase = draft.trim();
          setDraft(phrase);
          replace({ ...state, q: phrase, page: 1 });
        }}
      >
        <label className="search-hero-field">
          <span className="search-hero-label">{t("search.queryLabel")}</span>
          <input
            name="q"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("medex.search.placeholder")}
            className="search-hero-input"
          />
        </label>
        <div className="search-hero-toolbar">
          <div className="segmented" role="group" aria-label={t("search.modeLabel")}>
            {(["hybrid", "semantic", "fulltext"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={state.mode === mode ? "segmented-active" : undefined}
                onClick={() => replace({ ...state, mode, page: 1 })}
              >
                {t(`search.mode.${mode}`)}
              </button>
            ))}
          </div>
          <Button type="submit" className="search-hero-submit">{t("search.submit")}</Button>
        </div>
      </form>
      <div className="search-examples">
        <h2 className="search-examples-title">{t("search.examplesLabel")}</h2>
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
        <p className="search-examples-note">{t("search.languageNote")}</p>
      </div>
      <FilterPanel
        state={state}
        timeZone={payload?.timeZone || timeZone}
        collections={collections}
        facets={facets}
        sortOptions={["relevance", "uploadedAt_desc", "uploadedAt_asc", "capturedAt_desc", "capturedAt_asc"]}
        onChange={replace}
      />
      <div className="min-w-0 space-y-5">
        <ErrorNote error={error} />
        {!state.q ? <p className="text-base leading-relaxed text-[var(--muted)]">{t("search.browseNote")}</p> : null}
        {state.q && loading ? <p className="text-base text-[var(--muted)]">{t("common.loading")}</p> : null}
        {state.q && payload ? (
          <>
            <div className="results-toolbar">
              <CountLine
                countKind={payload.countKind}
                retrievedCandidateCount={payload.retrievedCandidateCount}
                completeMatchCount={payload.completeMatchCount}
                assetCount={payload.assetCount}
                returnedCount={payload.returnedCount}
                elapsedMs={payload.elapsedMs}
              />
              <div className="segmented" role="group" aria-label={t("search.viewLabel")}>
                <button type="button" className={view === "gallery" ? "segmented-active" : undefined} onClick={() => setView("gallery")}>
                  {t("search.viewGallery")}
                </button>
                <button type="button" className={view === "list" ? "segmented-active" : undefined} onClick={() => setView("list")}>
                  {t("search.viewList")}
                </button>
              </div>
            </div>
            <SearchResults
              results={payload.results || []}
              view={view}
              selectedId={selectedId}
              onSelect={(result) => setSelectedId(result?.segmentId || null)}
            />
            <Pager
              page={state.page}
              pageSize={PAGE_SIZE}
              complete={payload.completeMatchCount ?? null}
              returned={payload.returnedCount || payload.results?.length || 0}
              onPage={(page) => replace({ ...state, page })}
            />
            <TechnicalDetails
              elapsedMs={payload.elapsedMs}
              fusion={payload.fusion}
              rerankApplied={payload.rerankApplied}
              warnings={payload.warnings}
            />
          </>
        ) : null}
        <section className="panel min-w-0 space-y-3 p-4">
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
                  <button type="button" className="max-w-full break-words text-left text-base font-medium underline-offset-2 hover:underline" onClick={() => applySaved(item)}>
                    {item.name}
                  </button>
                  <Button type="button" variant="ghost" onClick={() => void deleteSaved(item.id)} aria-label={t("search.deleteSaved", { name: item.name })}>
                    {t("common.delete")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-[var(--muted)]">{t("search.noSaved")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function asList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
