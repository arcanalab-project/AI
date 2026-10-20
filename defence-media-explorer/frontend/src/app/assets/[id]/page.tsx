"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ApiError, api, asApiError, canUpload, type Asset, type SearchResult, type Segment } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import { Badge, Button, FieldLabel, Select, TextArea, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { Clock, DurationText, FileSize, LocalDate, LocalNumber } from "@/components/format";
import { ResultGrid } from "@/components/results";

type Technical = {
  segmentId: string;
  database?: string;
  collection?: string;
  indexingState?: string | null;
  processingStatus?: string;
  pipelineVersion?: string;
  embedding?: {
    model?: string | null;
    dimensions?: number | null;
    strategy?: string | null;
    inputType?: string | null;
    modality?: string | null;
    preprocessingVersion?: string | null;
    preview?: number[];
    previewLength?: number;
  };
  textChannel?: { model?: string | null; dimensions?: number | null; inputType?: string | null } | null;
  extractedText?: {
    transcript?: string | null;
    ocrText?: string | null;
    searchText?: string | null;
    modelDescription?: string | null;
  };
  filters?: Record<string, unknown>;
  source?: Record<string, { key?: string } | null>;
  annotationProvenance?: Record<string, unknown> | null;
  transcriptProvenance?: Record<string, unknown> | null;
  warnings?: string[];
  textStale?: boolean;
};

export default function AssetPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { user, timeZone } = usePrefs();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState(false);
  const [stale, setStale] = useState(false);
  const [technical, setTechnical] = useState<Technical | null>(null);
  const [similar, setSimilar] = useState<SearchResult[] | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const selected = search.get("segment") || segments[0]?.id || "";

  async function load() {
    const data = await api<{ asset: Asset; segments: Segment[] }>(`/api/assets/${params.id}`);
    setAsset(data.asset);
    setSegments(data.segments);
  }

  useEffect(() => {
    if (!user) return;
    load().catch((reason) => setError(asApiError(reason)));
    api<{ collections: { id: string; name: string }[] }>("/api/collections")
      .then((data) => setCollections(data.collections))
      .catch(() => undefined);
  }, [user, params.id]);

  useEffect(() => {
    const node = videoRef.current || audioRef.current;
    const raw = search.get("t");
    if (!node || raw == null) return;
    const seconds = Number(raw) / 1000;
    if (!Number.isFinite(seconds)) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled || !Number.isFinite(node.duration)) return;
      const target = Math.min(seconds, Math.max(0, node.duration - 0.05));
      if (Math.abs(node.currentTime - target) > 0.05) node.currentTime = target;
    };
    apply();
    node.addEventListener("loadedmetadata", apply);
    node.addEventListener("loadeddata", apply);
    node.addEventListener("canplay", apply);
    return () => {
      cancelled = true;
      node.removeEventListener("loadedmetadata", apply);
      node.removeEventListener("loadeddata", apply);
      node.removeEventListener("canplay", apply);
    };
  }, [search, asset?.playbackUrl]);

  useEffect(() => {
    if (!user || !selected) return;
    api<Technical>(`/api/segments/${selected}/technical`)
      .then((data) => setTechnical(data))
      .catch(() => setTechnical(null));
  }, [user, selected]);

  useEffect(() => {
    if (!user || search.get("similar") !== "1" || !selected) return;
    api<{ results: SearchResult[] }>(`/api/segments/${selected}/similar`, { method: "POST" })
      .then((data) => setSimilar(data.results))
      .catch((reason) => setError(asApiError(reason)));
  }, [user, search, selected]);

  const segment = useMemo(() => segments.find((item) => item.id === selected) || segments[0], [segments, selected]);

  function seek(segmentId: string, startMs?: number | null) {
    const next = new URLSearchParams(search.toString());
    next.set("segment", segmentId);
    if (startMs != null) next.set("t", String(startMs));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    const node = videoRef.current || audioRef.current;
    if (node && startMs != null) node.currentTime = startMs / 1000;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    const data = new FormData(event.currentTarget);
    try {
      const body = {
        title: String(data.get("title") || ""),
        description: String(data.get("description") || ""),
        collectionId: String(data.get("collectionId") || ""),
        source: String(data.get("source") || ""),
        tags: String(data.get("tags") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        sourceLanguage: String(data.get("sourceLanguage") || ""),
        captureDateMode: String(data.get("captureDateMode") || "file"),
        capturedAt: String(data.get("capturedAt") || ""),
        reviewState: String(data.get("reviewState") || asset.reviewState || "unreviewed"),
        timeZone,
      };
      const updated = await api<{ asset: Asset; embeddingStale?: boolean }>(`/api/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setAsset(updated.asset);
      setStale(Boolean(updated.embeddingStale));
      setEditing(false);
      setError(null);
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function reprocess() {
    if (!asset) return;
    try {
      await api(`/api/assets/${asset.id}/reprocess`, { method: "POST" });
      await load();
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function remove() {
    if (!asset || !window.confirm(t("asset.deleteConfirm"))) return;
    try {
      await api(`/api/assets/${asset.id}`, { method: "DELETE" });
      router.push("/library");
    } catch (reason) {
      setError(asApiError(reason));
    }
  }

  async function findSimilar() {
    if (!segment) return;
    seek(segment.id, segment.startMs);
    const next = new URLSearchParams(search.toString());
    next.set("segment", segment.id);
    next.set("similar", "1");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (!asset) {
    return (
      <div className="space-y-4">
        <ErrorNote error={error} />
        <p className="text-[var(--muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/library" className="text-sm font-semibold">
        {t("common.back")}
      </Link>
      <PageIntro kicker={t("asset.kicker")} title={asset.title} body={asset.description || undefined} />
      <ErrorNote error={error} />
      {stale ? <p className="rounded-2xl border border-[var(--warn)] px-4 py-3 text-sm leading-relaxed">{t("asset.embeddingStale")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Badge>{t.has(`mediaType.${asset.mediaType}`) ? t(`mediaType.${asset.mediaType}`) : t("mediaType.unknown")}</Badge>
        <Badge>{asset.processingStatus && t.has(`status.${asset.processingStatus}`) ? t(`status.${asset.processingStatus}`) : t("status.unknown")}</Badge>
        {asset.indexingState ? <Badge tone="warn">{t.has(`indexingState.${asset.indexingState}`) ? t(`indexingState.${asset.indexingState}`) : t("indexingState.unknown")}</Badge> : null}
      </div>
      <section className="panel min-w-0 overflow-hidden">
        <h2 className="px-5 pt-5 font-serif text-2xl">{t("asset.player")}</h2>
        <div className="p-5">
          {asset.mediaType === "image" && (asset.playbackUrl || asset.thumbnailUrl) ? (
            <img src={asset.playbackUrl || asset.thumbnailUrl || ""} alt="" className="max-h-[36rem] w-full rounded-2xl object-contain" />
          ) : null}
          {asset.mediaType === "video" && asset.playbackUrl ? (
            <video ref={videoRef} src={asset.playbackUrl} controls preload="auto" className="max-h-[36rem] w-full rounded-2xl bg-[#001E2B]" />
          ) : null}
          {asset.mediaType === "audio" && asset.playbackUrl ? <audio ref={audioRef} src={asset.playbackUrl} controls className="w-full" /> : null}
          {asset.mediaType === "text" ? <pre className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed">{segment?.transcript || asset.description}</pre> : null}
          {!asset.playbackUrl && asset.mediaType !== "text" && asset.mediaType !== "image" ? <p>{t("asset.noPlayback")}</p> : null}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">{t("asset.timeline")}</h2>
        <div className="flex flex-wrap gap-2">
          {segments.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => seek(item.id, item.startMs)}
              className={`max-w-full whitespace-normal break-words rounded-full px-3 py-2 text-left text-sm leading-snug ${item.id === segment?.id ? "bg-[#001E2B] text-white dark:bg-spring dark:text-[#001E2B]" : "border border-[var(--line)]"}`}
            >
              <Clock ms={item.startMs} /> – <Clock ms={item.endMs} />
            </button>
          ))}
        </div>
      </section>
      <section className="grid min-w-0 gap-6 lg:grid-cols-2">
        <article className="panel min-w-0 space-y-3 p-5">
          <h2 className="font-serif text-2xl">{t("asset.transcript")}</h2>
          {segments.some((item) => item.transcript) ? (
            <ul className="space-y-3">
              {segments.map((item) => (
                <li key={item.id}>
                  <button type="button" className="max-w-full break-words text-left leading-relaxed" onClick={() => seek(item.id, item.startMs)}>
                    <span className="mr-2 text-sm text-[var(--muted)]">
                      <Clock ms={item.startMs} />
                    </span>
                    {item.transcript || t("asset.noTranscript")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--muted)]">{t("asset.noTranscript")}</p>
          )}
        </article>
        <article className="panel min-w-0 space-y-3 p-5">
          <h2 className="font-serif text-2xl">{t("asset.storyboard")}</h2>
          {segment?.storyboard?.some((frame) => frame.url) ? (
            <div className="grid grid-cols-2 gap-3">
              {segment.storyboard.map((frame, index) =>
                frame.url ? (
                  <button key={`${frame.timestampMs}-${index}`} type="button" className="min-w-0 text-left" onClick={() => seek(segment.id, frame.timestampMs)}>
                    <img src={frame.url} alt="" className="aspect-video w-full rounded-xl object-cover" />
                    <span className="mt-1 block text-sm">
                      <Clock ms={frame.timestampMs} />
                    </span>
                  </button>
                ) : null,
              )}
            </div>
          ) : (
            <p className="text-[var(--muted)]">{t("asset.noStoryboard")}</p>
          )}
        </article>
      </section>
      <section id="metadata" className="panel min-w-0 space-y-4 p-5">
        <h2 className="font-serif text-2xl">{t("asset.metadata")}</h2>
        {editing ? (
          <form className="grid min-w-0 gap-4" onSubmit={(event) => void save(event)}>
            <FieldLabel label={t("asset.title")}>
              <TextInput name="title" defaultValue={asset.title} required />
            </FieldLabel>
            <FieldLabel label={t("asset.description")}>
              <TextArea name="description" defaultValue={asset.description || ""} />
            </FieldLabel>
            <FieldLabel label={t("asset.collection")}>
              <Select name="collectionId" defaultValue={asset.collectionId || ""}>
                <option value="">{t("common.none")}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label={t("asset.source")}>
              <TextInput name="source" defaultValue={asset.source || ""} />
            </FieldLabel>
            <FieldLabel label={t("asset.tags")}>
              <TextInput name="tags" defaultValue={(asset.tags || []).join(", ")} />
            </FieldLabel>
            <FieldLabel label={t("asset.language")}>
              <TextInput name="sourceLanguage" defaultValue={asset.sourceLanguage || ""} />
            </FieldLabel>
            <FieldLabel label={t("asset.captureMode")}>
              <Select name="captureDateMode" defaultValue={asset.captureDateMode || "file"}>
                <option value="file">{t("captureMode.file")}</option>
                <option value="unknown">{t("captureMode.unknown")}</option>
                <option value="user">{t("captureMode.user")}</option>
              </Select>
            </FieldLabel>
            <FieldLabel label={t("upload.capturedAt")} hint={timeZone}>
              <TextInput name="capturedAt" type="datetime-local" />
            </FieldLabel>
            <FieldLabel label={t("asset.review")}>
              <Select name="reviewState" defaultValue={asset.reviewState || "unreviewed"}>
                <option value="unreviewed">{t("status.unreviewed")}</option>
                <option value="reviewed">{t("status.reviewed")}</option>
              </Select>
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{t("common.save")}</Button>
              <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid min-w-0 gap-3 text-sm leading-snug md:grid-cols-2">
            <Fact label={t("asset.source")} value={asset.source || t("common.notAvailable")} />
            <Fact label={t("asset.uploaded")} value={<LocalDate value={asset.uploadedAt} />} />
            <Fact label={t("asset.captured")} value={asset.captureDateUnknown ? t("search.captureUnknown") : <LocalDate value={asset.capturedAt} />} />
            <Fact label={t("asset.captureMode")} value={t.has(`captureMode.${asset.captureDateMode}`) ? t(`captureMode.${asset.captureDateMode}`) : t("captureMode.unknown")} />
            <Fact label={t("asset.language")} value={asset.sourceLanguage || t("common.notAvailable")} />
            <Fact label={t("asset.duration")} value={<DurationText ms={asset.durationMs} />} />
            <Fact label={t("asset.size")} value={<FileSize bytes={asset.byteSize} />} />
            <Fact label={t("asset.resolution")} value={asset.width && asset.height ? `${format.number(asset.width)} × ${format.number(asset.height)}` : t("common.notAvailable")} />
            <Fact label={t("asset.tags")} value={(asset.tags || []).join(", ") || t("common.none")} />
            <Fact label={t("asset.filename")} value={asset.originalFilename || t("common.notAvailable")} />
            <Fact label={t("asset.sha")} value={asset.sha256 || t("common.notAvailable")} />
            <Fact label={t("asset.pipeline")} value={asset.pipelineVersion || t("common.notAvailable")} />
            <Fact label={t("asset.generation")} value={<LocalNumber value={asset.generation} />} />
            <Fact label={t("asset.indexing")} value={asset.indexingState && t.has(`indexingState.${asset.indexingState}`) ? t(`indexingState.${asset.indexingState}`) : t("indexingState.unknown")} />
            <Fact label={t("asset.model")} value={asset.embeddingModel || t("common.notAvailable")} />
            <Fact label={t("asset.dimensions")} value={<LocalNumber value={asset.embeddingDimensions} />} />
            <Fact label={t("asset.categories")} value={(segment?.categories || []).join(", ") || t("common.none")} />
            <Fact label={t("asset.activities")} value={(segment?.activities || []).join(", ") || t("common.none")} />
            <Fact label={t("asset.environment")} value={segment?.environment || t("common.notAvailable")} />
            <Fact label={t("asset.uncertainties")} value={(segment?.uncertainties || []).join(", ") || t("common.none")} />
            <Fact label={t("asset.ocr")} value={segment?.ocrText || t("common.notAvailable")} />
            <Fact label={t("asset.sceneCuts")} value={(asset.sceneCutsMs || []).length ? (asset.sceneCutsMs || []).map((ms) => format.number(ms)).join(", ") : t("common.none")} />
          </dl>
        )}
        {(asset.warnings || []).length ? (
          <div>
            <h3 className="font-semibold">{t("asset.warnings")}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {asset.warnings?.map((code) => (
                <li key={code}>{t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.UNKNOWN")}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="quiet" onClick={() => void findSimilar()}>
            {t("search.findSimilar")}
          </Button>
          {canUpload(user?.role) ? (
            <>
              <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
                {t("asset.edit")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => void reprocess()}>
                {t("asset.reprocess")}
              </Button>
              <Button type="button" variant="danger" onClick={() => void remove()}>
                {t("asset.delete")}
              </Button>
            </>
          ) : null}
        </div>
      </section>
      {similar ? (
        <section className="space-y-4">
          <h2 className="font-serif text-2xl">{t("asset.similar")}</h2>
          {similar.length ? <ResultGrid results={similar} /> : <p className="text-[var(--muted)]">{t("asset.similarEmpty")}</p>}
        </section>
      ) : null}
      <TechnicalPanel technical={technical} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function TechnicalPanel({ technical }: { technical: Technical | null }) {
  const t = useTranslations();
  const format = useFormatter();
  return (
    <details className="panel min-w-0 p-5">
      <summary className="cursor-pointer break-words font-serif text-2xl">{t("asset.technical")}</summary>
      {!technical ? (
        <p className="mt-4 text-[var(--muted)]">{t("common.loading")}</p>
      ) : (
        <div className="mt-4 space-y-4 text-sm leading-relaxed">
          <p>{t("technical.intro")}</p>
          <p>
            {t("technical.database")}: {technical.database || t("common.notAvailable")} · {t("technical.collection")}: {technical.collection || t("common.notAvailable")}
          </p>
          <p>
            {t("technical.indexingState")}: {technical.indexingState && t.has(`indexingState.${technical.indexingState}`) ? t(`indexingState.${technical.indexingState}`) : t("indexingState.unknown")}
          </p>
          <p>{t("technical.indexingExplainer")}</p>
          <h3 className="font-semibold">{t("technical.embedding")}</h3>
          <p>{t("technical.embeddingExplainer")}</p>
          {technical.embedding?.preview?.length ? (
            <>
              <p>
                {t("technical.strategy")}: {t.has(`technical.strategyName.${technical.embedding.strategy}`) ? t(`technical.strategyName.${technical.embedding.strategy}`) : t("technical.strategyName.unknown")}
                {" · "}
                {t("technical.inputType")}: {technical.embedding.inputType || t("common.notAvailable")}
                {" · "}
                {t("technical.modality")}: {t.has(`technical.modalityName.${technical.embedding.modality}`) ? t(`technical.modalityName.${technical.embedding.modality}`) : t("technical.modalityName.unknown")}
                {" · "}
                {t("technical.pipeline")}: {technical.embedding.preprocessingVersion || technical.pipelineVersion || t("common.notAvailable")}
              </p>
              {technical.textChannel?.model ? (
                <p>
                  {t("settings.textChannel")}: {technical.textChannel.model}
                  {technical.textChannel.dimensions ? ` · ${format.number(technical.textChannel.dimensions)}` : ""}
                </p>
              ) : null}
              <p>{t("technical.previewLength", { count: technical.embedding.previewLength || technical.embedding.preview.length, dimensions: technical.embedding.dimensions || 0 })}</p>
              <p className="break-words font-mono text-xs">
                {t("technical.preview")}: {technical.embedding.preview.map((value) => format.number(value, { maximumFractionDigits: 4 })).join(", ")}
              </p>
            </>
          ) : (
            <p>{t("technical.noEmbedding")}</p>
          )}
          <p>{t("technical.shortEvent")}</p>
          <h3 className="font-semibold">{t("technical.textFields")}</h3>
          <p>{t("technical.textExplainer")}</p>
          <Fact label={t("technical.transcript")} value={technical.extractedText?.transcript || t("common.notAvailable")} />
          <Fact label={t("technical.ocr")} value={technical.extractedText?.ocrText || t("common.notAvailable")} />
          <Fact label={t("technical.modelDescription")} value={technical.extractedText?.modelDescription || t("common.notAvailable")} />
          <Fact label={t("technical.searchText")} value={technical.extractedText?.searchText || t("common.notAvailable")} />
          <p>{technical.textStale ? t("technical.textStale") : t("technical.textFresh")}</p>
          <h3 className="font-semibold">{t("technical.filters")}</h3>
          <p>{t("technical.filterExplainer")}</p>
          <dl className="grid gap-2 md:grid-cols-2">
            {Object.entries(technical.filters || {}).map(([key, value]) => (
              <Fact key={key} label={key} value={present(value, t)} />
            ))}
          </dl>
          <h3 className="font-semibold">{t("technical.source")}</h3>
          <ul className="space-y-1">
            {Object.entries(technical.source || {}).map(([key, value]) => (
              <li key={key} className="break-words">
                {sourceLabel(key, t)}: {value?.key || t("technical.none")}
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">{t("technical.provenance")}</h3>
          <Provenance value={technical.annotationProvenance} />
          <Provenance value={technical.transcriptProvenance} />
          {(technical.warnings || []).length ? (
            <ul>
              {technical.warnings?.map((code) => (
                <li key={code}>{t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.UNKNOWN")}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </details>
  );
}

function Provenance({ value }: { value?: Record<string, unknown> | null }) {
  const t = useTranslations();
  if (!value) return <p className="text-[var(--muted)]">{t("common.notAvailable")}</p>;
  return (
    <dl className="grid gap-1">
      {Object.entries(value).map(([key, item]) => (
        <Fact key={key} label={key} value={present(item, t)} />
      ))}
    </dl>
  );
}

function present(value: unknown, t: ReturnType<typeof useTranslations>) {
  if (value == null || value === "") return t("common.notAvailable");
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" || typeof item === "number" ? String(item) : "")).filter(Boolean).join(", ") || t("common.none");
  return t("common.notAvailable");
}

function sourceLabel(key: string, t: ReturnType<typeof useTranslations>) {
  if (key === "originalObject") return t("technical.original");
  if (key === "thumbnailObject") return t("technical.thumbnail");
  if (key === "previewObject") return t("technical.previewObject");
  if (key === "proxyObject") return t("technical.proxy");
  return key;
}
