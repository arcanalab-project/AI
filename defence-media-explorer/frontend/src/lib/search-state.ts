export type SearchMode = "semantic" | "fulltext" | "hybrid";
export type UnknownCapture = "include" | "exclude" | "only";
export type DateField = "capturedAt" | "uploadedAt";

export type FilterState = {
  q: string;
  mode: SearchMode;
  sort: string;
  dateField: DateField;
  dateFrom: string;
  dateTo: string;
  unknownCapture: UnknownCapture;
  mediaTypes: string[];
  collectionIds: string[];
  sources: string[];
  tags: string[];
  categories: string[];
  sourceLanguages: string[];
  processingStatuses: string[];
  page: number;
};

export const EMPTY_FILTERS: FilterState = {
  q: "",
  mode: "hybrid",
  sort: "relevance",
  dateField: "capturedAt",
  dateFrom: "",
  dateTo: "",
  unknownCapture: "include",
  mediaTypes: [],
  collectionIds: [],
  sources: [],
  tags: [],
  categories: [],
  sourceLanguages: [],
  processingStatuses: [],
  page: 1,
};

function list(value: string | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readFilters(params: URLSearchParams): FilterState {
  const mode = params.get("mode");
  const unknown = params.get("unknownCapture");
  const page = Number(params.get("page") || "1");
  return {
    q: params.get("q") || "",
    mode: mode === "semantic" || mode === "fulltext" || mode === "hybrid" ? mode : "hybrid",
    sort: params.get("sort") || "relevance",
    dateField: params.get("dateField") === "uploadedAt" ? "uploadedAt" : "capturedAt",
    dateFrom: params.get("dateFrom") || "",
    dateTo: params.get("dateTo") || "",
    unknownCapture: unknown === "exclude" || unknown === "only" || unknown === "include" ? unknown : "include",
    mediaTypes: list(params.get("mediaType")),
    collectionIds: list(params.get("collectionId")),
    sources: list(params.get("source")),
    tags: list(params.get("tag")),
    categories: list(params.get("category")),
    sourceLanguages: list(params.get("sourceLanguage")),
    processingStatuses: list(params.get("processingStatus")),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export function writeFilters(state: FilterState, defaults: Partial<FilterState> = {}) {
  const params = new URLSearchParams();
  const sortDefault = defaults.sort || "relevance";
  if (state.q) params.set("q", state.q);
  if (state.mode !== "hybrid") params.set("mode", state.mode);
  if (state.sort && state.sort !== sortDefault) params.set("sort", state.sort);
  if (state.dateField !== "capturedAt") params.set("dateField", state.dateField);
  if (state.dateFrom) params.set("dateFrom", state.dateFrom);
  if (state.dateTo) params.set("dateTo", state.dateTo);
  if (state.unknownCapture !== "include") params.set("unknownCapture", state.unknownCapture);
  if (state.mediaTypes.length) params.set("mediaType", state.mediaTypes.join(","));
  if (state.collectionIds.length) params.set("collectionId", state.collectionIds.join(","));
  if (state.sources.length) params.set("source", state.sources.join(","));
  if (state.tags.length) params.set("tag", state.tags.join(","));
  if (state.categories.length) params.set("category", state.categories.join(","));
  if (state.sourceLanguages.length) params.set("sourceLanguage", state.sourceLanguages.join(","));
  if (state.processingStatuses.length) params.set("processingStatus", state.processingStatuses.join(","));
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function toSearchFilters(state: FilterState, timeZone: string) {
  return {
    dateField: state.dateField,
    dateFrom: state.dateFrom || null,
    dateTo: state.dateTo || null,
    unknownCapture: state.unknownCapture,
    timeZone,
    mediaTypes: state.mediaTypes,
    collectionIds: state.collectionIds,
    sources: state.sources,
    tags: state.tags,
    categories: state.categories,
    sourceLanguages: state.sourceLanguages,
    processingStatuses: state.processingStatuses,
  };
}
