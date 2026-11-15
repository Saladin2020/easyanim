/**
 * Render README / preview images: a contact sheet + a key frame per sample, and a GIF of the village intro.
 * Usage: tsx scripts/render-docs.mts [outDir] [workspace] [--full]
 *   no workspace → a temp workspace (placeholder sprites, safe to commit)
 *   --full       → also full-length GIF + MP4 of every sample (preview folders, not the repo)
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { contactSheet, renderPng, renderVideo, writePng } from "../src/lib/render.js";
import { initWorkspace, loadCutscene } from "../src/lib/workspace.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const full = process.argv.includes("--full");
const out = path.resolve(args[0] ?? "docs/assets");
const temp = !args[1];
const ws = args[1] ? path.resolve(args[1]) : mkdtempSync(path.join(os.tmpdir(), "easyanim-docs-"));
if (temp) await initWorkspace(ws);
const KEY: Record<string, number> = { village_morning_delivery: 8.6, raya_open_house: 15.5, loy_krathong_night: 23 };
for (const id of Object.keys(KEY)) {
  const cs = (await loadCutscene(ws, id)).cutscene;
  await writePng(path.join(out, `contact-${id}.png`), await contactSheet(ws, cs, { count: 8, cols: 4, scale: 1 }));
  await writePng(path.join(out, `frame-${id}.png`), await renderPng(ws, cs, KEY[id]!, 2));
  if (full) {
    for (const ext of ["gif", "mp4"]) {
      const r = await renderVideo(ws, cs, path.join(out, `${id}.${ext}`), ext === "gif" ? { scale: 1, fps: 10 } : { scale: 2, fps: 24 });
      console.log(`${r.file} ${r.frames} frames ${(statSync(r.file).size / 1e6).toFixed(2)} MB`);
    }
  }
}
const village = (await loadCutscene(ws, "village_morning_delivery")).cutscene;
const g = await renderVideo(ws, village, path.join(out, "village_morning_delivery-intro.gif"), { scale: 1, fps: 10, from: 0, to: 14 });
console.log(`wrote ${out}: 3 contact sheets, 3 key frames, ${path.basename(g.file)} (${(statSync(g.file).size / 1e6).toFixed(2)} MB)`);
if (temp) rmSync(ws, { recursive: true, force: true });
