"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, FieldLabel, Select, TextInput } from "@/components/ui";
import type { FilterState } from "@/lib/search-state";

const MEDIA = ["video", "image", "audio", "text"] as const;
const STATUSES = ["ready", "partial", "failed", "uploaded", "validating", "extracting", "enriching", "embedding", "indexing"] as const;

export function FilterPanel({
  state,
  timeZone,
  collections,
  facets,
  onChange,
  sortOptions,
}: {
  state: FilterState;
  timeZone: string;
  collections: { id: string; name: string }[];
  facets: { tags: string[]; sources: string[]; sourceLanguages: string[]; categories: string[] };
  onChange: (next: FilterState) => void;
  sortOptions: string[];
}) {
  const t = useTranslations();
  function patch(partial: Partial<FilterState>) {
    onChange({ ...state, ...partial, page: 1 });
  }

  const chips = chipsOf(state, t, collections);

  return (
    <section className="panel min-w-0 space-y-3 p-3">
      <h2 className="section-title">{t("search.filters")}</h2>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <FieldLabel label={t("search.dateField")}>
          <Select value={state.dateField} onChange={(event) => patch({ dateField: event.target.value === "uploadedAt" ? "uploadedAt" : "capturedAt" })}>
            <option value="capturedAt">{t("asset.captured")}</option>
            <option value="uploadedAt">{t("asset.uploaded")}</option>
          </Select>
        </FieldLabel>
        <FieldLabel label={t("search.unknownCapture")}>
          <Select value={state.unknownCapture} onChange={(event) => patch({ unknownCapture: event.target.value as FilterState["unknownCapture"] })}>
            <option value="include">{t("search.unknown.include")}</option>
            <option value="exclude">{t("search.unknown.exclude")}</option>
            <option value="only">{t("search.unknown.only")}</option>
          </Select>
        </FieldLabel>
        <FieldLabel label={t("search.dateFrom")}>
          <TextInput type="date" value={state.dateFrom} onChange={(event) => patch({ dateFrom: event.target.value })} />
        </FieldLabel>
        <FieldLabel label={t("search.dateTo")}>
          <TextInput type="date" value={state.dateTo} onChange={(event) => patch({ dateTo: event.target.value })} />
        </FieldLabel>
      </div>
      <p className="text-sm leading-snug text-[var(--muted)]">{t("search.dateZone", { zone: timeZone })}</p>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">{t("search.mediaType")}</legend>
        <div className="flex flex-wrap gap-2">
          {MEDIA.map((type) => (
            <label key={type} className="choice">
              <input
                type="checkbox"
                checked={state.mediaTypes.includes(type)}
                onChange={() => patch({ mediaTypes: toggle(state.mediaTypes, type) })}
              />
              <span className="break-words">{t(`mediaType.${type}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">{t("search.processingStatus")}</legend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <label key={status} className="choice">
              <input
                type="checkbox"
                checked={state.processingStatuses.includes(status)}
                onChange={() => patch({ processingStatuses: toggle(state.processingStatuses, status) })}
              />
              <span className="break-words">{t(`status.${status}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FieldLabel label={t("search.collection")}>
        <Select
          value=""
          onChange={(event) => {
            if (event.target.value) patch({ collectionIds: toggle(state.collectionIds, event.target.value) });
          }}
        >
          <option value="">{t("common.none")}</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </Select>
      </FieldLabel>
      <ValueList label={t("search.source")} values={state.sources} suggestions={facets.sources} onChange={(sources) => patch({ sources })} />
      <ValueList label={t("search.tags")} values={state.tags} suggestions={facets.tags} onChange={(tags) => patch({ tags })} />
      <ValueList label={t("search.categories")} values={state.categories} suggestions={facets.categories} onChange={(categories) => patch({ categories })} />
      <ValueList
        label={t("search.sourceLanguage")}
        values={state.sourceLanguages}
        suggestions={facets.sourceLanguages}
        onChange={(sourceLanguages) => patch({ sourceLanguages })}
      />
      <FieldLabel label={t("search.sort")}>
        <Select value={sortOptions.includes(state.sort) ? state.sort : sortOptions[0]} onChange={(event) => patch({ sort: event.target.value })}>
          {sortOptions.map((option) => (
            <option key={option} value={option}>
              {t.has(`search.sortOption.${option}`) ? t(`search.sortOption.${option}`) : option}
            </option>
          ))}
        </Select>
      </FieldLabel>
      {chips.length ? (
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium">{t("search.active")}</h3>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="max-w-full"
                onClick={() => onChange({ ...chip.clear(state), page: 1 })}
                aria-label={t("search.removeFilter", { label: chip.label })}
              >
                <Badge>
                  <span className="break-words">
                    {chip.label} ×
                  </span>
                </Badge>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Button type="button" variant="quiet" onClick={() => onChange({ ...state, ...blankFilters(state.sort), page: 1, q: state.q, mode: state.mode })}>
        {t("common.reset")}
      </Button>
    </section>
  );
}

function ValueList({
  label,
  values,
  suggestions,
  onChange,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations();
  return (
    <div className="min-w-0 space-y-2">
      <FieldLabel label={label}>
        <form
          className="flex min-w-0 flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const value = String(data.get("value") || "").trim();
            if (value && !values.includes(value)) onChange([...values, value]);
            event.currentTarget.reset();
          }}
        >
          <TextInput name="value" placeholder={t("search.valuePlaceholder")} list={`${label}-suggestions`} className="min-w-[12rem] flex-1" />
          <Button type="submit" variant="quiet">
            {t("search.addValue")}
          </Button>
          <datalist id={`${label}-suggestions`}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </form>
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button key={value} type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={t("search.removeFilter", { label: value })}>
            <Badge>{value} ×</Badge>
          </button>
        ))}
        {suggestions
          .filter((suggestion) => !values.includes(suggestion))
          .slice(0, 8)
          .map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onChange([...values, suggestion])}>
              <Badge tone="ok">{suggestion}</Badge>
            </button>
          ))}
      </div>
    </div>
  );
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function blankFilters(sort: string): FilterState {
  return {
    q: "",
    mode: "hybrid",
    sort,
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
}

function chipsOf(state: FilterState, t: ReturnType<typeof useTranslations>, collections: { id: string; name: string }[]) {
  const chips: { id: string; label: string; clear: (state: FilterState) => FilterState }[] = [];
  if (state.dateFrom || state.dateTo) {
    chips.push({
      id: "dates",
      label: `${t("search.dateField")}: ${state.dateFrom || "…"} – ${state.dateTo || "…"}`,
      clear: (current) => ({ ...current, dateFrom: "", dateTo: "" }),
    });
  }
  if (state.dateField !== "capturedAt") {
    chips.push({
      id: "dateField",
      label: t("asset.uploaded"),
      clear: (current) => ({ ...current, dateField: "capturedAt" }),
    });
  }
  if (state.unknownCapture !== "include") {
    chips.push({
      id: "unknown",
      label: t(`search.unknown.${state.unknownCapture}`),
      clear: (current) => ({ ...current, unknownCapture: "include" }),
    });
  }
  for (const type of state.mediaTypes) {
    chips.push({
      id: `media-${type}`,
      label: t.has(`mediaType.${type}`) ? t(`mediaType.${type}`) : type,
      clear: (current) => ({ ...current, mediaTypes: current.mediaTypes.filter((item) => item !== type) }),
    });
  }
  for (const id of state.collectionIds) {
    chips.push({
      id: `collection-${id}`,
      label: collections.find((item) => item.id === id)?.name || id,
      clear: (current) => ({ ...current, collectionIds: current.collectionIds.filter((item) => item !== id) }),
    });
  }
  for (const value of state.sources) chips.push(valueChip("source", value, "sources"));
  for (const value of state.tags) chips.push(valueChip("tag", value, "tags"));
  for (const value of state.categories) chips.push(valueChip("category", value, "categories"));
  for (const value of state.sourceLanguages) chips.push(valueChip("language", value, "sourceLanguages"));
  for (const status of state.processingStatuses) {
    chips.push({
      id: `status-${status}`,
      label: t.has(`status.${status}`) ? t(`status.${status}`) : status,
      clear: (current) => ({ ...current, processingStatuses: current.processingStatuses.filter((item) => item !== status) }),
    });
  }
  return chips;
}

function valueChip(prefix: string, value: string, key: "sources" | "tags" | "categories" | "sourceLanguages") {
  return {
    id: `${prefix}-${value}`,
    label: value,
    clear: (current: FilterState) => ({ ...current, [key]: current[key].filter((item) => item !== value) }),
  };
}
