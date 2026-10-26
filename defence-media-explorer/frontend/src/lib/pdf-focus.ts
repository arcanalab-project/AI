export type PdfGlyph = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

export type PdfRect = { x: number; y: number; width: number; height: number };

const PAD_X = 14;
const PAD_Y = 4;
const LINE_TOLERANCE = 2.5;
const QUERY_CONTEXT = 28;
const MAX_MATCH = 1200;

export function passageFocus(
  items: PdfGlyph[],
  transcript: string,
  pageWidth: number,
  pageHeight: number,
  query = "",
): { marks: PdfRect[]; focus: PdfRect; font: number } | null {
  const needle = compact(transcript);
  const slots: { item: number; char: number }[] = [];
  let compactText = "";
  items.forEach((item, index) => {
    for (let char = 0; char < item.str.length; char += 1) {
      if (!/[\p{L}\p{N}]/u.test(item.str[char])) continue;
      compactText += item.str[char].toLowerCase();
      slots.push({ item: index, char });
    }
  });

  const queryHit = locateQuery(query, compactText);
  let at = -1;
  let length = 0;
  let lineWindow = LINE_TOLERANCE;
  if (queryHit) {
    at = queryHit.at;
    length = queryHit.length;
    lineWindow = QUERY_CONTEXT;
  } else {
    const probe = needle.slice(0, Math.min(32, needle.length));
    if (probe.length < 8) return null;
    at = compactText.indexOf(probe);
    if (at < 0) return null;
    length = probe.length;
    const limit = Math.min(needle.length, MAX_MATCH, compactText.length - at);
    while (length < limit && compactText[at + length] === needle[length]) length += 1;
  }

  const ranges = new Map<number, { from: number; to: number }>();
  for (let index = at; index < at + length; index += 1) {
    const slot = slots[index];
    const range = ranges.get(slot.item) || { from: slot.char, to: slot.char + 1 };
    range.from = Math.min(range.from, slot.char);
    range.to = Math.max(range.to, slot.char + 1);
    ranges.set(slot.item, range);
  }

  const baselines = [...ranges.keys()].map((index) => items[index].transform[5] ?? 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let font = 0;
  let fontCount = 0;
  for (const item of items) {
    const baseline = item.transform[5] ?? 0;
    if (!baselines.some((line) => Math.abs(line - baseline) <= lineWindow)) continue;
    const height = fontHeight(item);
    font += height;
    fontCount += 1;
    minX = Math.min(minX, item.transform[4] ?? 0);
    maxX = Math.max(maxX, (item.transform[4] ?? 0) + item.width);
    minY = Math.min(minY, baseline);
    maxY = Math.max(maxY, baseline + height);
  }
  if (!Number.isFinite(minX) || maxX <= minX) return null;

  const marks = [...ranges.entries()].map(([index, range]) => sliceBox(items[index], range.from, range.to));
  const fitted = includeTouchedLines(items, {
    x: minX - PAD_X,
    y: minY - PAD_Y,
    width: maxX - minX + PAD_X * 2,
    height: maxY - minY + PAD_Y * 2,
  });
  const x = clamp(fitted.x, 0, pageWidth);
  const y = clamp(fitted.y, 0, pageHeight);
  const right = clamp(fitted.x + fitted.width, 0, pageWidth);
  const top = clamp(fitted.y + fitted.height, 0, pageHeight);
  return {
    marks,
    focus: { x, y, width: Math.max(right - x, 24), height: Math.max(top - y, 24) },
    font: fontCount ? font / fontCount : 11,
  };
}

function includeTouchedLines(items: PdfGlyph[], box: PdfRect): PdfRect {
  let x = box.x;
  let y = box.y;
  let right = box.x + box.width;
  let top = box.y + box.height;
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      const glyph = glyphBox(item);
      const overlaps = glyph.x < right - 0.5 && glyph.x + glyph.width > x + 0.5 && glyph.y < top - 0.5 && glyph.y + glyph.height > y + 0.5;
      if (!overlaps) continue;
      const nextX = Math.min(x, glyph.x);
      const nextY = Math.min(y, glyph.y);
      const nextRight = Math.max(right, glyph.x + glyph.width);
      const nextTop = Math.max(top, glyph.y + glyph.height);
      if (nextY < y - 0.4 || nextTop > top + 0.4 || nextX < x - 0.4 || nextRight > right + 0.4) {
        x = nextX;
        y = nextY;
        right = nextRight;
        top = nextTop;
        changed = true;
      }
    }
  }
  return { x, y, width: right - x, height: top - y };
}

function glyphBox(item: PdfGlyph): PdfRect {
  const baseline = item.transform[5] ?? 0;
  const height = fontHeight(item);
  return { x: item.transform[4] ?? 0, y: baseline - height * 0.25, width: item.width, height: height * 1.25 };
}

function locateQuery(query: string, hay: string) {
  const candidates: string[] = [];
  const full = compact(query);
  if (full.length >= 8) candidates.push(full);
  for (const word of query.split(/\s+/)) {
    const token = compact(word);
    if (token.length >= 8 && !candidates.includes(token)) candidates.push(token);
  }
  for (const probe of candidates) {
    const at = hay.indexOf(probe);
    if (at >= 0) return { at, length: probe.length };
  }
  return null;
}

export function compact(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sliceBox(item: PdfGlyph, from: number, to: number): PdfRect {
  const length = Math.max(item.str.length, 1);
  const origin = item.transform[4] ?? 0;
  const baseline = item.transform[5] ?? 0;
  const height = fontHeight(item);
  return {
    x: origin + (item.width * from) / length,
    y: baseline,
    width: Math.max((item.width * (to - from)) / length, height * 0.35),
    height: height * 1.15,
  };
}

function fontHeight(item: PdfGlyph) {
  const [a = 0, b = 0, c = 0, d = 0] = item.transform;
  return Math.hypot(c, d) || Math.hypot(a, b) || item.height || 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
