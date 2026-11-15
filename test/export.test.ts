import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportCutscenes } from "../src/lib/export.js";
import { decodePng } from "../src/lib/png.js";
import { renderPng } from "../src/lib/render.js";
import { sheetFor } from "../src/lib/sheets.js";
import { loadCutscene } from "../src/lib/workspace.js";
import { drawBackdrop } from "../src/shared/backdrops.js";
import { placeholderColors, placeholderSheet } from "../src/shared/sprites.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup());

describe("assets", () => {
  it("draws placeholder sheets in the Easy Sprite native side layout", async () => {
    const s = placeholderSheet(placeholderColors("side_hijab_teacher"));
    expect([s.width, s.height]).toEqual([1440, 144]);
    // every frame has pixels, and the left row mirrors the right row
    for (let c = 0; c < 30; c++) {
      let n = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) n += s.data[(y * 1440 + c * 48 + x) * 4 + 3]! > 0 ? 1 : 0;
      expect(n, `column ${c}`).toBeGreaterThan(100);
    }
    const px = (x: number, y: number) => s.data[(y * 1440 + x) * 4 + 3];
    expect(px(10, 48 + 30)).toBe(px(47 - 10, 30));
    const info = await sheetFor(root, { sprite: "side_kopiah_boy" });
    expect(info.placeholder).toBe(true);
    expect(decodePng(info.png).width).toBe(1440);
  });

  it("procedural backdrops are deterministic and opaque", () => {
    for (const id of ["village_morning", "raya_house", "river_night", "plain"] as const) {
      const a = drawBackdrop(id, 480, 180, 158);
      const b = drawBackdrop(id, 480, 180, 158);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
      for (let i = 3; i < a.data.length; i += 4 * 97) expect(a.data[i]).toBe(255);
    }
  });

  it("renders frames", async () => {
    const cs = (await loadCutscene(root, "raya_open_house")).cutscene;
    const png = decodePng(await renderPng(root, cs, 9, 2));
    expect([png.width, png.height]).toEqual([640, 360]);
  });
});

describe("export", () => {
  it("writes Godot, Pixi, video and JSON exports", async () => {
    const res = await exportCutscenes(root, { preset: "all", ids: ["village_morning_delivery", "loy_krathong_night"], fps: 6 });
    expect(res.placeholders).toEqual(expect.arrayContaining(["side_little_boy", "side_school_girl"]));
    const g = path.join(root, "exports", "easyanim-godot");
    for (const f of ["project.godot", "main.tscn", "test_anim.gd", "easyanim/cutscene_runner.gd", "easyanim/fonts/Kanit-Regular.ttf", "easyanim/scenes/village_morning_delivery.tscn", "easyanim/sprites/side_hijab_teacher.tres", "easyanim/sprites/side_hijab_teacher.png", "easyanim/backdrops/loy_krathong_night.png", "easyanim/parity.json"]) {
      expect(existsSync(path.join(g, f)), f).toBe(true);
    }
    const tres = readFileSync(path.join(g, "easyanim/sprites/side_grandma.tres"), "utf8");
    expect(tres.match(/type="AtlasTexture"/g)?.length).toBe(90);
    expect(tres).toMatch(/&"right"[\s\S]*&"left"[\s\S]*&"front"/);
    expect(tres).toMatch(/load_steps=92/);
    const tscn = readFileSync(path.join(g, "easyanim/scenes/village_morning_delivery.tscn"), "utf8");
    expect(tscn).toMatch(/\[node name="yai_kaew" type="AnimatedSprite2D" parent="Actors"\]\nposition = Vector2\(480, 158\)/);
    expect(tscn).toMatch(/cutscene_path = "res:\/\/easyanim\/cutscenes\/village_morning_delivery.json"/);
    const json = JSON.parse(readFileSync(path.join(g, "easyanim/cutscenes/loy_krathong_night.json"), "utf8"));
    expect(json.assets.backdrop).toBe("../backdrops/loy_krathong_night.png");
    expect(json.events.every((e: { dur: number }) => typeof e.dur === "number")).toBe(true);

    const p = path.join(root, "exports", "easyanim-pixi");
    for (const f of ["index.html", "easyanim-pixi.js", "easyanim-core.js", "easyanim.json", "cutscenes/village_morning_delivery.json", "sprites/side_market_seller.png"]) expect(existsSync(path.join(p, f)), f).toBe(true);
    const v = path.join(root, "exports", "easyanim-video");
    expect(existsSync(path.join(v, "loy_krathong_night-contact.png"))).toBe(true);
    expect(readFileSync(path.join(v, "loy_krathong_night.gif")).toString("ascii", 0, 6)).toBe("GIF89a");
    expect(existsSync(path.join(v, "village_morning_delivery.mp4"))).toBe(true);
    expect(existsSync(path.join(root, "exports", "easyanim-json", "easyanim.json"))).toBe(true);
  }, 120_000);

  it("uses Easy Sprite sheets from the workspace when present", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { encodePng } = await import("../src/lib/png.js");
    const s = placeholderSheet({ skin: "#000000", hair: "#000000", top: "#ff00ff", bottom: "#000000" });
    await mkdir(path.join(root, "sprites"), { recursive: true });
    await writeFile(path.join(root, "sprites", "side_grandma.png"), encodePng(s.width, s.height, s.data));
    const info = await sheetFor(root, { sprite: "side_grandma" });
    expect(info.placeholder).toBe(false);
    // a wrongly sized sheet falls back to the placeholder
    await writeFile(path.join(root, "sprites", "side_little_boy.png"), encodePng(48, 48, new Uint8Array(48 * 48 * 4)));
    expect((await sheetFor(root, { sprite: "side_little_boy" })).placeholder).toBe(true);
  });

  it("refuses --out outside the workspace", async () => {
    await expect(exportCutscenes(root, { preset: "json", out: "../../outside" })).rejects.toThrow(/outside the workspace/);
  });
});
