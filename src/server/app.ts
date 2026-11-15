import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEV_UI_ORIGINS, checkRequest } from "../shared/requestGuard.js";
import { FX, MUSIC, SFX, SPRITES } from "../shared/catalog.js";
import { resolveDoc, summary } from "../shared/cutscene.js";
import { ANIM_NAMES } from "../shared/sprites.js";
import { BACKDROPS, EASES, FACES, TRACK_OPS } from "../shared/types.js";
import { exportCutscenes } from "../lib/export.js";
import { renderPng } from "../lib/render.js";
import { sheetFor } from "../lib/sheets.js";
import { assertSafeId, listCutscenes, loadCutscene, readDocRaw, resolveInside, saveCutsceneDoc, workspaceSummary } from "../lib/workspace.js";
import type { ExportPreset } from "../shared/types.js";

export interface CreateAppOptions {
  workspaceRoot: string;
  webRoot?: string;
  dev?: boolean;
  host?: string;
  token?: string;
}

const TOKEN_COOKIE = "easyanim_token";
const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

function tokenPage(): string {
  return `<!doctype html><meta charset="utf-8"><title>Easy Anim</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Anim token required</h1>
<p>Paste the token printed in the terminal that started Easy Anim.</p>
<form method="get"><input name="token" autocomplete="off" style="width:22rem"> <button>Open</button></form>
</body>`;
}

const bytes = (buf: Buffer) => new Uint8Array(buf);

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const { workspaceRoot: root, webRoot, dev, host = "127.0.0.1", token } = options;
  const guard = { bindHost: host, token, extraOrigins: dev ? DEV_UI_ORIGINS : [] };

  app.use("*", async (c, next) => {
    const queryToken = c.req.query("token");
    const provided = c.req.header("x-easyanim-token") ?? queryToken ?? getCookie(c, TOKEN_COOKIE);
    const denied = checkRequest(guard, { method: c.req.method, host: c.req.header("host"), origin: c.req.header("origin"), token: provided });
    if (denied) {
      if (denied.status === 401 && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.html(tokenPage(), 401);
      return c.json({ error: denied.error }, denied.status);
    }
    if (token && queryToken) setCookie(c, TOKEN_COOKIE, queryToken, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, workspaceRoot: root }));
  app.get("/api/workspace", async (c) =>
    c.json({ ...(await workspaceSummary(root)), trackOps: TRACK_OPS, anims: ANIM_NAMES, faces: FACES, eases: EASES, backdrops: BACKDROPS, catalog: { sprites: SPRITES, fx: FX, sfx: SFX, music: MUSIC } }),
  );
  app.get("/api/cutscenes", async (c) => {
    const { cutscenes, broken } = await listCutscenes(root);
    return c.json({ cutscenes: cutscenes.map((x) => ({ ...summary(x.cutscene), source: x.source })), broken });
  });

  app.get("/api/cutscenes/:id", async (c) => {
    try {
      const id = assertSafeId(c.req.param("id"), "cutscene id");
      const doc = await readDocRaw(root, id);
      if (doc === undefined) throw new Error(`Cutscene "${id}" not found`);
      const r = resolveDoc(id, doc);
      const source = (await listCutscenes(root)).cutscenes.find((x) => x.cutscene.id === id)?.source ?? "workspace";
      return c.json({ id, doc, source, cutscene: r.cutscene ?? null, errors: r.errors, warnings: r.warnings });
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  app.post("/api/cutscenes/:id", async (c) => {
    try {
      const body = (await c.req.json()) as { doc: unknown; dryRun?: boolean };
      const res = await saveCutsceneDoc(root, c.req.param("id"), body.doc, { dryRun: body.dryRun });
      return c.json({ ok: res.saved, file: res.file, errors: res.errors, warnings: res.warnings, duration: res.duration });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  /** Validate + normalize an unsaved document (the editor evaluates and draws in the browser). */
  app.post("/api/normalize", async (c) => {
    const body = (await c.req.json()) as { id?: string; doc: unknown };
    const r = resolveDoc(body.id && /^[a-z0-9][a-z0-9_-]*$/.test(body.id) ? body.id : "preview", body.doc);
    return c.json({ cutscene: r.cutscene ?? null, errors: r.errors, warnings: r.warnings });
  });

  /** Sheet PNG for a sprite id: the workspace Easy Sprite sheet or the placeholder. */
  app.get("/api/sprites/:sprite", async (c) => {
    try {
      const sprite = assertSafeId(c.req.param("sprite").replace(/\.png$/, ""), "sprite id");
      const colors = Object.fromEntries(["skin", "hair", "top", "bottom"].map((k) => [k, c.req.query(k)]).filter(([, v]) => v && /^#[0-9a-fA-F]{6}$/.test(v)));
      const s = await sheetFor(root, { sprite, colors });
      return c.body(bytes(s.png), 200, { "Content-Type": "image/png", "X-Placeholder": String(s.placeholder), "Cache-Control": "no-store" });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  /** A stage image from the workspace (stage.image). */
  app.get("/api/file", async (c) => {
    try {
      const p = c.req.query("path") ?? "";
      if (!/\.png$/i.test(p)) throw new Error("only .png");
      const f = resolveInside(root, p);
      return c.body(bytes(await readFile(f)), 200, { "Content-Type": "image/png" });
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  app.post("/api/frame", async (c) => {
    try {
      const body = (await c.req.json()) as { id: string; t?: number; scale?: number };
      const cs = (await loadCutscene(root, assertSafeId(body.id, "cutscene id"))).cutscene;
      return c.body(bytes(await renderPng(root, cs, body.t ?? 0, Math.max(1, Math.min(6, Math.round(body.scale ?? 2))))), 200, { "Content-Type": "image/png" });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.post("/api/export", async (c) => {
    try {
      const body = (await c.req.json()) as { ids?: string[]; preset?: ExportPreset; out?: string };
      const res = await exportCutscenes(root, { ids: body.ids?.map((i) => assertSafeId(i, "cutscene id")), preset: body.preset, out: body.out });
      return c.json({ ok: true, ...res, files: res.files.length });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  if (!dev && webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", async (c) => {
      try {
        return c.html((await readFile(path.join(webRoot, "index.html"))).toString("utf8"));
      } catch {
        return c.text("Web UI not built yet. Run npm run build:web or start with --dev.", 503);
      }
    });
  } else if (dev) {
    app.get("/", (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Easy Anim (dev)</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Anim API is running</h1><p>Workspace: <code>${root}</code></p>
<p>Open the Vite UI at <a href="http://127.0.0.1:5182" style="color:#f0c36a">http://127.0.0.1:5182</a></p></body>`),
    );
  }
  return app;
}

export function defaultWebRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web/dist"), path.resolve(here, "../../web/dist")];
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? candidates[1]!;
}
