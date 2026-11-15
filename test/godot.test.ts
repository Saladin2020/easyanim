/**
 * Optional Godot check: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * (on a box without a GPU: GODOT_ARGS="--rendering-driver opengl3" under xvfb-run)
 * Exports the samples, imports the project headless, runs test_anim.gd, and compares every "P|" state line
 * printed by the GDScript port of evaluate() with the TypeScript evaluator.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportCutscenes } from "../src/lib/export.js";
import { loadCutscene } from "../src/lib/workspace.js";
import { evaluate } from "../src/shared/evaluate.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
const ARGS = (process.env.GODOT_ARGS ?? "").split(" ").filter(Boolean);
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  if (GODOT) ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup?.());

const close = (a: string, b: number, label: string) => expect(Math.abs(Number(a) - b), `${label}: godot ${a} vs ts ${b}`).toBeLessThan(0.0015);

describe.skipIf(!GODOT)("Godot export", () => {
  it("runner parity with TypeScript and real playback", async () => {
    const out = path.join(root, "exports", "godot");
    const ids = ["village_morning_delivery", "raya_open_house", "loy_krathong_night"];
    await exportCutscenes(root, { preset: "godot", out, ids });
    for (let i = 0; i < 2; i++) spawnSync(GODOT!, [...ARGS, "--headless", "--editor", "--quit", "--path", out], { encoding: "utf8", timeout: 180_000 });
    const run = spawnSync(GODOT!, [...ARGS, "--headless", "--path", out, "--script", "res://test_anim.gd"], { encoding: "utf8", timeout: 180_000 });
    expect(run.stderr + run.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
    expect(run.stdout).toMatch(/^EASYANIM OK$/m);
    const lines = run.stdout.split("\n").filter((l) => l.startsWith("P|"));
    expect(lines.length).toBeGreaterThan(150);
    const cs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, (await loadCutscene(root, id)).cutscene] as const)));
    for (const l of lines) {
      const [, id, t, actors, cam, fade, line, fx, music] = l.split("|");
      const s = evaluate(cs[id!]!, Number(t));
      const label = `${id}@${t}`;
      actors!.split(";").forEach((a, i) => {
        const [aid, x, y, face, frame, vis] = a.split(",");
        const ts = s.actors[i]!;
        expect(aid).toBe(ts.id);
        close(x!, ts.x, `${label} ${aid}.x`);
        close(y!, ts.y, `${label} ${aid}.y`);
        expect(`${face} ${frame} ${vis}`, `${label} ${aid}`).toBe(`${ts.face} ${ts.frame} ${ts.visible ? 1 : 0}`);
      });
      const [cx, cy, z, sx, sy] = cam!.split(",");
      close(cx!, s.camera.x, `${label} cam.x`);
      close(cy!, s.camera.y, `${label} cam.y`);
      close(z!, s.camera.zoom, `${label} zoom`);
      close(sx!, s.camera.sx, `${label} shake.x`);
      close(sy!, s.camera.sy, `${label} shake.y`);
      const [fa, fc] = fade!.split(",");
      close(fa!, s.fade.a, `${label} fade`);
      expect(fc).toBe(s.fade.color);
      expect(line, `${label} line`).toBe(s.line ? `${s.line.i}:${s.line.shown}` : "-");
      expect(fx, `${label} fx`).toBe(s.fx.map((f) => `${f.i}:${f.x.toFixed(3)}:${f.y.toFixed(3)}`).join(";"));
      expect(music, `${label} music`).toBe(s.music ?? "-");
    }
    expect(run.stdout.match(/^R\|.*finished=true$/gm)?.length).toBe(ids.length);
    const main = spawnSync(GODOT!, [...ARGS, "--headless", "--path", out, "--quit-after", "120"], { encoding: "utf8", timeout: 120_000 });
    expect(main.stderr + main.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
  }, 600_000);
});
