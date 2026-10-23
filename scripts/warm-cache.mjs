#!/usr/bin/env node
// Entry point for `npm run warm-cache`: runs the TypeScript implementation with tsx.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const result = spawnSync(process.execPath, [tsxCli, join(here, "warm-cache.ts")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
