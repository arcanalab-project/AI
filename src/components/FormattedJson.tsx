"use client";

function pathHot(path: string, highlight: string[] | null): boolean {
  if (!highlight || highlight.length === 0) return false;
  return highlight.some(
    (item) =>
      path === item ||
      path.startsWith(`${item}.`) ||
      path.startsWith(`${item}[`) ||
      item.startsWith(`${path}.`) ||
      item.startsWith(`${path}[`),
  );
}

function pathChanged(path: string, changed: string[]): boolean {
  return changed.some((c) => path === c || path.startsWith(`${c}.`) || path.startsWith(`${c}[`));
}

export function FormattedJson({
  value,
  highlight,
  changedPaths = [],
  dimUnchanged = false,
}: {
  value: unknown;
  highlight?: string | string[] | null;
  changedPaths?: string[];
  dimUnchanged?: boolean;
}) {
  const paths = highlight == null ? null : Array.isArray(highlight) ? highlight : [highlight];
  return (
    <pre className="json-pre" aria-label="JSON representation of the MongoDB document">
      <JsonNode value={value} path="" indent={0} highlight={paths} changedPaths={changedPaths} dimUnchanged={dimUnchanged} />
    </pre>
  );
}

function JsonNode({
  value,
  path,
  indent,
  highlight,
  changedPaths,
  dimUnchanged,
}: {
  value: unknown;
  path: string;
  indent: number;
  highlight: string[] | null;
  changedPaths: string[];
  dimUnchanged: boolean;
}) {
  const pad = "  ".repeat(indent);
  const hot = path !== "" && pathHot(path, highlight);
  const changed = path !== "" && pathChanged(path, changedPaths);
  const dim = dimUnchanged && path !== "" && !changed && !hot;

  if (value === null || typeof value !== "object") {
    return (
      <span className={dim ? "json-dim" : undefined} data-path={path || undefined} data-hot={hot ? "true" : undefined}>
        <Primitive value={value} />
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span data-path={path || undefined} data-hot={hot ? "true" : undefined} className={dim ? "json-dim" : undefined}>
          <span className="json-punct">[]</span>
        </span>
      );
    }
    return (
      <span data-path={path || undefined} data-hot={hot ? "true" : undefined} className={hot ? "json-hot" : undefined}>
        <span className="json-punct">[</span>
        {"\n"}
        {value.map((item, i) => (
          <span key={i}>
            {pad}{"  "}
            <JsonNode
              value={item}
              path={`${path}[${i}]`}
              indent={indent + 1}
              highlight={highlight}
              changedPaths={changedPaths}
              dimUnchanged={dimUnchanged}
            />
            {i < value.length - 1 ? <span className="json-punct">,</span> : null}
            {"\n"}
          </span>
        ))}
        {pad}
        <span className="json-punct">]</span>
      </span>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <span data-path={path || undefined} data-hot={hot ? "true" : undefined} className={hot ? "json-hot" : undefined}>
      <span className="json-punct">{"{"}</span>
      {"\n"}
      {entries.map(([key, child], i) => {
        const childPath = path ? `${path}.${key}` : key;
        const lineHot = pathHot(childPath, highlight);
        const lineChanged = pathChanged(childPath, changedPaths);
        const lineDim = dimUnchanged && !lineChanged && !lineHot;
        return (
          <span key={key} className={lineDim ? "json-dim" : lineHot || lineChanged ? "json-hot" : undefined} data-path={childPath} data-hot={lineHot || lineChanged ? "true" : undefined}>
            {pad}
            {"  "}
            <span className="json-key">{JSON.stringify(key)}</span>
            <span className="json-punct">: </span>
            <JsonNode
              value={child}
              path={childPath}
              indent={indent + 1}
              highlight={highlight}
              changedPaths={changedPaths}
              dimUnchanged={dimUnchanged}
            />
            {i < entries.length - 1 ? <span className="json-punct">,</span> : null}
            {"\n"}
          </span>
        );
      })}
      {pad}
      <span className="json-punct">{"}"}</span>
    </span>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="json-string">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="json-number">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="json-bool">{String(value)}</span>;
  if (value === null) return <span className="json-null">null</span>;
  return <span>{String(value)}</span>;
}
