import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SAFE_ID, resolveDoc, summary } from "../shared/cutscene.js";
import type { Cutscene, Diagnostic } from "../shared/types.js";
import { EXPORT_PRESETS } from "../shared/types.js";
import { pkgRoot } from "./assets.js";

export const CONFIG_NAME = "easyanim.config.json";
export const DOC_EXT = ".easyanim.json";

export interface EasyAnimConfig {
  name: string;
  /** Default integer scale for GIF / MP4 renders. */
  scale: number;
  /** Frames per second for GIF / MP4 renders. */
  fps: number;
}

export const DEFAULT_CONFIG: EasyAnimConfig = { name: "Easy Anim Workspace", scale: 2, fps: 12 };

export function assertSafeId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  return id;
}

export function resolveWorkspace(dir = process.cwd()): string {
  return path.resolve(dir);
}

export const dirs = (root: string) => ({
  cutscenes: path.join(root, "cutscenes"),
  sprites: path.join(root, "sprites"),
  exports: path.join(root, "exports"),
});

/** Writes outside the workspace must be inside one of these (env, `:`-separated). */
export function allowedRoots(root: string): string[] {
  const extra = (process.env.EASYANIM_ALLOWED_DIRS ?? "").split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  return [path.resolve(root), ...extra];
}

export function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const ok = allowedRoots(root).some((r) => abs === r || abs.startsWith(r + path.sep));
  if (!ok) throw new Error(`Path ${p} is outside the workspace (allow it with EASYANIM_ALLOWED_DIRS)`);
  return abs;
}

const SAMPLES = () => path.join(pkgRoot, "samples", "cutscenes");

export async function initWorkspace(dir = process.cwd(), opts: { force?: boolean } = {}): Promise<string> {
  const root = resolveWorkspace(dir);
  const d = dirs(root);
  for (const p of Object.values(d)) await mkdir(p, { recursive: true });
  const cfg = path.join(root, CONFIG_NAME);
  if (!existsSync(cfg) || opts.force) await writeFile(cfg, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  for (const f of await readdir(SAMPLES())) {
    const dest = path.join(d.cutscenes, f);
    if (!existsSync(dest) || opts.force) await copyFile(path.join(SAMPLES(), f), dest);
  }
  const readme = path.join(d.sprites, "README.txt");
  if (!existsSync(readme))
    await writeFile(
      readme,
      "Drop Easy Sprite native side-view sheets here: <sprite-id>.png (+ optional <sprite-id>.json).\n48px frames, 30 columns, rows right / left / front (easysprite.native, view side).\nActors whose sheet is missing are drawn as a placeholder chibi.\n",
    );
  return root;
}

export async function loadConfig(root: string): Promise<EasyAnimConfig> {
  const f = path.join(root, CONFIG_NAME);
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(await readFile(f, "utf8")) as Partial<EasyAnimConfig>) };
}

export function docPath(root: string, id: string): string {
  return path.join(dirs(root).cutscenes, `${assertSafeId(id, "cutscene id")}${DOC_EXT}`);
}

export async function readDocRaw(root: string, id: string): Promise<unknown | undefined> {
  for (const f of [docPath(root, id), path.join(SAMPLES(), `${id}${DOC_EXT}`)]) if (existsSync(f)) return JSON.parse(await readFile(f, "utf8"));
  return undefined;
}

export interface BrokenDoc {
  id: string;
  file: string;
  errors: Diagnostic[];
}

export interface Listed {
  cutscene: Cutscene;
  source: "sample" | "workspace";
  file: string;
  warnings: Diagnostic[];
}

async function scan(dir: string, source: Listed["source"], out: Map<string, Listed>, broken: BrokenDoc[]) {
  if (!existsSync(dir)) return;
  for (const f of (await readdir(dir)).sort()) {
    if (!f.endsWith(DOC_EXT)) continue;
    const id = f.slice(0, -DOC_EXT.length);
    if (!SAFE_ID.test(id)) continue;
    const file = path.join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      broken.push({ id, file, errors: [{ path: "", message: `invalid JSON: ${(e as Error).message}`, severity: "error" }] });
      continue;
    }
    const r = resolveDoc(id, raw);
    if (r.cutscene) out.set(id, { cutscene: r.cutscene, source, file, warnings: r.warnings });
    else broken.push({ id, file, errors: r.errors });
  }
}

/** Built-in sample cutscenes + workspace cutscenes (a workspace file with a sample's id replaces it). */
export async function listCutscenes(root: string): Promise<{ cutscenes: Listed[]; broken: BrokenDoc[] }> {
  const byId = new Map<string, Listed>();
  const broken: BrokenDoc[] = [];
  await scan(SAMPLES(), "sample", byId, []);
  await scan(dirs(root).cutscenes, "workspace", byId, broken);
  return { cutscenes: [...byId.values()], broken };
}

export async function loadCutscene(root: string, id: string): Promise<Listed> {
  assertSafeId(id, "cutscene id");
  const ws = docPath(root, id);
  const file = existsSync(ws) ? ws : path.join(SAMPLES(), `${id}${DOC_EXT}`);
  if (!existsSync(file)) throw new Error(`Cutscene "${id}" not found (try: easyanim list)`);
  const r = resolveDoc(id, JSON.parse(await readFile(file, "utf8")));
  if (!r.cutscene) throw new Error(`Cutscene "${id}" has ${r.errors.length} error(s):\n${r.errors.slice(0, 8).map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  return { cutscene: r.cutscene, source: file === ws ? "workspace" : "sample", file, warnings: r.warnings };
}

export async function saveCutsceneDoc(root: string, id: string, raw: unknown, opts: { dryRun?: boolean } = {}) {
  const file = docPath(root, id);
  const r = resolveDoc(id, raw);
  if (opts.dryRun || r.errors.length) return { file, saved: false, errors: r.errors, warnings: r.warnings, duration: r.cutscene?.duration };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`);
  return { file, saved: true, errors: r.errors, warnings: r.warnings, duration: r.cutscene?.duration };
}

export async function workspaceSummary(root: string) {
  const { cutscenes, broken } = await listCutscenes(root);
  const spriteDir = dirs(root).sprites;
  const sprites = existsSync(spriteDir) ? (await readdir(spriteDir)).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)) : [];
  return {
    root,
    config: await loadConfig(root),
    ...dirs(root),
    cutscenes: cutscenes.map((c) => ({ ...summary(c.cutscene), source: c.source, warnings: c.warnings.length })),
    broken,
    sprites,
    exportPresets: EXPORT_PRESETS,
  };
}
