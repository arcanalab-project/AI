#!/usr/bin/env python3
"""Keep one Bastion env file.

The user-store copy is the file that survives a new machine. A filled value
there is kept. An empty value never erases a filled one. Comments and the
store's key order stay put. Keys that exist only on the local side are
appended when they have a value.
"""

from __future__ import annotations

import sys
from pathlib import Path


def parse(path: Path) -> list[tuple[str, str] | str]:
    if not path.is_file():
        return []
    rows: list[tuple[str, str] | str] = []
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            rows.append(line)
            continue
        key, value = line.split("=", 1)
        rows.append((key, value))
    return rows


def filled(value: str) -> bool:
    return bool(value.strip().strip('"').strip("'"))


def merge(store_rows: list[tuple[str, str] | str], local_rows: list[tuple[str, str] | str]) -> list[str]:
    local_values = {row[0]: row[1] for row in local_rows if isinstance(row, tuple)}
    if not store_rows and not local_rows:
        return []
    base = store_rows or local_rows
    seen: set[str] = set()
    out: list[str] = []
    for row in base:
        if isinstance(row, str):
            out.append(row)
            continue
        key, value = row
        seen.add(key)
        other = local_values.get(key)
        if not filled(value) and other is not None and filled(other):
            value = other
        out.append(f"{key}={value}")
    if store_rows:
        for row in local_rows:
            if isinstance(row, tuple) and row[0] not in seen and filled(row[1]):
                out.append(f"{row[0]}={row[1]}")
    return out


def sync(store_path: Path, local_path: Path) -> None:
    text = "\n".join(merge(parse(store_path), parse(local_path)))
    if not text.strip():
        return
    if not text.endswith("\n"):
        text += "\n"
    store_path.parent.mkdir(parents=True, exist_ok=True)
    store_path.write_text(text)
    local_path.write_text(text)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: sync_env.py STORE_PATH LOCAL_PATH", file=sys.stderr)
        return 2
    sync(Path(sys.argv[1]), Path(sys.argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
