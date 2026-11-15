import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/shared/cutscene.js";
import { evaluate, frameOf, safeCount } from "../src/shared/evaluate.js";
import { parityTimes } from "../src/lib/export.js";
import type { CutsceneDoc } from "../src/shared/types.js";
// the Pixi runner's evaluator, bundled from src/shared by scripts/build-core.mjs
import * as core from "../runtime/web/easyanim-core.js";

const load = (id: string) => normalize(id, JSON.parse(readFileSync(`samples/cutscenes/${id}.easyanim.json`, "utf8")) as CutsceneDoc);
const IDS = ["village_morning_delivery", "raya_open_house", "loy_krathong_night"];

describe("evaluate", () => {
  const cs = load("village_morning_delivery");

  it("walks, carries and faces the actor along a move", () => {
    const at = (t: number) => evaluate(cs, t).actors.find((a) => a.id === "ton")!;
    expect(at(0)).toMatchObject({ x: 20, y: 158, face: "right", anim: "idle", frame: "idle" });
    const mid = at(1.5);
    expect(mid.anim).toBe("walk");
    expect(mid.x).toBeGreaterThan(20);
    expect(mid.x).toBeLessThan(104);
    expect(at(3)).toMatchObject({ x: 104, anim: "idle" });
    expect(at(9).anim).toBe("carry");
    expect(at(13.2)).toMatchObject({ x: 380, anim: "idle" });
    expect(evaluate(cs, 12).actors.find((a) => a.id === "kru_aisyah")!.face).toBe("left");
  });

  it("fades, pans, zooms and keeps the camera inside the world", () => {
    expect(evaluate(cs, 0).fade.a).toBe(1);
    expect(evaluate(cs, 0.6).fade.a).toBeCloseTo(0.5, 5);
    expect(evaluate(cs, 1.3).fade.a).toBe(0);
    expect(evaluate(cs, 13.1).camera.x).toBe(400); // max for a 560 px world, 320 px view
    const z = evaluate(cs, 26).camera;
    expect(z.zoom).toBe(1.5);
    expect(z.y).toBeLessThanOrEqual(180 - 60);
    expect(evaluate(cs, 28.5).fade.a).toBe(1);
  });

  it("types dialogue out Thai-safe and tracks music and fx", () => {
    const s = evaluate(cs, 2.8);
    expect(s.line).toMatchObject({ speaker: "pa_daeng", name: "ป้าแดง", ref: "village_delivery.ezd#market" });
    expect(s.line!.shown).toBeGreaterThan(0);
    expect(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/u.test(s.line!.text[s.line!.shown] ?? "")).toBe(false);
    expect(evaluate(cs, 6).music).toBe("village_day");
    expect(evaluate(cs, 28).music).toBeNull();
    const fx = evaluate(cs, 7.5).fx.find((f) => f.fx === "sparkle_shine")!;
    expect(fx.x).toBe(104 + 8);
    expect(fx.y).toBe(158 - 30);
  });

  it("never splits a Thai vowel or tone mark from its consonant", () => {
    const text = "ที่นี่มีน้ำ แล้วไปไหน";
    for (let n = 0; n <= text.length; n++) {
      const c = safeCount(text, n);
      expect(c).toBeGreaterThanOrEqual(n);
      if (c < text.length) expect(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/u.test(text[c]!)).toBe(false);
      if (c > 0 && c < text.length) expect(/[\u0e40-\u0e44]/u.test(text[c - 1]!)).toBe(false);
    }
  });

  it("loops walk frames and holds one-shot anims on their last frame", () => {
    expect([0, 0.125, 0.25, 0.375, 0.5].map((t) => frameOf("walk", 0, t))).toEqual(["walk0", "walk1", "walk2", "walk1", "walk0"]);
    expect(frameOf("jump", 0, 5)).toBe("jump1");
  });

  it("the bundled Pixi core matches the TypeScript evaluator", () => {
    for (const id of IDS) {
      const c = load(id);
      for (const t of parityTimes(c)) expect(core.evaluate(c, t)).toEqual(evaluate(c, t));
    }
  });
});
