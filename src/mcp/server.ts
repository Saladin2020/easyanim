#!/usr/bin/env node
/**
 * Easy Anim MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8869
 *
 * Env: EASYANIM_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "node:http";
import { z } from "zod";
import { checkRequest, resolveToken } from "../shared/requestGuard.js";
import { FX, MUSIC, SFX, SPRITES } from "../shared/catalog.js";
import { summary } from "../shared/cutscene.js";
import { evaluate } from "../shared/evaluate.js";
import { ANIM_NAMES } from "../shared/sprites.js";
import { BACKDROPS, EASES, FACES, FORMAT, TRACK_OPS } from "../shared/types.js";
import { EXPORT_PRESETS, exportCutscenes } from "../lib/export.js";
import { contactSheet, renderPng } from "../lib/render.js";
import { listCutscenes, loadCutscene, readDocRaw, resolveWorkspace, saveCutsceneDoc, workspaceSummary } from "../lib/workspace.js";

export const MCP_TOOL_NAMES = ["workspace_info", "list_cutscenes", "get_cutscene", "write_cutscene", "render_cutscene", "export_cutscenes"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const FORMAT_CHEATSHEET = `Cutscene file cutscenes/<id>.easyanim.json: { format "${FORMAT}", th?, en?, tags?, lang? th|en (which text the box shows),
  stage?: { width 320, height 180, worldWidth, worldHeight, backdrop ${BACKDROPS.join("|")}, image? workspace .png, color, ground 158 (feet line), camera { x, y, zoom } },
  actors: [{ id, sprite (Easy Sprite side sheet id), name? { th, en }, x, y (feet), face ${FACES.join("|")}, anim, visible, colors? (placeholder) }] (≤16),
  events: [{ t (seconds), track, op, … }] }
Tracks and ops (dur in seconds; missing dur gets a default):
  actor:    move { actor, to [x,y], dur? (from walk 40 px/s, run 90, carry 32), anim? walk, ease?, face? } · face { actor, dir } · anim { actor, anim, dur? (0 = keep) } · show / hide { actor }
  camera:   pan { to [x,y] centre, dur?, ease? } · zoom { to 0.25-8, dur?, ease? } · shake { dur?, amp? px }
  dialogue: line { speaker actor id | null (narration), th?, en?, ref? "file.ezd#node" (Easy Dialogue), dur? }
  fx:       spawn { fx (Easy FX id), at [x,y] | actor (+ offset [dx,dy]), dur? }
  audio:    sfx { sfx (Easy SFX id) } · music { music (Easy Music id), fade? } · music_stop { fade? }
  screen:   fade { to 0..1 (1 = covered), dur?, color? } · wait { dur } · wait_input { dur? (preview hold) }
Anims: ${ANIM_NAMES.join(", ")}. Eases: ${EASES.join(", ")}. Moves of one actor should not overlap.
Content rules: actors are ordinary villagers; never depict the Prophet or other sacred figures, never use Quran verses or Arabic calligraphy as decoration; keep the cast and festivals multicultural (Thai, Malay Muslim, Chinese-Thai side by side).`;

function parseArgs(argv: string[]) {
  const out = { http: false, port: 8869, host: "127.0.0.1", workspace: process.env.EASYANIM_WORKSPACE ?? process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--http") out.http = true;
    else if (a === "--port") out.port = Number(argv[++i] ?? out.port);
    else if (a === "--host") out.host = argv[++i] ?? out.host;
    else if (a === "--workspace") out.workspace = argv[++i] ?? out.workspace;
  }
  return out;
}

export function createEasyAnimMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyanim", version: "0.1.0" });

  server.registerTool(
    "workspace_info",
    { title: "Workspace info", description: "Summarize the Easy Anim workspace: cutscenes, sprite sheets present, tracks/ops, anims, backdrops, known Easy Sprite / FX / SFX / Music ids and the format cheat sheet. Call this first.", inputSchema: {} },
    async () => {
      const s = await workspaceSummary(root);
      return text({ name: "easyanim", ...s, trackOps: TRACK_OPS, anims: ANIM_NAMES, backdrops: BACKDROPS, catalog: { sprites: SPRITES, fx: FX, sfx: SFX, music: MUSIC }, format: FORMAT_CHEATSHEET });
    },
  );

  server.registerTool(
    "list_cutscenes",
    { title: "List cutscenes", description: "List sample and workspace cutscenes with duration, actors, backdrop and the music / FX / SFX / dialogue refs they use.", inputSchema: { tag: z.string().optional() } },
    async ({ tag }) => {
      const { cutscenes, broken } = await listCutscenes(root);
      return text({ cutscenes: cutscenes.filter((c) => !tag || c.cutscene.tags.includes(tag)).map((c) => ({ ...summary(c.cutscene), source: c.source, warnings: c.warnings })), broken });
    },
  );

  server.registerTool(
    "get_cutscene",
    { title: "Get cutscene", description: "The cutscene document as written, its normalized form (defaults filled, events sorted) and, with t, the evaluated state at that time.", inputSchema: { id: IdSchema, t: z.number().min(0).optional(), normalized: z.boolean().optional() } },
    async ({ id, t, normalized }) => {
      try {
        const l = await loadCutscene(root, id);
        return text({ ...summary(l.cutscene), source: l.source, warnings: l.warnings, doc: await readDocRaw(root, id), ...(normalized ? { normalized: l.cutscene } : {}), ...(t !== undefined ? { state: evaluate(l.cutscene, t) } : {}) });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "write_cutscene",
    {
      title: "Write cutscene",
      description: `Validate and save cutscenes/<id>.easyanim.json. Errors come back as JSON paths; unknown Easy Sprite / FX / SFX / Music ids are warnings. Use dryRun first.\n${FORMAT_CHEATSHEET}`,
      inputSchema: { id: IdSchema, doc: z.record(z.string(), z.unknown()).describe("The full easyanim/1 document"), dryRun: z.boolean().optional() },
    },
    async ({ id, doc, dryRun }) => {
      try {
        return text(await saveCutsceneDoc(root, id, doc, { dryRun }));
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "render_cutscene",
    { title: "Render cutscene", description: "Render one frame at t (PNG) or, without t, a contact sheet of 8 frames across the cutscene. Returns the image plus the state at t.", inputSchema: { id: IdSchema, t: z.number().min(0).optional(), scale: z.number().int().min(1).max(4).optional() } },
    async ({ id, t, scale }) => {
      try {
        const cs = (await loadCutscene(root, id)).cutscene;
        const png = t === undefined ? await contactSheet(root, cs, { scale: scale ?? 1 }) : await renderPng(root, cs, t, scale ?? 2);
        const meta = t === undefined ? { id, duration: cs.duration, contact: true } : { id, duration: cs.duration, state: evaluate(cs, t) };
        return { content: [{ type: "text" as const, text: JSON.stringify(meta, null, 2) }, { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }] };
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "export_cutscenes",
    {
      title: "Export cutscenes",
      description: "Export: godot (Godot 4.3+ project: cutscene_runner.gd, a .tscn per cutscene, SpriteFrames .tres per sheet, demo + test), pixi (easyanim-pixi.js runner + demo), video (GIF + MP4 + contact sheet), json (normalized timelines), or all.",
      inputSchema: { ids: z.array(IdSchema).optional(), tags: z.array(z.string()).optional(), preset: z.enum(EXPORT_PRESETS).optional(), out: z.string().optional().describe("Workspace-relative output folder (single preset)") },
    },
    async ({ ids, tags, preset, out }) => {
      try {
        const res = await exportCutscenes(root, { ids, tags, preset, out });
        return text({ dirs: res.dirs, cutscenes: res.cutscenes, files: res.files.length, warnings: res.warnings, placeholders: res.placeholders });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  return server;
}

async function startMcp(opts: ReturnType<typeof parseArgs>) {
  const workspace = resolveWorkspace(opts.workspace);
  if (opts.http) return startHttp(workspace, opts.host, opts.port);
  await createEasyAnimMcp(workspace).connect(new StdioServerTransport());
}

async function startHttp(workspace: string, host: string, port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
  const token = resolveToken(host);
  if (token) console.error(`Non-loopback host: send "Authorization: Bearer <token>" — token printed once: ${token}`);
  const httpServer = createServer(async (req, res) => {
    const auth = req.headers.authorization;
    const denied = checkRequest(
      { bindHost: host, token },
      { method: req.method ?? "GET", host: req.headers.host, origin: req.headers.origin, token: auth?.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-easyanim-token"] as string | undefined) },
    );
    if (denied) {
      res.writeHead(denied.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: denied.error }));
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "easyanim", transport: "streamable-http", endpoint: `http://${host}:${port}/mcp`, workspace }));
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      if (req.method === "POST") {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          const mcp = createEasyAnimMcp(workspace);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
              sessions.set(id, transport!);
            },
          });
          transport.onclose = () => {
            const id = transport!.sessionId;
            if (id) sessions.delete(id);
          };
          await mcp.connect(transport);
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing mcp-session-id" }));
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg(e) }));
      }
    }
  });
  httpServer.listen(port, host, () => {
    console.error(`Easy Anim MCP (HTTP) http://${host}:${port}/mcp`);
    console.error(`Workspace ${workspace}`);
  });
}

function entryIndex(): number {
  return process.argv.findIndex((arg) => /(?:^|[/\\])mcp[/\\]server\.(?:ts|js|mjs)$/i.test(arg));
}

if (entryIndex() >= 0) {
  await startMcp(parseArgs(process.argv.slice(entryIndex() + 1)));
}
