/** CLI smoke test: init a temp workspace, list, check, state, render, new and export through the real CLI. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyanim-cli-"));
const cli = (...args) => execFileSync("npx", ["tsx", "src/cli.ts", ...args, "--workspace", ws], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const magic = (f, m) => existsSync(f) && readFileSync(f).toString("latin1", 0, 8).includes(m);

cli("init");
ok(existsSync(path.join(ws, "sprites", "README.txt")), "init writes sprites/README.txt");
const listed = JSON.parse(cli("list", "--json"));
ok(listed.cutscenes.length === 3 && listed.broken.length === 0, `list: ${listed.cutscenes.length} cutscenes, none broken`);
for (const c of listed.cutscenes) ok(/^ok/m.test(cli("check", c.id)), `check ${c.id}`);
const st = JSON.parse(cli("state", "raya_open_house", "--t", "12"));
ok(Array.isArray(st.actors) && st.actors.length === 5, "state --t returns all actors");

cli("render", "village_morning_delivery", "--out", path.join(ws, "r", "f.png"), "--t", "8");
ok(magic(path.join(ws, "r", "f.png"), "PNG"), "render .png frame");
cli("render", "loy_krathong_night", "--out", path.join(ws, "r", "c.png"), "--contact");
ok(magic(path.join(ws, "r", "c.png"), "PNG"), "render --contact");
const v = cli("render", "raya_open_house", "--out", path.join(ws, "r", "r.gif"), "--from", "4", "--to", "7", "--fps", "8", "--scale", "1");
ok(magic(path.join(ws, "r", "r.gif"), "GIF89a") && /24 frames/.test(v), "render .gif --from --to --fps");
cli("render", "raya_open_house", "--out", path.join(ws, "r", "r.mp4"), "--to", "3");
ok(magic(path.join(ws, "r", "r.mp4"), "ftyp"), "render .mp4");

cli("new", "my_scene", "--backdrop", "river_night", "--th", "ฉากใหม่");
ok(/ok/.test(cli("check", "my_scene")), "new (empty) + check");
cli("new", "my_raya", "--from", "raya_open_house");
ok(/ok/.test(cli("check", "my_raya")), "new --from + check");
writeFileSync(path.join(ws, "cutscenes", "broken.easyanim.json"), JSON.stringify({ format: "easyanim/1", actors: [{ id: "a", sprite: "side_grandma" }], events: [{ t: 0, track: "actor", op: "move", actor: "b", to: [1, 2] }] }));
let errOut = "";
try {
  cli("check", "broken");
} catch (e) {
  errOut = String(e.stdout) + String(e.stderr);
}
ok(/events\[0\]\.actor/.test(errOut), "check reports JSON paths and exits 1");
writeFileSync(path.join(ws, "cutscenes", "broken.easyanim.json"), JSON.stringify({ format: "easyanim/1", actors: [], events: [] }));

cli("export", "village_morning_delivery", "--preset", "all", "--fps", "4");
for (const f of ["exports/easyanim-godot/project.godot", "exports/easyanim-godot/easyanim/cutscene_runner.gd", "exports/easyanim-godot/easyanim/scenes/village_morning_delivery.tscn", "exports/easyanim-godot/easyanim/sprites/side_little_boy.tres", "exports/easyanim-pixi/easyanim-pixi.js", "exports/easyanim-pixi/index.html", "exports/easyanim-video/village_morning_delivery.gif", "exports/easyanim-video/village_morning_delivery.mp4", "exports/easyanim-json/cutscenes/village_morning_delivery.json"]) {
  ok(existsSync(path.join(ws, f)), `export → ${f}`);
}

rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
