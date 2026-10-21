"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError, api, asApiError, type Asset } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { readFilters, writeFilters, type FilterState } from "@/lib/search-state";
import { Badge } from "@/components/ui";
import { ErrorNote, PageIntro, statusTone } from "@/components/shell";
import { FilterPanel } from "@/components/filters";
import { FileSize, LocalDate } from "@/components/format";
import { message, statusLabel } from "@/i18n";
import { ActionLink, Pager } from "@/components/results";
import { ArrowUpRight } from "lucide-react";

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
    <div className="space-y-4">
      <PageIntro kicker={t("library.kicker")} title={t("library.title")} body={t("library.body")} />
      <FilterPanel
        state={visible}
        timeZone={zone}
        collections={collections}
        facets={facets}
        sortOptions={["uploadedAt_desc", "uploadedAt_asc", "capturedAt_desc", "capturedAt_asc", "title_asc"]}
        onChange={replace}
      />
      <div className="min-w-0 space-y-4">
          <ErrorNote error={error} />
          <p className="metric text-xs text-[var(--muted)]">{t("library.count", { count: total })}</p>
          {assets.length ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("upload.titleField")}</th>
                    <th>{t("search.mediaType")}</th>
                    <th>{t("search.processingStatus")}</th>
                    <th>{t("asset.captured")}</th>
                    <th>{t("asset.uploaded")}</th>
                    <th>{t("asset.size")}</th>
                    <th>{t("common.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" className="thumb" /> : <span className="thumb" />}
                          <span className="break-words font-sans font-semibold text-[var(--ink)]">{asset.title}</span>
                        </div>
                      </td>
                      <td>
                        <Badge>{message(t, `mediaType.${asset.mediaType}`, t("mediaType.unknown"))}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone(asset.processingStatus)}>
                          {statusLabel(t, asset.processingStatus)}
                        </Badge>
                      </td>
                      <td>{asset.captureDateUnknown ? t("search.captureUnknown") : <LocalDate value={asset.capturedAt} />}</td>
                      <td>
                        <LocalDate value={asset.uploadedAt} />
                      </td>
                      <td>
                        <FileSize bytes={asset.byteSize} />
                      </td>
                      <td>
                        <div className="action-bar">
                          <ActionLink href={`/assets/${asset.id}`} label={t("common.open")}>
                            <ArrowUpRight aria-hidden size={15} />
                          </ActionLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">{t("library.empty")}</p>
          )}
          <Pager page={state.page} pageSize={PAGE_SIZE} complete={total} returned={assets.length} onPage={(page) => replace({ ...visible, page })} />
      </div>
    </div>
  );
}
