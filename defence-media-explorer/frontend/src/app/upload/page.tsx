"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ApiError, MAX_UPLOAD_BYTES, api, asApiError, canUpload } from "@/lib/api";
import { usePrefs } from "@/lib/preferences";
import {
  addUploadFiles,
  clearFinishedUploads,
  patchUpload,
  removeUploadItem,
  updateUploadItem,
  useUploadDraft,
  watchUploadJob,
} from "@/lib/upload-store";
import { Badge, Button, FieldLabel, Select, TextArea, TextInput } from "@/components/ui";
import { ErrorNote, PageIntro } from "@/components/shell";
import { FileSize } from "@/components/format";

const ACCEPT = ".mp4,.mov,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.txt";

export default function UploadPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { user, timeZone } = usePrefs();
  const draft = useUploadDraft();
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canUpload(user?.role)) return;
    api<{ collections: { id: string; name: string }[] }>("/api/collections")
      .then((data) => setCollections(data.collections))
      .catch(() => undefined);
  }, [user?.role]);

  async function start() {
    if (!canUpload(user?.role) || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const item of draft.items) {
        if (item.phase !== "ready" && item.phase !== "error") continue;
        updateUploadItem(item.localId, { phase: "uploading", uploadRatio: 0, errorCode: undefined, errorParams: undefined, route: "direct" });
        try {
          if (item.file.size > MAX_UPLOAD_BYTES) {
            updateUploadItem(item.localId, {
              phase: "error",
              errorCode: "UPLOAD_TOO_LARGE",
              errorParams: { maxMb: 1024 },
            });
            continue;
          }
          const result = await uploadDirect(item.localId, item.file, draft, timeZone);
          updateUploadItem(item.localId, {
            phase: "processing",
            uploadRatio: 1,
            jobId: result.jobId,
            assetId: result.assetId,
            processingStatus: "uploaded",
          });
          if (result.jobId) watchUploadJob(item.localId, result.jobId);
        } catch (reason) {
          const apiError = asApiError(reason);
          updateUploadItem(item.localId, {
            phase: "error",
            errorCode: apiError.code,
            errorParams: apiError.params,
            errorStatus: apiError.status,
          });
          setError(apiError);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro kicker={t("upload.kicker")} title={t("upload.title")} body={t("upload.body")} />
      {user && !canUpload(user.role) ? <p className="panel p-3 text-sm leading-snug">{t("upload.viewerOnly")}</p> : null}
      <ErrorNote error={error} />
      <section
        className="panel min-w-0 border-dashed p-4 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addUploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <p className="text-lg leading-snug">{t("upload.drop")}</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t("upload.types")}</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {t("upload.limit", { size: format.number(1024, { style: "unit", unit: "megabyte" }) })}
        </p>
        <label className="btn btn-primary mt-3 cursor-pointer">
          {t("upload.browse")}
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              addUploadFiles(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
        </label>
      </section>
      <p className="text-sm leading-snug text-[var(--muted)]">{t("upload.draftNote")}</p>
      <section className="panel min-w-0 space-y-3 p-3">
        <h2 className="section-title">{t("upload.metadata")}</h2>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <FieldLabel label={t("upload.titleField")} hint={t("upload.titleHint")}>
            <TextInput value={draft.title} onChange={(event) => patchUpload({ title: event.target.value })} />
          </FieldLabel>
          <FieldLabel label={t("upload.collection")}>
            <Select value={draft.collectionId} onChange={(event) => patchUpload({ collectionId: event.target.value })}>
              <option value="">{t("common.none")}</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel label={t("upload.source")}>
            <TextInput value={draft.source} onChange={(event) => patchUpload({ source: event.target.value })} />
          </FieldLabel>
          <FieldLabel label={t("upload.sourceLanguage")} hint={t("common.optional")}>
            <TextInput value={draft.sourceLanguage} onChange={(event) => patchUpload({ sourceLanguage: event.target.value })} />
          </FieldLabel>
          <FieldLabel label={t("upload.tags")} hint={t("upload.tagsHint")}>
            <TextInput value={draft.tags} onChange={(event) => patchUpload({ tags: event.target.value })} />
          </FieldLabel>
          <FieldLabel label={t("upload.captureMode")}>
            <Select value={draft.captureDateMode} onChange={(event) => patchUpload({ captureDateMode: event.target.value as typeof draft.captureDateMode })}>
              <option value="file">{t("upload.capture.file")}</option>
              <option value="unknown">{t("upload.capture.unknown")}</option>
              <option value="user">{t("upload.capture.user")}</option>
            </Select>
          </FieldLabel>
          {draft.captureDateMode === "user" ? (
            <FieldLabel label={t("upload.capturedAt")} hint={timeZone}>
              <TextInput type="datetime-local" value={draft.capturedAt} onChange={(event) => patchUpload({ capturedAt: event.target.value })} />
            </FieldLabel>
          ) : null}
        </div>
        <FieldLabel label={t("upload.description")}>
          <TextArea value={draft.description} onChange={(event) => patchUpload({ description: event.target.value })} />
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!canUpload(user?.role) || busy || !draft.items.length} onClick={() => void start()}>
            {busy ? t("upload.working") : t("upload.start")}
          </Button>
          <Button type="button" variant="quiet" onClick={() => clearFinishedUploads()}>
            {t("upload.clearFinished")}
          </Button>
        </div>
      </section>
      {draft.items.length ? (
        <ul className="space-y-3">
          {draft.items.map((item) => (
            <li key={item.localId} className="panel min-w-0 space-y-3 p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{item.file.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    <FileSize bytes={item.file.size} />
                    {" · "}
                    {t("upload.direct")}
                  </p>
                </div>
                <Button type="button" variant="ghost" disabled={item.phase === "uploading"} onClick={() => removeUploadItem(item.localId)} aria-label={t("upload.removeFile", { name: item.file.name })}>
                  {t("common.remove")}
                </Button>
              </div>
              <Progress label={t("upload.progressUpload", { value: format.number(item.uploadRatio, { style: "percent" }) })} ratio={item.uploadRatio} />
              <p className="text-sm leading-snug">
                {t("upload.progressProcessing", {
                  status: item.processingStatus && t.has(`status.${item.processingStatus}`) ? t(`status.${item.processingStatus}`) : t("common.notAvailable"),
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={item.phase === "error" ? "danger" : item.phase === "done" ? "ok" : "neutral"}>
                  {item.phase === "done"
                    ? t("upload.done")
                    : item.phase === "ready"
                      ? t("upload.queued")
                      : item.phase === "uploading"
                        ? t("status.uploading")
                        : item.processingStatus && t.has(`status.${item.processingStatus}`)
                          ? t(`status.${item.processingStatus}`)
                          : t("status.unknown")}
                </Badge>
              </div>
              {item.errorCode ? <ErrorNote error={new ApiError(item.errorCode, item.errorParams || {}, item.errorStatus || 400)} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--muted)]">{t("upload.empty")}</p>
      )}
    </div>
  );
}

function Progress({ label, ratio }: { label: string; ratio: number }) {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div>
      <p className="mb-1 text-sm">{label}</p>
      <div className="meter" aria-hidden>
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

type DraftFields = {
  title: string;
  description: string;
  collectionId: string;
  source: string;
  tags: string;
  sourceLanguage: string;
  captureDateMode: string;
  capturedAt: string;
};

async function uploadDirect(localId: string, file: File, draft: DraftFields, timeZone: string) {
  const body = new FormData();
  body.set("file", file);
  appendMeta(body, draft, timeZone);
  const response = await xhrJson("POST", "/api/assets/direct", body, { "X-DME-Request": "1" }, true, (ratio) => updateUploadItem(localId, { uploadRatio: ratio, route: "direct" }));
  const asset = response.asset as { id?: string } | undefined;
  return { assetId: asset?.id, jobId: typeof response.jobId === "string" ? response.jobId : undefined };
}

function appendMeta(body: FormData, draft: DraftFields, timeZone: string) {
  body.set("title", draft.title);
  body.set("description", draft.description);
  if (draft.collectionId) body.set("collectionId", draft.collectionId);
  if (draft.source) body.set("source", draft.source);
  body.set("tags", draft.tags);
  if (draft.sourceLanguage) body.set("sourceLanguage", draft.sourceLanguage);
  body.set("captureDateMode", draft.captureDateMode);
  if (draft.captureDateMode === "user") body.set("capturedAt", draft.capturedAt);
  body.set("timeZone", timeZone);
}

function xhrJson(method: string, url: string, body: FormData, headers: Record<string, string>, credentials: boolean, onProgress: (ratio: number) => void) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = credentials;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const error = (data.error || {}) as { code?: string; params?: Record<string, string | number | string[]> };
        reject(new ApiError(error.code || "REQUEST_FAILED", error.params || {}, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("REQUEST_FAILED", {}, 0));
    xhr.send(body);
  });
}

function parseJson(text: string) {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
