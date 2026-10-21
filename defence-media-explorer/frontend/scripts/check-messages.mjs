import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { IntlMessageFormat } = require("intl-messageformat");

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const locales = ["it-IT", "en-GB", "fr-FR", "es-ES", "de-DE"];
const messages = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(resolve(here, `../messages/${locale}.json`), "utf8"))]));

function flatten(value, prefix = "", out = new Set()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
    return out;
  }
  out.add(prefix);
  return out;
}

const sets = Object.fromEntries(locales.map((locale) => [locale, flatten(messages[locale])]));
const baseline = sets["en-GB"];
for (const locale of locales) {
  const missing = [...baseline].filter((key) => !sets[locale].has(key));
  const extra = [...sets[locale]].filter((key) => !baseline.has(key));
  if (missing.length || extra.length) {
    console.error(locale, "missing", missing, "extra", extra);
    process.exit(1);
  }
}

const errorsPy = readFileSync(resolve(root, "backend/app/errors.py"), "utf8");
const block = errorsPy.slice(errorsPy.indexOf("ERROR_CODES"));
const catalog = block.slice(block.indexOf("{"), block.indexOf("}"));
const codes = [...catalog.matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]);
if (!codes.includes("AUTH_REQUIRED") || !codes.includes("PASSWORD_POLICY")) {
  console.error("could not read error codes");
  process.exit(1);
}
for (const code of [...codes, "UNKNOWN", "REQUEST_FAILED"]) {
  if (!baseline.has(`errors.${code}`)) {
    console.error("missing errors." + code);
    process.exit(1);
  }
}
for (const name of ["maxMb", "existingAssetId", "expected", "actual", "model", "field", "fields", "status", "reason", "capability", "value"]) {
  if (!baseline.has(`errors.params.${name}`)) {
    console.error("missing errors.params." + name);
    process.exit(1);
  }
}
for (const key of ["search.examples.tracked", "search.examples.drones", "search.examples.maintenance", "search.examples.inspections", "search.warnings.SORT_WINDOW"]) {
  if (!baseline.has(key)) {
    console.error("missing " + key);
    process.exit(1);
  }
}

function formatZulu(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}Z`;
}

function lookup(tree, path) {
  return path.split(".").reduce((node, key) => node[key], tree);
}

for (const locale of locales) {
  if (locale === "en-GB") continue;
  for (const key of ["search.examples.tracked", "nav.settings", "search.unknown.include"]) {
    if (lookup(messages[locale], key) === lookup(messages["en-GB"], key)) {
      console.error(locale, key, "still matches English");
      process.exit(1);
    }
  }
}

const instant = new Date("2024-01-15T15:00:00Z");
const dateOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" };
const dates = Object.fromEntries(locales.map((locale) => [locale, new Intl.DateTimeFormat(locale, dateOptions).format(instant)]));
for (const [locale, value] of Object.entries(dates)) {
  if (!value.includes("16")) {
    console.error(locale, "did not show 16:00 in Europe/Rome for 15:00 UTC", value);
    process.exit(1);
  }
}
if (dates["en-GB"] === dates["de-DE"] || dates["en-GB"] === dates["fr-FR"]) {
  console.error("date formats did not change with locale", dates);
  process.exit(1);
}

const numbers = Object.fromEntries(locales.map((locale) => [locale, new Intl.NumberFormat(locale).format(1234567.5)]));
if (numbers["en-GB"] !== "1,234,567.5" || numbers["de-DE"] !== "1.234.567,5") {
  console.error("unexpected number formats", numbers);
  process.exit(1);
}
if (numbers["fr-FR"] === numbers["en-GB"] || numbers["es-ES"] === numbers["en-GB"]) {
  console.error("number formats did not change", numbers);
  process.exit(1);
}

for (const locale of locales) {
  const rules = new Intl.PluralRules(locale);
  if (rules.select(1) !== "one") {
    console.error(locale, "plural one");
    process.exit(1);
  }
  const one = new IntlMessageFormat(lookup(messages[locale], "common.duration.seconds"), locale).format({ count: 1 });
  const two = new IntlMessageFormat(lookup(messages[locale], "common.duration.seconds"), locale).format({ count: 2 });
  const many = new IntlMessageFormat(lookup(messages[locale], "search.candidates"), locale).format({ count: 5 });
  if (one === two || !String(one).includes("1") || !String(two).includes("2") || !String(many).includes("5")) {
    console.error(locale, "plural messages", one, two, many);
    process.exit(1);
  }
}

const glossary = {
  "en-GB": {
    "medex.brand.title": "TACTICAL MEDIA EXPLOITATION (MEDEX)",
    "medex.brand.subtitle": "Multimodal semantic search platform for ISR feeds, FLIR tracks, and mission assets.",
    "medex.search.placeholder": "Enter target, MGRS/Grid coordinates, audio transcript, or vehicle designation...",
    "medex.status.ready": "PROCESSED",
    "medex.status.partial": "IN PROGRESS",
  },
  "it-IT": {
    "medex.brand.title": "SFRUTTAMENTO OPERATIVO MEDIA (MEDEX)",
    "medex.brand.subtitle": "Piattaforma di ricerca semantica multimodale su feed ISR, tracciati FLIR e asset di missione.",
    "medex.search.placeholder": "Inserisci target, coordinate MGRS, trascrizione audio o identificativo mezzo...",
    "medex.status.ready": "ELABORATO",
    "medex.status.partial": "IN CORSO",
  },
  "fr-FR": {
    "medex.brand.title": "EXPLOITATION MÉDIA TACTIQUE (MEDEX)",
    "medex.brand.subtitle": "Plateforme de recherche sémantique multimodale pour flux ISR, traces FLIR et actifs de mission.",
    "medex.search.placeholder": "Saisir cible, coordonnées MGRS, transcription audio ou désignation du véhicule...",
    "medex.status.ready": "TRAITÉ",
    "medex.status.partial": "EN COURS",
  },
  "de-DE": {
    "medex.brand.title": "TAKTISCHE MEDIENAUSWERTUNG (MEDEX)",
    "medex.brand.subtitle": "Multimodale semantische Suchplattform für ISR-Feeds, FLIR-Spuren und Einsatzmittel.",
    "medex.search.placeholder": "Ziel, MGRS-Koordinaten, Audiotranskript oder Fahrzeugkennung eingeben...",
    "medex.status.ready": "VERARBEITET",
    "medex.status.partial": "IN BEARBEITUNG",
  },
  "es-ES": {
    "medex.brand.title": "EXPLOTACIÓN TÁCTICA DE MEDIOS (MEDEX)",
    "medex.brand.subtitle": "Plataforma de búsqueda semántica multimodal para flujos ISR, trazas FLIR y activos de misión.",
    "medex.search.placeholder": "Introduzca objetivo, coordenadas MGRS, transcripción de audio o designación del vehículo...",
    "medex.status.ready": "PROCESADO",
    "medex.status.partial": "EN CURSO",
  },
};

for (const [locale, entries] of Object.entries(glossary)) {
  for (const [key, expected] of Object.entries(entries)) {
    if (lookup(messages[locale], key) !== expected) {
      console.error(locale, key, "glossary mismatch", lookup(messages[locale], key));
      process.exit(1);
    }
  }
  if (lookup(messages[locale], "status.ready") !== entries["medex.status.ready"] || lookup(messages[locale], "status.partial") !== entries["medex.status.partial"]) {
    console.error(locale, "status.ready/partial drifted from the MEDEX glossary");
    process.exit(1);
  }
  if (lookup(messages[locale], "security.classification.restricted") !== "RESTRICTED" || lookup(messages[locale], "security.classification.unclassified") !== "UNCLASSIFIED") {
    console.error(locale, "classification markings must stay in English");
    process.exit(1);
  }
  if (lookup(messages[locale], "health.index.ready") === entries["medex.status.ready"]) {
    console.error(locale, "health.index.ready was overwritten with the MEDEX terminal state");
    process.exit(1);
  }
}

const zulu = formatZulu(new Date("2026-10-21T10:30:00Z"));
if (zulu !== "2026-10-21 10:30Z") {
  console.error("zulu format", zulu);
  process.exit(1);
}

console.log("messages: key parity ok for " + locales.join(", "));
console.log("formats: dates " + dates["en-GB"] + " | " + dates["de-DE"]);
console.log("formats: numbers " + numbers["en-GB"] + " | " + numbers["de-DE"] + " | " + numbers["fr-FR"]);
console.log("plurals: rendered for " + locales.length + " locales");
