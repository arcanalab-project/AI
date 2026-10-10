import { existsSync } from "node:fs";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const api = path.join(root, "src/app/api");
const parked = path.join(root, ".tin-api-parked");

async function restore() {
  if (existsSync(parked) && !existsSync(api)) {
    await rename(parked, api);
  }
}

async function relativize(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await relativize(full);
      continue;
    }
    if (!/\.(html|js|css|txt|json|map)$/.test(entry.name)) continue;
    let text = await readFile(full, "utf8");
    const next = text
      .replaceAll('"/_next/', '"./_next/')
      .replaceAll("'/_next/", "'./_next/")
      .replaceAll("(/_next/", "(./_next/")
      .replaceAll('"/avatars/', '"./avatars/')
      .replaceAll("'/avatars/", "'./avatars/")
      .replaceAll('"/fonts/', '"./fonts/')
      .replaceAll("'/fonts/", "'./fonts/")
      .replaceAll('href="/favicon', 'href="./favicon')
      .replaceAll('"/favicon.ico', '"./favicon.ico')
      .replaceAll("' /favicon.ico", "'./favicon.ico");
    if (next !== text) await writeFile(full, next);
  }
}

process.env.STATIC_EXPORT = "1";
process.env.NEXT_TELEMETRY_DISABLED = "1";

try {
  if (existsSync(api)) {
    await rename(api, parked);
  }
  const result = spawnSync("npx", ["next", "build", "--turbopack"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`next build failed with status ${result.status}`);
  }
  const out = path.join(root, "out");
  const index = path.join(out, "index.html");
  if (existsSync(index)) {
    await relativize(out);
    await writeFile(path.join(out, "404.html"), await readFile(index));
    await writeFile(path.join(out, "_redirects"), "/*    /index.html   200\n");
    await writeFile(path.join(out, ".nojekyll"), "");
  }
} finally {
  await restore();
}
