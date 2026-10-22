"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

export type CaptureMode = "user" | "unknown" | "file";

export type UploadItem = {
  localId: string;
  file: File;
  phase: "ready" | "uploading" | "processing" | "done" | "error";
  uploadRatio: number;
  route: "direct" | null;
  jobId?: string;
  assetId?: string;
  processingStatus?: string;
  errorCode?: string;
  errorParams?: Record<string, string | number | string[]>;
  errorStatus?: number;
};

export type UploadDraft = {
  title: string;
  description: string;
  collectionId: string;
  source: string;
  tags: string;
  sourceLanguage: string;
  captureDateMode: CaptureMode;
  capturedAt: string;
  items: UploadItem[];
};

const EMPTY: UploadDraft = {
  title: "",
  description: "",
  collectionId: "",
  source: "",
  tags: "",
  sourceLanguage: "",
  captureDateMode: "file",
  capturedAt: "",
  items: [],
};

let draft: UploadDraft = { ...EMPTY, items: [] };
const listeners = new Set<() => void>();
const watching = new Set<string>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getUploadDraft() {
  return draft;
}

export function subscribeUpload(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUploadDraft() {
  return useSyncExternalStore(subscribeUpload, getUploadDraft, getUploadDraft);
}

export function patchUpload(partial: Partial<Omit<UploadDraft, "items">>) {
  draft = { ...draft, ...partial };
  emit();
}

export function addUploadFiles(files: File[]) {
  const items = files.map((file) => ({
    localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    phase: "ready" as const,
    uploadRatio: 0,
    route: null,
  }));
  draft = { ...draft, items: [...draft.items, ...items] };
  emit();
}

export function updateUploadItem(localId: string, partial: Partial<UploadItem>) {
  draft = {
    ...draft,
    items: draft.items.map((item) => (item.localId === localId ? { ...item, ...partial } : item)),
  };
  emit();
}

export function removeUploadItem(localId: string) {
  draft = { ...draft, items: draft.items.filter((item) => item.localId !== localId) };
  emit();
}

export function clearFinishedUploads() {
  draft = { ...draft, items: draft.items.filter((item) => item.phase !== "done") };
  emit();
}

export function watchUploadJob(localId: string, jobId: string) {
  if (watching.has(localId)) return;
  watching.add(localId);
  void (async () => {
    let workerDownSince: number | null = null;
    try {
      while (true) {
        const current = draft.items.find((item) => item.localId === localId);
        if (!current) return;
        const data = await api<{
          job: { status?: string; error?: { code?: string; params?: Record<string, string | number | string[]> } };
          worker?: { alive?: boolean };
        }>(`/api/jobs/${jobId}`);
        const status = data.job.status || "unknown";
        updateUploadItem(localId, { processingStatus: status, phase: "processing" });
        if (status === "ready" || status === "partial") {
          updateUploadItem(localId, { phase: "done", processingStatus: status });
          return;
        }
        if (status === "failed") {
          updateUploadItem(localId, {
            phase: "error",
            processingStatus: status,
            errorCode: data.job.error?.code || "REQUEST_FAILED",
            errorParams: data.job.error?.params || {},
          });
          return;
        }
        if (data.worker && data.worker.alive === false) {
          workerDownSince = workerDownSince ?? Date.now();
          if (Date.now() - workerDownSince >= 20000) {
            updateUploadItem(localId, {
              phase: "error",
              processingStatus: status,
              errorCode: "WORKER_NOT_RUNNING",
              errorParams: {},
            });
            return;
          }
        } else {
          workerDownSince = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    } catch {
      updateUploadItem(localId, { phase: "error", errorCode: "REQUEST_FAILED", errorParams: {} });
    } finally {
      watching.delete(localId);
    }
  })();
}
