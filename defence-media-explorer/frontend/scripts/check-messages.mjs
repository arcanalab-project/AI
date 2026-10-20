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

console.log("messages: key parity ok for " + locales.join(", "));
console.log("formats: dates " + dates["en-GB"] + " | " + dates["de-DE"]);
console.log("formats: numbers " + numbers["en-GB"] + " | " + numbers["de-DE"] + " | " + numbers["fr-FR"]);
console.log("plurals: rendered for " + locales.length + " locales");
