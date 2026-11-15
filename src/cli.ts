#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp, defaultWebRoot } from "./server/app.js";
import { resolveToken } from "./shared/requestGuard.js";
import { resolveDoc, summary } from "./shared/cutscene.js";
import { evaluate } from "./shared/evaluate.js";
import { ANIM_NAMES } from "./shared/sprites.js";
import { BACKDROPS, TRACK_OPS } from "./shared/types.js";
import { contactSheet, renderPng, renderVideo, writePng } from "./lib/render.js";
import { EXPORT_PRESETS, exportCutscenes } from "./lib/export.js";
import type { ExportPreset } from "./shared/types.js";
import { assertSafeId, dirs, docPath, initWorkspace, listCutscenes, loadConfig, loadCutscene, readDocRaw, resolveWorkspace, workspaceSummary } from "./lib/workspace.js";

const program = new Command();

function workspaceOf(cli?: string): string {
  const v = cli?.trim() || process.env.EASYANIM_HOME?.trim() || process.env.EASYANIM_WORKSPACE?.trim() || process.cwd();
  return resolveWorkspace(v);
}

const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

program.name("easyanim").description("JSON cutscene timelines (easyanim/1) → previews, Godot 4.3+ cutscene scenes and a PixiJS v8 runner").version("0.1.0");

program
  .command("init")
  .description("Create cutscenes/ sprites/ exports/ with the three sample cutscenes")
  .option("--force", "Overwrite samples and config")
  .option("--workspace <path>", "Workspace directory")
  .action(async (o: { force?: boolean; workspace?: string }) => {
    const root = await initWorkspace(workspaceOf(o.workspace), { force: o.force });
    console.log(`Initialized Easy Anim workspace at ${root}`);
    console.log("  cutscenes/  <id>.easyanim.json timelines");
    console.log("  sprites/    Easy Sprite native side sheets <sprite-id>.png (missing ones render as placeholders)");
    console.log("  exports/    Godot / Pixi / video / JSON exports");
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`Easy Anim workspace ${s.root}`);
    console.log(`  ${s.cutscenes.length} cutscenes · sprites/: ${s.sprites.length ? s.sprites.join(", ") : "(none, placeholders)"}${s.broken.length ? ` · ${s.broken.length} broken: ${s.broken.map((b) => b.id).join(", ")}` : ""}`);
    console.log(`  tracks: ${Object.entries(TRACK_OPS).map(([t, ops]) => `${t} (${ops.join(", ")})`).join(" · ")}`);
    console.log(`  anims: ${ANIM_NAMES.join(", ")} · backdrops: ${BACKDROPS.join(", ")} · export: ${EXPORT_PRESETS.join(", ")}`);
  });

program
  .command("list")
  .description("List sample and workspace cutscenes")
  .option("--tag <tag>")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { tag?: string; workspace?: string; json?: boolean }) => {
    try {
      const { cutscenes, broken } = await listCutscenes(workspaceOf(o.workspace));
      const sel = cutscenes.filter((c) => !o.tag || c.cutscene.tags.includes(o.tag)).map((c) => ({ ...summary(c.cutscene), source: c.source, warnings: c.warnings.length }));
      if (o.json) return console.log(JSON.stringify({ cutscenes: sel, broken }, null, 2));
      for (const s of sel) console.log(`${s.id.padEnd(26)} ${s.duration.toFixed(1).padStart(5)}s ${String(s.events).padStart(3)} events ${String(s.actors.length)} actors ${s.backdrop.padEnd(16)} ${s.source === "workspace" ? "ws " : "   "} ${s.th} · ${s.en}`);
      for (const b of broken) console.log(`${b.id.padEnd(26)} BROKEN ${b.errors[0]?.path}: ${b.errors[0]?.message}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("show")
  .description("Print a cutscene, normalized (every default filled, events sorted)")
  .argument("<id>")
  .option("--workspace <path>")
  .action(async (id: string, o: { workspace?: string }) => {
    try {
      console.log(JSON.stringify((await loadCutscene(workspaceOf(o.workspace), id)).cutscene, null, 2));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("state")
  .description("Print the evaluated state at time t (actors, camera, fade, dialogue, fx, music) as JSON")
  .argument("<id>")
  .requiredOption("--t <seconds>")
  .option("--workspace <path>")
  .action(async (id: string, o: { t: string; workspace?: string }) => {
    try {
      console.log(JSON.stringify(evaluate((await loadCutscene(workspaceOf(o.workspace), id)).cutscene, Number(o.t)), null, 2));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("check")
  .description("Validate a cutscene (id or .easyanim.json path). Exit code 1 on errors")
  .argument("<cutscene>")
  .option("--workspace <path>")
  .option("--json")
  .action(async (arg: string, o: { workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      let raw: unknown;
      let id: string;
      if (arg.endsWith(".json")) {
        raw = JSON.parse(await readFile(arg, "utf8"));
        id = path.basename(arg).replace(/\.easyanim\.json$|\.json$/, "");
      } else {
        id = assertSafeId(arg, "cutscene id");
        raw = await readDocRaw(root, id);
        if (raw === undefined) throw new Error(`Cutscene "${id}" not found`);
      }
      const { errors, warnings, cutscene } = resolveDoc(id, raw);
      if (o.json) console.log(JSON.stringify({ errors, warnings, duration: cutscene?.duration }, null, 2));
      else {
        for (const d of [...errors, ...warnings]) console.error(`${d.severity}: ${d.path}: ${d.message}`);
        if (!errors.length) console.log(`ok  ${cutscene!.duration.toFixed(2)} s · ${cutscene!.events.length} events · ${warnings.length} warnings`);
      }
      if (errors.length) process.exit(1);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("render")
  .description("Render a frame (.png, with --t), a contact sheet (--contact) or the whole cutscene (.gif | .mp4 | .webm)")
  .argument("<id>")
  .requiredOption("--out <file>", ".png | .gif | .mp4 | .webm")
  .option("--t <seconds>", "Time of a single PNG frame", "0")
  .option("--contact", "PNG: 8 frames across the cutscene")
  .option("--scale <n>", "Integer pixel scale")
  .option("--fps <n>", "Video frames per second")
  .option("--from <s>", "Video start time")
  .option("--to <s>", "Video end time")
  .option("--workspace <path>")
  .action(async (id: string, o: { out: string; t: string; contact?: boolean; scale?: string; fps?: string; from?: string; to?: string; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const cfg = await loadConfig(root);
      const { cutscene: cs, warnings } = await loadCutscene(root, id);
      const ext = path.extname(o.out).toLowerCase();
      const scale = o.scale ? Number(o.scale) : cfg.scale;
      if (ext === ".png") {
        await writePng(o.out, o.contact ? await contactSheet(root, cs, { scale: o.scale ? scale : 1 }) : await renderPng(root, cs, Number(o.t), scale));
        console.log(`wrote ${o.out}`);
      } else {
        const r = await renderVideo(root, cs, o.out, { fps: o.fps ? Number(o.fps) : cfg.fps, scale, from: o.from ? Number(o.from) : undefined, to: o.to ? Number(o.to) : undefined });
        console.log(`wrote ${r.file}`);
        console.log(`  ${r.frames} frames · ${r.seconds.toFixed(2)} s · ${r.width}×${r.height}`);
      }
      warnings.forEach((w) => console.log(`  warning: ${w.path}: ${w.message}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("new")
  .description("Create cutscenes/<id>.easyanim.json, copied from a sample or empty")
  .argument("<id>")
  .option("--from <cutscene>", "Sample or workspace cutscene to copy")
  .option("--backdrop <id>", `Empty cutscene backdrop: ${BACKDROPS.join(" | ")}`, "village_morning")
  .option("--th <text>")
  .option("--en <text>")
  .option("--force", "Overwrite an existing file")
  .option("--workspace <path>")
  .action(async (id: string, o: { from?: string; backdrop: string; th?: string; en?: string; force?: boolean; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      assertSafeId(id, "cutscene id");
      const file = docPath(root, id);
      if (existsSync(file) && !o.force) throw new Error(`${file} exists (use --force)`);
      let doc: Record<string, unknown>;
      if (o.from) {
        const raw = await readDocRaw(root, assertSafeId(o.from, "cutscene id"));
        if (raw === undefined) throw new Error(`Unknown cutscene ${o.from} (try: easyanim list)`);
        doc = raw as Record<string, unknown>;
      } else {
        doc = {
          format: "easyanim/1",
          lang: "th",
          stage: { backdrop: o.backdrop },
          actors: [{ id: "hero", sprite: "side_little_boy", name: { th: "ต้น", en: "Ton" }, x: 40 }],
          events: [
            { t: 0, track: "screen", op: "fade", to: 1, dur: 0 },
            { t: 0, track: "screen", op: "fade", to: 0, dur: 1 },
            { t: 0.5, track: "actor", op: "move", actor: "hero", to: [160, 158] },
            { t: 4, track: "dialogue", op: "line", speaker: "hero", th: "สวัสดีครับ", en: "Hello!" },
          ],
        };
      }
      if (o.th) doc.th = o.th;
      if (o.en) doc.en = o.en;
      const r = resolveDoc(id, doc);
      if (r.errors.length) throw new Error(r.errors.map((d) => `${d.path}: ${d.message}`).join("\n"));
      await mkdir(dirs(root).cutscenes, { recursive: true });
      await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`wrote ${file}`);
      r.warnings.forEach((w) => console.log(`  warning: ${w.path}: ${w.message}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("export")
  .description("Export cutscenes: godot | pixi | video | json | all")
  .argument("[ids...]", "Cutscene ids (default: all)")
  .option("--preset <preset>", EXPORT_PRESETS.join(" | "), "all")
  .option("--tag <tags>", "Only these tags (comma-separated)")
  .option("--out <dir>", "Output folder (single preset; default exports/easyanim-<preset>)")
  .option("--fps <n>", "video: frames per second")
  .option("--scale <n>", "video: MP4 scale")
  .option("--workspace <path>")
  .option("--json")
  .action(async (ids: string[], o: { preset: string; tag?: string; out?: string; fps?: string; scale?: string; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const res = await exportCutscenes(root, { ids, preset: o.preset as ExportPreset, tags: list(o.tag), out: o.out, fps: o.fps ? Number(o.fps) : undefined, scale: o.scale ? Number(o.scale) : undefined, trustedPaths: true });
      if (o.json) return console.log(JSON.stringify(res, null, 2));
      for (const d of res.dirs) console.log(`exported ${d}`);
      console.log(`  ${res.cutscenes.length} cutscenes · ${res.files.length} files`);
      res.warnings.forEach((w) => console.log(`  warning: ${w}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("serve")
  .description("Web editor + API (default http://127.0.0.1:8868)")
  .option("--port <port>", "Port", "8868")
  .option("--host <host>", "Interface (non-loopback requires the printed token)", "127.0.0.1")
  .option("--dev", "API only; use the Vite UI on :5182")
  .option("--open", "Open the browser")
  .option("--workspace <path>")
  .action(async (o: { port: string; host: string; dev?: boolean; open?: boolean; workspace?: string }) => {
    const root = workspaceOf(o.workspace);
    if (!existsSync(dirs(root).cutscenes)) await initWorkspace(root);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    const port = Number(o.port);
    serve({ fetch: app.fetch, port, hostname: o.host }, () => {
      const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${port}/`;
      console.log(`Easy Anim ${o.dev ? "API (dev)" : "editor"} → ${url}`);
      console.log(`Workspace ${root}`);
      if (token) console.log(`Token (needed off-loopback): ${url}?token=${token}`);
      if (o.dev) console.log("Run the UI with: npx vite --config web/vite.config.ts");
      if (o.open) void open(o.dev ? "http://127.0.0.1:5182" : url);
    });
  });

program.parseAsync(process.argv).catch(fail);
