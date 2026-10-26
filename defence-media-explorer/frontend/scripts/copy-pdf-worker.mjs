import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const targetDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, "pdf.worker.min.mjs"));
