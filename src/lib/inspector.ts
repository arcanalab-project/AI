import type { InspectorRecord } from "./types";

let last: InspectorRecord | null = null;

export function setLastInspector(record: InspectorRecord) {
  last = record;
  return record;
}

export function getLastInspector() {
  return last;
}

export function timed<T>(
  description: string,
  engine: InspectorRecord["engine"],
  target: string,
  operation: unknown,
  fn: () => T | Promise<T>,
  extra?: Partial<InspectorRecord>,
): Promise<{ value: T; inspector: InspectorRecord }> {
  const started = Date.now();
  return Promise.resolve(fn()).then((value) => {
    const inspector = setLastInspector({
      description,
      engine,
      target,
      operation,
      outcome: "ok",
      result: summarize(value),
      elapsedMs: Date.now() - started,
      measured: true,
      ...extra,
    });
    return { value, inspector };
  });
}

function summarize(value: unknown): unknown {
  if (value == null) return value;
  try {
    const json = JSON.stringify(value);
    if (json.length < 4000) return JSON.parse(json);
    return { truncated: true, preview: json.slice(0, 1500) };
  } catch {
    return String(value);
  }
}
