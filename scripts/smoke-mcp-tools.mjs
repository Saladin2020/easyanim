/** MCP smoke test: start the server over stdio and over HTTP like a client would and call tools. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyanim-smoke-"));
execFileSync("npx", ["tsx", "src/cli.ts", "init", "--workspace", ws], { stdio: "ignore" });
const fail = (m) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");
const sample = JSON.parse(readFileSync("samples/cutscenes/loy_krathong_night.easyanim.json", "utf8"));

async function exercise(client, label) {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log(`[${label}] tools (${tools.length}):`, tools.join(", "));
  if (tools.length !== 6) fail(`${label}: expected 6 tools`);
  const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
  console.log(`[${label}] cutscenes=${info.cutscenes?.length} sprites=${info.catalog?.sprites?.length} fx=${info.catalog?.fx?.length}`);
  if (!(info.cutscenes?.length >= 3)) fail(`${label}: workspace_info`);
  const list = body(await client.callTool({ name: "list_cutscenes", arguments: {} }));
  console.log(`[${label}] list:`, list.cutscenes?.map((c) => `${c.id} ${c.duration}s`).join(", "));
  const got = body(await client.callTool({ name: "get_cutscene", arguments: { id: "loy_krathong_night", t: 22 } }));
  console.log(`[${label}] loy_krathong_night@22 line=${got.state?.line?.speaker} music=${got.state?.music} fx=${got.state?.fx?.length}`);
  if (!got.state) fail(`${label}: get_cutscene state`);
  const bad = body(await client.callTool({ name: "write_cutscene", arguments: { id: "smoke_bad", doc: { ...sample, en: "Prophet scene" }, dryRun: true } }));
  console.log(`[${label}] dry-run error:`, bad.errors?.[0] && `${bad.errors[0].path}: ${bad.errors[0].message}`);
  if (!bad.errors?.length) fail(`${label}: content rule`);
  const good = body(await client.callTool({ name: "write_cutscene", arguments: { id: `smoke_${label}`, doc: { ...sample, events: sample.events.filter((e) => e.t < 8) } } }));
  if (!good.saved) fail(`${label}: write_cutscene save`);
  const r = await client.callTool({ name: "render_cutscene", arguments: { id: `smoke_${label}`, t: 4 } });
  const img = r.content?.find((c) => c.type === "image");
  console.log(`[${label}] render png bytes:`, img ? Buffer.from(img.data, "base64").length : 0);
  if (!img) fail(`${label}: render_cutscene`);
}

{
  const client = new Client({ name: "smoke", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts", "--workspace", ws], cwd: process.cwd(), env: { ...process.env }, stderr: "ignore" }));
  await exercise(client, "stdio");
  const exp = body(await client.callTool({ name: "export_cutscenes", arguments: { preset: "godot", ids: ["raya_open_house"] } }));
  console.log("[stdio] export godot:", exp.dirs?.map((d) => path.relative(ws, d)).join(", "), "cutscenes", exp.cutscenes?.join(","));
  if (!exp.dirs?.length) fail("stdio: export_cutscenes");
  await client.close();
}

{
  const port = 18869 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["tsx", "src/mcp/server.ts", "--http", "--port", String(port), "--workspace", ws], { stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("MCP HTTP did not start")), 20000);
    proc.stderr.on("data", (d) => {
      if (/listening|http:\/\//i.test(String(d))) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const client = new Client({ name: "smoke-http", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  proc.kill();
}

rmSync(ws, { recursive: true, force: true });
console.log(process.exitCode ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(process.exitCode ?? 0);
