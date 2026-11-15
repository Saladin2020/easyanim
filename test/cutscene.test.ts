import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, resolveDoc, validateDoc } from "../src/shared/cutscene.js";
import type { CutsceneDoc } from "../src/shared/types.js";

const SAMPLES = readdirSync("samples/cutscenes").map((f) => [f.replace(".easyanim.json", ""), JSON.parse(readFileSync(`samples/cutscenes/${f}`, "utf8")) as CutsceneDoc] as const);

const tiny = (): CutsceneDoc => ({
  format: "easyanim/1",
  actors: [{ id: "ton", sprite: "side_little_boy", x: 0 }],
  events: [
    { t: 0, track: "actor", op: "move", actor: "ton", to: [80, 158] },
    { t: 1, track: "dialogue", op: "line", speaker: "ton", th: "สวัสดีครับ" },
  ],
});

describe("validator", () => {
  it("accepts the three samples with no errors or warnings", () => {
    expect(SAMPLES.map(([id]) => id).sort()).toEqual(["loy_krathong_night", "raya_open_house", "village_morning_delivery"]);
    for (const [id, doc] of SAMPLES) {
      const r = resolveDoc(id, doc);
      expect(r.errors, id).toEqual([]);
      expect(r.warnings, id).toEqual([]);
      expect(r.cutscene!.duration).toBeGreaterThan(25);
    }
  });

  it("reports JSON paths for bad tracks, ops, actors and values", () => {
    const d = tiny() as unknown as { events: unknown[]; actors: unknown[]; stage: unknown };
    d.events.push({ t: 1, track: "camera", op: "dance" });
    d.events.push({ t: 1, track: "actor", op: "anim", actor: "nobody", anim: "moonwalk" });
    d.events.push({ t: -1, track: "screen", op: "fade", to: 2 });
    d.events.push({ t: 2, track: "dialogue", op: "line", speaker: "ton", ref: "not a ref" });
    d.actors.push({ id: "ton", sprite: "side_grandma" });
    d.stage = { backdrop: "moon_base", camera: { zoom: 20 } };
    const paths = validateDoc(d).errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["events[2].op", "events[3].actor", "events[3].anim", "events[4].t", "events[4].to", "events[5].ref", "actors[1].id", "stage.backdrop", "stage.camera.zoom"]));
  });

  it("warns (does not fail) on unknown sibling-tool ids and overlapping moves", () => {
    const d = tiny();
    d.actors[0]!.sprite = "my_own_hero";
    d.events.push({ t: 2, track: "fx", op: "spawn", fx: "my_sparkle", at: [10, 10] }, { t: 2, track: "audio", op: "music", music: "my_song" }, { t: 2, track: "audio", op: "sfx", sfx: "my_blip" });
    d.events.push({ t: 0.5, track: "actor", op: "move", actor: "ton", to: [10, 158], dur: 1 });
    d.events[0] = { ...d.events[0]!, dur: 2 } as never;
    const r = validateDoc(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.path)).toEqual(expect.arrayContaining(["actors[0].sprite", "events[2].fx", "events[3].music", "events[4].sfx", "events[5]"]));
  });

  it("enforces the content rules on cast, stage and titles", () => {
    for (const patch of [
      (d: CutsceneDoc) => (d.actors[0]!.id = "prophet"),
      (d: CutsceneDoc) => (d.actors[0]!.name = { en: "Nabi" }),
      (d: CutsceneDoc) => (d.stage = { image: "quran_wall.png" }),
      (d: CutsceneDoc) => (d.en = "Calligraphy banner scene"),
      (d: CutsceneDoc) => (d.actors[0]!.name = { th: "พระพุทธรูป" }),
    ]) {
      const d = tiny();
      patch(d);
      expect(validateDoc(d).errors.some((e) => /content rule/.test(e.message)), JSON.stringify(d)).toBe(true);
    }
    // ordinary Muslim given names and everyday talk about the mosque are fine
    const ok = tiny();
    ok.actors[0]!.name = { th: "มูฮัมหมัด", en: "Muhammad" };
    (ok.events[1] as { th: string }).th = "เดี๋ยวไปมัสยิดกับวัดนะ";
    expect(validateDoc(ok).errors).toEqual([]);
  });
});

describe("normalize", () => {
  it("fills defaults, sorts events stably and derives durations", () => {
    const d = tiny();
    d.events.unshift({ t: 1, track: "camera", op: "pan", to: [100, 90] });
    const cs = normalize("tiny", d);
    expect(cs.stage).toMatchObject({ width: 320, height: 180, worldWidth: 320, ground: 158, backdrop: "village_morning", camera: { x: 160, y: 90, zoom: 1 } });
    expect(cs.actors[0]).toMatchObject({ y: 158, face: "right", anim: "idle", visible: true });
    expect(cs.events.map((e) => `${e.t}:${e.track}`)).toEqual(["0:actor", "1:camera", "1:dialogue"]);
    expect(cs.events[0]).toMatchObject({ dur: 2, anim: "walk", ease: "linear" }); // 80 px at 40 px/s
    expect(cs.events[1]).toMatchObject({ dur: 1.2, ease: "inOut" });
    expect(cs.events[2]!.dur).toBe(2.2); // 1.6 + 10 chars × 0.06
    expect(cs.duration).toBe(3.2);
  });
});
