import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyAnimMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasyAnimMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});

const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);
const sample = (id: string) => JSON.parse(readFileSync(`samples/cutscenes/${id}.easyanim.json`, "utf8"));

describe("MCP server", () => {
  it("lists the six tools", async () => {
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("writes, renders and exports a cutscene end to end", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.cutscenes.length).toBe(3);
    expect(info.format).toMatch(/never depict the Prophet/);
    expect(info.catalog.music).toContain("raya_open_house");

    const doc = sample("raya_open_house");
    doc.events.push({ t: 2, track: "actor", op: "anim", actor: "ghost", anim: "wave" });
    const bad = body(await client.callTool({ name: "write_cutscene", arguments: { id: "raya_short", doc } }));
    expect(bad.saved).toBe(false);
    expect(bad.errors[0].path).toBe(`events[${doc.events.length - 1}].actor`);

    doc.events.pop();
    doc.events = doc.events.filter((e: { t: number }) => e.t < 10);
    const good = body(await client.callTool({ name: "write_cutscene", arguments: { id: "raya_short", doc } }));
    expect(good.saved).toBe(true);
    const got = body(await client.callTool({ name: "get_cutscene", arguments: { id: "raya_short", t: 6 } }));
    expect(got.source).toBe("workspace");
    expect(got.state.line.speaker).toBe("adam");

    const r = await client.callTool({ name: "render_cutscene", arguments: { id: "raya_short", t: 5 } });
    const content = r.content as Array<{ type: string; mimeType?: string }>;
    expect(content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);

    const ex = body(await client.callTool({ name: "export_cutscenes", arguments: { preset: "json", ids: ["raya_short"] } }));
    expect(ex.cutscenes).toEqual(["raya_short"]);
    const escape = await client.callTool({ name: "export_cutscenes", arguments: { preset: "json", out: "../../outside" } });
    expect((escape as { isError?: boolean }).isError).toBe(true);
  }, 60_000);
});

describe("HTTP API", () => {
  it("serves cutscenes, sheets and frames; blocks cross-origin writes and rebinding", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent" });
    const h = { host: "127.0.0.1:8868" };
    expect((await app.request("/api/health", { headers: h })).status).toBe(200);
    const list = (await (await app.request("/api/cutscenes", { headers: h })).json()) as { cutscenes: unknown[] };
    expect(list.cutscenes.length).toBeGreaterThanOrEqual(3);
    const one = (await (await app.request("/api/cutscenes/loy_krathong_night", { headers: h })).json()) as { cutscene: { duration: number }; errors: unknown[] };
    expect(one.cutscene.duration).toBe(32);
    const sheet = await app.request("/api/sprites/side_grandma.png", { headers: h });
    expect(sheet.headers.get("content-type")).toBe("image/png");
    expect(sheet.headers.get("x-placeholder")).toBe("true");
    const frame = await app.request("/api/frame", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ id: "loy_krathong_night", t: 20 }) });
    expect(frame.headers.get("content-type")).toBe("image/png");
    const save = await app.request("/api/cutscenes/mine", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ doc: sample("loy_krathong_night") }) });
    expect(((await save.json()) as { ok: boolean }).ok).toBe(true);
    expect((await app.request("/api/file?path=../../etc/passwd.png", { headers: h })).status).toBe(404);
    expect((await app.request("/api/cutscenes/..%2F..%2Fetc", { headers: h })).status).toBe(404);
    const cross = await app.request("/api/cutscenes/x", { method: "POST", headers: { ...h, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
    expect((await app.request("/api/cutscenes", { headers: { host: "evil.example:8868" } })).status).toBe(403);
  });
});
