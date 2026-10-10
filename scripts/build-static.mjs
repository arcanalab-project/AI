import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
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
    await writeFile(path.join(out, "404.html"), await readFile(index));
    await writeFile(path.join(out, "_redirects"), "/*    /index.html   200\n");
    await writeFile(path.join(out, ".nojekyll"), "");
  }
} finally {
  await restore();
}
