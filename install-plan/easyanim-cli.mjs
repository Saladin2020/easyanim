#!/usr/bin/env node
/**
 * Studio CLI wrapper around Easy Anim (list / render / check / export without MCP).
 *
 * Usage:
 *   node /workspace/indie-studio/tools/easyanim-cli.mjs <command> [options]
 *
 * Install:  EASYANIM_HOME, else this folder's easyanim/
 * The 3 sample cutscenes are built in. Game cutscenes, sprites/ sheets and exports
 * may be written under /workspace/indie-studio/projects/<Name> (pre-allowed).
 * export --out (single preset) writes into that folder without deleting stale files; use a dedicated folder.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.resolve(process.env.EASYANIM_HOME?.trim() || path.join(here, "easyanim"));
const STUDIO_PROJECTS = path.resolve(here, "..", "projects");
const cli = path.join(HOME, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(`Easy Anim CLI not found at ${cli}. Set EASYANIM_HOME and run npm ci && npm run init && npm run build there.`);
  process.exit(1);
}

const env = {
  ...process.env,
  EASYANIM_HOME: HOME,
  EASYANIM_WORKSPACE: process.env.EASYANIM_WORKSPACE?.trim() || HOME,
};
const allowed = new Set(
  (env.EASYANIM_ALLOWED_DIRS ?? "")
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean),
);
allowed.add(STUDIO_PROJECTS);
env.EASYANIM_ALLOWED_DIRS = [...allowed].join(path.delimiter);

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: HOME,
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
