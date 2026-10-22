export class ApiError extends Error {
  code: string;
  params: Record<string, string | number | string[]>;
  status: number;

  constructor(code: string, params: Record<string, string | number | string[]> = {}, status = 400) {
    super(code);
    this.code = code;
    this.params = params;
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-DME-Request", "1");
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error || {};
    throw new ApiError(error.code || "REQUEST_FAILED", error.params || {}, response.status);
  }
  return data as T;
}

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: "viewer" | "uploader" | "admin";
  workspaceId: string;
  locale: string;
  timeZone: string;
};

export type Asset = {
  id: string;
  title: string;
  description?: string;
  mediaType: string;
  mimeType?: string;
  source?: string | null;
  tags: string[];
  collectionId?: string | null;
  capturedAt?: string | null;
  captureDateUnknown?: boolean;
  capturedAtSource?: string;
  captureDateMode?: string;
  uploadedAt?: string;
  processingStatus?: string;
  error?: { code: string; params?: Record<string, string | number> } | null;
  warnings?: string[];
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  sourceLanguage?: string | null;
  thumbnailUrl?: string | null;
  playbackUrl?: string | null;
  byteSize?: number;
  pipelineVersion?: string;
  generation?: number;
  indexingState?: string;
  technical?: Record<string, unknown>;
  sceneCutsMs?: number[];
  originalFilename?: string;
  sha256?: string;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  reviewState?: string;
};

export type Segment = {
  id: string;
  assetId: string;
  mediaType: string;
  segmentType: string;
  startMs?: number | null;
  endMs?: number | null;
  title?: string;
  description?: string;
  modelDescription?: string | null;
  transcript?: string | null;
  ocrText?: string | null;
  tags?: string[];
  categories?: string[];
  activities?: string[];
  environment?: string | null;
  uncertainties?: string[];
  source?: string | null;
  sourceLanguage?: string | null;
  thumbnailUrl?: string | null;
  storyboard?: { object?: { key?: string }; timestampMs?: number; url?: string }[];
  processingStatus?: string;
  warnings?: string[];
  audioAbsent?: boolean;
  noSpeech?: boolean;
  annotationProvenance?: Record<string, unknown> | null;
  transcriptProvenance?: Record<string, unknown> | null;
  embeddingStrategy?: string | null;
  textStale?: boolean;
};

export type SearchRelevance = {
  score: number;
  scoreType: string;
  fusion?: string | null;
  components?: Record<string, number>;
};

export type SearchMatchEvidence = {
  transcript?: string;
  ocrText?: string;
  sceneDescription?: string;
  userDescription?: string;
  tags?: string[];
  embeddingStrategy?: string;
};

export type SearchResult = {
  segmentId: string;
  assetId: string;
  mediaType: string;
  segmentType: string;
  title: string;
  capturedAt?: string | null;
  uploadedAt?: string;
  captureDateUnknown?: boolean;
  description?: string;
  matchText?: string;
  startMs?: number | null;
  endMs?: number | null;
  thumbnailUrl?: string | null;
  tags: string[];
  categories: string[];
  sourceLanguage?: string | null;
  processingStatus?: string;
  rank: number;
  nearbyCount: number;
  nearby: { segmentId: string; startMs?: number | null; endMs?: number | null; matchText?: string }[];
  relevance?: SearchRelevance | null;
  matchEvidence?: SearchMatchEvidence | null;
};

export const LOCALES = ["it-IT", "en-GB", "fr-FR", "es-ES", "de-DE"] as const;
export type LocaleId = (typeof LOCALES)[number];

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("REQUEST_FAILED", {}, 0);
}

export function canUpload(role?: string | null) {
  return role === "uploader" || role === "admin";
}

export function isAdmin(role?: string | null) {
  return role === "admin";
}
