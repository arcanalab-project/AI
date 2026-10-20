"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError, type Asset } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { readFilters, writeFilters, type FilterState } from "@/lib/search-state";
import { Badge } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { FilterPanel } from "@/components/filters";
import { FileSize, LocalDate } from "@/components/format";
import { Pager } from "@/components/results";

const PAGE_SIZE = 12;

export default function LibraryPage() {
  const t = useTranslations();
  const { user, timeZone } = usePrefs();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => readFilters(params), [params]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [zone, setZone] = useState(timeZone);
  const [error, setError] = useState<ApiError | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [facets, setFacets] = useState({ tags: [] as string[], sources: [] as string[], sourceLanguages: [] as string[], categories: [] as string[] });

  function replace(next: FilterState) {
    const query = writeFilters({ ...next, mode: "hybrid", q: "" }, { sort: "uploadedAt_desc" }).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!user) return;
    api<{ collections: { id: string; name: string }[] }>("/api/collections")
      .then((data) => setCollections(data.collections))
      .catch(() => undefined);
    api<typeof facets>("/api/facets")
      .then((data) => setFacets(data))
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const query = new URLSearchParams();
    query.set("page", String(state.page));
    query.set("pageSize", String(PAGE_SIZE));
    query.set("sort", state.sort === "relevance" ? "uploadedAt_desc" : state.sort);
    query.set("dateField", state.dateField);
    query.set("unknownCapture", state.unknownCapture);
    query.set("timeZone", timeZone);
    if (state.dateFrom) query.set("dateFrom", state.dateFrom);
    if (state.dateTo) query.set("dateTo", state.dateTo);
    if (state.mediaTypes.length) query.set("mediaType", state.mediaTypes.join(","));
    if (state.collectionIds.length) query.set("collectionId", state.collectionIds.join(","));
    if (state.sources.length) query.set("source", state.sources.join(","));
    if (state.tags.length) query.set("tag", state.tags.join(","));
    if (state.categories.length) query.set("category", state.categories.join(","));
    if (state.sourceLanguages.length) query.set("sourceLanguage", state.sourceLanguages.join(","));
    if (state.processingStatuses.length) query.set("processingStatus", state.processingStatuses.join(","));
    let cancel = false;
    api<{ assets: Asset[]; completeMatchCount: number; timeZone?: string }>(`/api/assets?${query.toString()}`)
      .then((data) => {
        if (cancel) return;
        setAssets(data.assets);
        setTotal(data.completeMatchCount);
        setZone(data.timeZone || timeZone);
        setError(null);
      })
      .catch((reason) => {
        if (!cancel) setError(asApiError(reason));
      });
    return () => {
      cancel = true;
    };
  }, [user, state, timeZone]);

  const visible = { ...state, sort: state.sort === "relevance" ? "uploadedAt_desc" : state.sort };

  return (
    <div className="space-y-8">
      <PageIntro kicker={t("library.kicker")} title={t("library.title")} body={t("library.body")} />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <FilterPanel
          state={visible}
          timeZone={zone}
          collections={collections}
          facets={facets}
          sortOptions={["uploadedAt_desc", "uploadedAt_asc", "capturedAt_desc", "capturedAt_asc", "title_asc"]}
          onChange={replace}
        />
        <div className="min-w-0 space-y-5">
          <ErrorNote error={error} />
          <p className="text-sm text-[var(--muted)]">{t("library.count", { count: total })}</p>
          {assets.length ? (
            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              {assets.map((asset) => (
                <article key={asset.id} className="panel flex min-w-0 flex-col">
                  <div className="aspect-video overflow-hidden rounded-t-[20px] bg-[#001E2B]">
                    {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{t.has(`mediaType.${asset.mediaType}`) ? t(`mediaType.${asset.mediaType}`) : t("mediaType.unknown")}</Badge>
                      <Badge tone={asset.processingStatus === "failed" ? "danger" : asset.processingStatus === "ready" ? "ok" : "warn"}>
                        {asset.processingStatus && t.has(`status.${asset.processingStatus}`) ? t(`status.${asset.processingStatus}`) : t("status.unknown")}
                      </Badge>
                    </div>
                    <h2 className="break-words font-serif text-2xl leading-tight">{asset.title}</h2>
                    <p className="text-sm leading-snug text-[var(--muted)]">
                      {asset.captureDateUnknown ? t("search.captureUnknown") : <LocalDate value={asset.capturedAt} />}
                      {" · "}
                      <LocalDate value={asset.uploadedAt} />
                      {" · "}
                      <FileSize bytes={asset.byteSize} />
                    </p>
                    <Link href={`/assets/${asset.id}`} className="inline-flex rounded-full bg-spring px-4 py-2 text-sm font-semibold text-[#001E2B]">
                      {t("common.open")}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-[var(--muted)]">{t("library.empty")}</p>
          )}
          <Pager page={state.page} pageSize={PAGE_SIZE} complete={total} returned={assets.length} onPage={(page) => replace({ ...visible, page })} />
        </div>
      </div>
    </div>
  );
}
