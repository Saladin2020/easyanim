/** Validate and normalize `easyanim/1` documents. */
import { FX, MUSIC, SFX, SPRITES } from "./catalog.js";
import { ANIMS } from "./sprites.js";
import { BACKDROPS, EASES, FACES, FORMAT, TRACK_OPS } from "./types.js";
import type { Actor, Cutscene, CutsceneDoc, Diagnostic, NormalEvent, Stage, Track } from "./types.js";

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
/** Dialogue references: an Easy Dialogue file and node, e.g. `village_delivery.ezd#market`. */
export const DIALOGUE_REF = /^[A-Za-z0-9_./-]+\.ezd(#[A-Za-z0-9_-]+)?$/;

/**
 * Content rules: no depiction of the Prophet or other sacred figures and no Quran or Arabic calligraphy as
 * decoration. Checked on actor ids, sprite ids and names, the stage image / backdrop, titles and tags (not on
 * dialogue text, where people may talk about their day at the mosque or temple).
 */
export const FORBIDDEN = /(^|[^a-z])(prophet|nabi|rasul|rasulullah|quran|qur'an|koran|calligraphy|khat|ayat|deity|idol|buddha_image|buddha image)([^a-z]|$)|ศาสดา|นบี|อัลกุรอาน|พระพุทธรูป|อักษรวิจิตร/i;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isColor = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const r2 = (v: number) => Math.round(v * 100) / 100;

export const SPEED: Record<string, number> = { walk: 40, run: 90, carry: 32, tired: 24 };

export function defaultStage(s: Partial<Stage> = {}): Stage {
  const width = s.width ?? 320;
  const height = s.height ?? 180;
  return {
    width,
    height,
    worldWidth: Math.max(width, s.worldWidth ?? width),
    worldHeight: Math.max(height, s.worldHeight ?? height),
    backdrop: s.backdrop ?? "village_morning",
    ...(s.image ? { image: s.image } : {}),
    color: s.color ?? "#2e2014",
    ground: s.ground ?? height - 22,
    camera: { x: s.camera?.x ?? width / 2, y: s.camera?.y ?? height / 2, zoom: s.camera?.zoom ?? 1 },
  };
}

/** Validate a raw document. Errors block normalize/save; warnings (unknown sibling-tool ids, overlaps) don't. */
export function validateDoc(raw: unknown): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const err = (path: string, message: string) => errors.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) => warnings.push({ path, message, severity: "warning" });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    err("", "expected a JSON object");
    return { errors, warnings };
  }
  const d = raw as Record<string, unknown>;
  if (d.format !== FORMAT) err("format", `must be "${FORMAT}"`);
  for (const k of ["th", "en"]) {
    if (d[k] !== undefined && typeof d[k] !== "string") err(k, "must be a string");
    if (typeof d[k] === "string" && FORBIDDEN.test(d[k] as string)) err(k, "content rule: no depiction of the Prophet or sacred figures, no Quran or calligraphy decoration");
  }
  if (d.lang !== undefined && d.lang !== "th" && d.lang !== "en") err("lang", 'must be "th" or "en"');
  if (d.tags !== undefined && (!Array.isArray(d.tags) || d.tags.some((x) => typeof x !== "string"))) err("tags", "must be an array of strings");
  else if (Array.isArray(d.tags) && d.tags.some((x) => FORBIDDEN.test(String(x)))) err("tags", "content rule: forbidden tag");

  // stage
  const s = (d.stage ?? {}) as Record<string, unknown>;
  if (d.stage !== undefined && (typeof d.stage !== "object" || Array.isArray(d.stage))) err("stage", "must be an object");
  for (const k of ["width", "height"]) if (s[k] !== undefined && (!isNum(s[k]) || (s[k] as number) < 64 || (s[k] as number) > 1920)) err(`stage.${k}`, "must be a number 64..1920");
  for (const k of ["worldWidth", "worldHeight", "ground"]) if (s[k] !== undefined && (!isNum(s[k]) || (s[k] as number) < 0 || (s[k] as number) > 8192)) err(`stage.${k}`, "must be a number 0..8192");
  if (s.backdrop !== undefined && !(BACKDROPS as readonly string[]).includes(s.backdrop as string)) err("stage.backdrop", `must be one of ${BACKDROPS.join(", ")}`);
  if (s.image !== undefined && (typeof s.image !== "string" || !/^[A-Za-z0-9_./-]+\.png$/.test(s.image) || s.image.includes(".."))) err("stage.image", "must be a workspace-relative .png path");
  if (typeof s.image === "string" && FORBIDDEN.test(s.image)) err("stage.image", "content rule: no Quran or calligraphy decoration, no sacred figures");
  if (s.color !== undefined && !isColor(s.color)) err("stage.color", "must be #rrggbb");
  if (s.camera !== undefined) {
    const c = s.camera as Record<string, unknown>;
    if (typeof c !== "object" || !c) err("stage.camera", "must be an object");
    else {
      if (c.x !== undefined && !isNum(c.x)) err("stage.camera.x", "must be a number");
      if (c.y !== undefined && !isNum(c.y)) err("stage.camera.y", "must be a number");
      if (c.zoom !== undefined && (!isNum(c.zoom) || c.zoom < 0.25 || c.zoom > 8)) err("stage.camera.zoom", "must be 0.25..8");
    }
  }

  // actors
  const ids = new Set<string>();
  if (!Array.isArray(d.actors)) err("actors", "must be an array");
  else {
    if (d.actors.length > 16) err("actors", "at most 16 actors");
    d.actors.forEach((a: unknown, i: number) => {
      const p = `actors[${i}]`;
      if (!a || typeof a !== "object") return err(p, "must be an object");
      const x = a as Record<string, unknown>;
      if (typeof x.id !== "string" || !SAFE_ID.test(x.id)) err(`${p}.id`, "must match ^[a-z0-9][a-z0-9_-]*$");
      else if (ids.has(x.id)) err(`${p}.id`, `duplicate actor id "${x.id}"`);
      else ids.add(x.id);
      if (typeof x.sprite !== "string" || !SAFE_ID.test(x.sprite)) err(`${p}.sprite`, "must be an Easy Sprite sheet id (a-z0-9_-)");
      else if (!(SPRITES as readonly string[]).includes(x.sprite)) warn(`${p}.sprite`, `"${x.sprite}" is not a known Easy Sprite side sheet; put sprites/${x.sprite}.png in the workspace or a placeholder is drawn`);
      const names = [x.id, x.sprite, (x.name as Record<string, unknown> | undefined)?.th, (x.name as Record<string, unknown> | undefined)?.en];
      if (names.some((n) => typeof n === "string" && FORBIDDEN.test(n))) err(p, "content rule: actors are ordinary villagers; no depiction of the Prophet or sacred figures");
      if (x.name !== undefined && (typeof x.name !== "object" || !x.name)) err(`${p}.name`, "must be { th?, en? }");
      for (const k of ["x", "y"]) if (x[k] !== undefined && !isNum(x[k])) err(`${p}.${k}`, "must be a number");
      if (x.face !== undefined && !(FACES as readonly string[]).includes(x.face as string)) err(`${p}.face`, `must be ${FACES.join(" | ")}`);
      if (x.anim !== undefined && !ANIMS[x.anim as string]) err(`${p}.anim`, `unknown anim; use ${Object.keys(ANIMS).join(", ")}`);
      if (x.visible !== undefined && typeof x.visible !== "boolean") err(`${p}.visible`, "must be true or false");
      if (x.colors !== undefined) {
        const c = x.colors as Record<string, unknown>;
        for (const [k, v] of Object.entries(c ?? {})) if (!isColor(v)) err(`${p}.colors.${k}`, "must be #rrggbb");
      }
    });
  }

  // events
  if (!Array.isArray(d.events)) err("events", "must be an array");
  else {
    if (d.events.length > 2000) err("events", "at most 2000 events");
    d.events.forEach((e: unknown, i: number) => {
      const p = `events[${i}]`;
      if (!e || typeof e !== "object") return err(p, "must be an object");
      const ev = e as Record<string, unknown>;
      const track = ev.track as Track;
      if (!(track in TRACK_OPS)) return err(`${p}.track`, `must be one of ${Object.keys(TRACK_OPS).join(", ")}`);
      if (!(TRACK_OPS[track] as readonly string[]).includes(ev.op as string)) return err(`${p}.op`, `track "${track}" takes ${TRACK_OPS[track].join(", ")}`);
      if (!isNum(ev.t) || ev.t < 0 || ev.t > 3600) err(`${p}.t`, "must be seconds 0..3600");
      if (ev.dur !== undefined && (!isNum(ev.dur) || ev.dur < 0 || ev.dur > 600)) err(`${p}.dur`, "must be seconds 0..600");
      if (ev.ease !== undefined && !(EASES as readonly string[]).includes(ev.ease as string)) err(`${p}.ease`, `must be ${EASES.join(" | ")}`);
      const needActor = () => {
        if (typeof ev.actor !== "string" || !ids.has(ev.actor)) err(`${p}.actor`, `unknown actor ${JSON.stringify(ev.actor)}`);
      };
      switch (`${track}.${ev.op}`) {
        case "actor.move":
          needActor();
          if (!isVec(ev.to)) err(`${p}.to`, "must be [x, y]");
          if (ev.anim !== undefined && !ANIMS[ev.anim as string]) err(`${p}.anim`, "unknown anim");
          if (ev.face !== undefined && !(FACES as readonly string[]).includes(ev.face as string)) err(`${p}.face`, `must be ${FACES.join(" | ")}`);
          break;
        case "actor.face":
          needActor();
          if (!(FACES as readonly string[]).includes(ev.dir as string)) err(`${p}.dir`, `must be ${FACES.join(" | ")}`);
          break;
        case "actor.anim":
          needActor();
          if (!ANIMS[ev.anim as string]) err(`${p}.anim`, `unknown anim; use ${Object.keys(ANIMS).join(", ")}`);
          break;
        case "actor.show":
        case "actor.hide":
          needActor();
          break;
        case "camera.pan":
          if (!isVec(ev.to)) err(`${p}.to`, "must be [x, y] (camera centre in world pixels)");
          break;
        case "camera.zoom":
          if (!isNum(ev.to) || ev.to < 0.25 || ev.to > 8) err(`${p}.to`, "must be a zoom 0.25..8");
          break;
        case "camera.shake":
          if (ev.amp !== undefined && (!isNum(ev.amp) || ev.amp < 0 || ev.amp > 32)) err(`${p}.amp`, "must be 0..32 px");
          break;
        case "dialogue.line":
          if (ev.speaker !== undefined && ev.speaker !== null && (typeof ev.speaker !== "string" || !ids.has(ev.speaker))) err(`${p}.speaker`, `unknown actor ${JSON.stringify(ev.speaker)} (use null for narration)`);
          for (const k of ["th", "en"]) if (ev[k] !== undefined && (typeof ev[k] !== "string" || (ev[k] as string).length > 400)) err(`${p}.${k}`, "must be a string up to 400 characters");
          if (ev.th === undefined && ev.en === undefined && ev.ref === undefined) err(p, "a line needs th, en or an Easy Dialogue ref");
          if (ev.ref !== undefined && (typeof ev.ref !== "string" || !DIALOGUE_REF.test(ev.ref))) err(`${p}.ref`, 'must look like "file.ezd#node"');
          break;
        case "fx.spawn":
          if (typeof ev.fx !== "string" || !SAFE_ID.test(ev.fx)) err(`${p}.fx`, "must be an Easy FX id");
          else if (!(FX as readonly string[]).includes(ev.fx)) warn(`${p}.fx`, `"${ev.fx}" is not a built-in Easy FX preset`);
          if (ev.at === undefined && ev.actor === undefined) err(p, "needs at: [x, y] or actor");
          if (ev.at !== undefined && !isVec(ev.at)) err(`${p}.at`, "must be [x, y]");
          if (ev.actor !== undefined) needActor();
          if (ev.offset !== undefined && !isVec(ev.offset)) err(`${p}.offset`, "must be [dx, dy]");
          break;
        case "audio.sfx":
          if (typeof ev.sfx !== "string" || !SAFE_ID.test(ev.sfx)) err(`${p}.sfx`, "must be an Easy SFX id");
          else if (!(SFX as readonly string[]).includes(ev.sfx)) warn(`${p}.sfx`, `"${ev.sfx}" is not in the Easy SFX village bank`);
          break;
        case "audio.music":
          if (typeof ev.music !== "string" || !SAFE_ID.test(ev.music)) err(`${p}.music`, "must be an Easy Music id");
          else if (!(MUSIC as readonly string[]).includes(ev.music)) warn(`${p}.music`, `"${ev.music}" is not an Easy Music preset`);
          if (ev.fade !== undefined && (!isNum(ev.fade) || ev.fade < 0 || ev.fade > 10)) err(`${p}.fade`, "must be 0..10 s");
          break;
        case "audio.music_stop":
          if (ev.fade !== undefined && (!isNum(ev.fade) || ev.fade < 0 || ev.fade > 10)) err(`${p}.fade`, "must be 0..10 s");
          break;
        case "screen.fade":
          if (!isNum(ev.to) || ev.to < 0 || ev.to > 1) err(`${p}.to`, "must be 0 (clear) .. 1 (covered)");
          if (ev.color !== undefined && !isColor(ev.color)) err(`${p}.color`, "must be #rrggbb");
          break;
        case "screen.wait":
          if (!isNum(ev.dur)) err(`${p}.dur`, "wait needs dur");
          break;
      }
    });
    // overlapping moves of one actor
    const moves = (d.events as Array<Record<string, unknown>>).map((e, i) => ({ e, i })).filter(({ e }) => e && e.track === "actor" && e.op === "move" && isNum(e.t) && isNum(e.dur));
    for (const a of moves) for (const b of moves) {
      if (a.i < b.i && a.e.actor === b.e.actor && (b.e.t as number) < (a.e.t as number) + (a.e.dur as number) && (a.e.t as number) < (b.e.t as number) + (b.e.dur as number)) {
        warn(`events[${b.i}]`, `move overlaps events[${a.i}] for actor "${String(a.e.actor)}"`);
      }
    }
  }
  return { errors, warnings };
}

/** Fill every default, sort events by time (stable) and make every duration explicit. */
export function normalize(id: string, doc: CutsceneDoc): Cutscene {
  const stage = defaultStage(doc.stage);
  const lang = doc.lang ?? "th";
  const actors: Actor[] = doc.actors.map((a) => ({
    id: a.id,
    sprite: a.sprite,
    ...(a.name ? { name: a.name } : {}),
    ...(a.colors ? { colors: a.colors } : {}),
    x: a.x ?? 40,
    y: a.y ?? stage.ground,
    face: a.face ?? "right",
    anim: a.anim ?? "idle",
    visible: a.visible ?? true,
  }));
  const pos = new Map(actors.map((a) => [a.id, [a.x, a.y] as [number, number]]));
  const sorted = doc.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  const events: NormalEvent[] = sorted.map(({ e, i }) => {
    const ev = { ...(e as unknown as Record<string, unknown>) };
    delete ev.note;
    let dur = isNum(ev.dur) ? (ev.dur as number) : 0;
    switch (`${e.track}.${e.op}`) {
      case "actor.move": {
        const from = pos.get(ev.actor as string) ?? [0, 0];
        const to = ev.to as [number, number];
        ev.anim = ev.anim ?? "walk";
        ev.ease = ev.ease ?? "linear";
        if (!isNum(ev.dur)) dur = r2(Math.max(0.1, Math.hypot(to[0] - from[0], to[1] - from[1]) / (SPEED[ev.anim as string] ?? 40)));
        pos.set(ev.actor as string, [to[0], to[1]]);
        break;
      }
      case "camera.pan":
        if (!isNum(ev.dur)) dur = 1.2;
        ev.ease = ev.ease ?? "inOut";
        break;
      case "camera.zoom":
        if (!isNum(ev.dur)) dur = 1;
        ev.ease = ev.ease ?? "inOut";
        break;
      case "camera.shake":
        if (!isNum(ev.dur)) dur = 0.4;
        ev.amp = ev.amp ?? 3;
        break;
      case "dialogue.line": {
        const text = String((lang === "th" ? (ev.th ?? ev.en) : (ev.en ?? ev.th)) ?? "");
        if (!isNum(ev.dur)) dur = Math.round(Math.max(2, Math.min(7, 1.6 + text.length * 0.06)) * 10) / 10;
        ev.speaker = ev.speaker ?? null;
        break;
      }
      case "fx.spawn":
        if (!isNum(ev.dur)) dur = 1.2;
        ev.offset = ev.offset ?? (ev.actor !== undefined && ev.at === undefined ? [0, -20] : [0, 0]);
        break;
      case "audio.music":
      case "audio.music_stop":
        ev.fade = ev.fade ?? 1;
        dur = 0;
        break;
      case "screen.fade":
        if (!isNum(ev.dur)) dur = 0.6;
        ev.color = ev.color ?? "#000000";
        break;
      case "screen.wait_input":
        if (!isNum(ev.dur)) dur = 0.5;
        break;
      case "actor.face":
      case "actor.show":
      case "actor.hide":
      case "audio.sfx":
        dur = 0;
        break;
    }
    return { ...ev, i, t: e.t, dur, track: e.track, op: e.op } as NormalEvent;
  });
  const duration = r2(Math.max(0.5, ...events.map((e) => e.t + e.dur)));
  return { format: FORMAT, id, th: doc.th ?? id, en: doc.en ?? id, tags: doc.tags ?? [], lang, duration, stage, actors, events };
}

export function resolveDoc(id: string, raw: unknown): { cutscene?: Cutscene; errors: Diagnostic[]; warnings: Diagnostic[] } {
  const v = validateDoc(raw);
  if (v.errors.length) return v;
  return { ...v, cutscene: normalize(id, raw as CutsceneDoc) };
}

export function summary(cs: Cutscene) {
  const tracks: Record<string, number> = {};
  for (const e of cs.events) tracks[e.track] = (tracks[e.track] ?? 0) + 1;
  return {
    id: cs.id,
    th: cs.th,
    en: cs.en,
    tags: cs.tags,
    duration: cs.duration,
    backdrop: cs.stage.image ?? cs.stage.backdrop,
    size: `${cs.stage.width}x${cs.stage.height}`,
    actors: cs.actors.map((a) => `${a.id}:${a.sprite}`),
    events: cs.events.length,
    tracks,
    music: [...new Set(cs.events.filter((e) => e.op === "music").map((e) => e.music as string))],
    fx: [...new Set(cs.events.filter((e) => e.op === "spawn").map((e) => e.fx as string))],
    sfx: [...new Set(cs.events.filter((e) => e.op === "sfx").map((e) => e.sfx as string))],
    dialogueRefs: [...new Set(cs.events.filter((e) => typeof e.ref === "string").map((e) => e.ref as string))],
  };
}
