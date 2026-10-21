import type { MessageKeys, NestedKeyOf } from "next-intl";

type Catalog = typeof import("../messages/en-GB.json");

declare global {
  interface IntlMessages extends Catalog {}
}

export type MessageKey = MessageKeys<Catalog, NestedKeyOf<Catalog>>;

export const medexKeys = {
  title: "medex.brand.title",
  subtitle: "medex.brand.subtitle",
  placeholder: "medex.search.placeholder",
  ready: "medex.status.ready",
  partial: "medex.status.partial",
  restricted: "security.classification.restricted",
  unclassified: "security.classification.unclassified",
} as const satisfies Record<string, MessageKey>;

type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

/** Static catalog access. `ReturnType<typeof useTranslations>` collapses the generic hook and is not usable here. */
export type Translator = {
  (key: MessageKey, values?: MessageValues): string;
  has: (key: MessageKey) => boolean;
};

type LooseTranslator = ((key: string, values?: MessageValues) => string) & {
  has: (key: string) => boolean;
};

function loose(t: Translator): LooseTranslator {
  return t as unknown as LooseTranslator;
}

/** API-driven keys. Static copy stays on `t("domain.component.key")` so a missing catalog entry fails the build. */
export function message(t: Translator, key: string, fallback: string, values?: MessageValues): string {
  const lookup = loose(t);
  if (!lookup.has(key)) return fallback;
  return values ? lookup(key, values) : lookup(key);
}

/** Terminal MEDEX states use the doctrinal glossary. Pipeline stages stay on `status.*`. */
export function statusLabel(t: Translator, status?: string | null, fallback?: string): string {
  if (status === "ready") return t("medex.status.ready");
  if (status === "partial") return t("medex.status.partial");
  return message(t, status ? `status.${status}` : "status.unknown", fallback ?? t("status.unknown"));
}
