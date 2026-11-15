/**
 * Pure cutscene evaluation: the state of a normalized cutscene at time t. Same maths in the editor, the CLI
 * renderer, `easyanim-core.js` (Pixi runner, bundled from this file) and `cutscene_runner.gd` (hand-ported;
 * the Godot test checks parity).
 */
import { ANIMS } from "./sprites.js";
import type { Cutscene, Face, NormalEvent } from "./types.js";

/** Typewriter speed for dialogue lines (characters per second). */
export const CPS = 28;

export interface ActorState {
  id: string;
  x: number;
  y: number;
  face: Face;
  anim: string;
  /** Frame column name (e.g. walk1) and index into the native sheet. */
  frame: string;
  visible: boolean;
}

export interface LineState {
  i: number;
  speaker: string | null;
  name: string;
  text: string;
  /** Characters revealed so far (never splits a Thai vowel or tone mark from its consonant). */
  shown: number;
  ref: string | null;
  done: boolean;
}

export interface FxState {
  i: number;
  fx: string;
  x: number;
  y: number;
  age: number;
  dur: number;
}

export interface FrameState {
  t: number;
  actors: ActorState[];
  camera: { x: number; y: number; zoom: number; sx: number; sy: number };
  fade: { a: number; color: string };
  line: LineState | null;
  fx: FxState[];
  music: string | null;
}

export function ease(kind: unknown, k: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  if (kind === "in") return k * k;
  if (kind === "out") return 1 - (1 - k) * (1 - k);
  if (kind === "inOut") return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
  return k;
}

const progress = (ev: NormalEvent, t: number) => (ev.dur > 0 ? Math.min(1, (t - ev.t) / ev.dur) : 1);

/** Thai combining marks (above / below vowels, tone marks) must stay with the consonant before them. */
export function isThaiCombining(code: number): boolean {
  return code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
}

/** Leading vowels (เ แ โ ใ ไ) are written before their consonant: reveal them together. */
export function isThaiLeading(code: number): boolean {
  return code >= 0x0e40 && code <= 0x0e44;
}

export function safeCount(text: string, n: number): number {
  let c = Math.max(0, Math.min(text.length, n));
  if (c > 0 && c < text.length && isThaiLeading(text.charCodeAt(c - 1))) c++;
  while (c < text.length && c > 0 && isThaiCombining(text.charCodeAt(c))) c++;
  return c;
}

interface Work {
  id: string;
  x: number;
  y: number;
  face: Face;
  anim: string;
  start: number;
  rest: string;
  visible: boolean;
}

export function frameOf(anim: string, start: number, t: number): string {
  const a = ANIMS[anim] ?? ANIMS.idle!;
  const n = Math.floor((t - start) * a.fps + 1e-6);
  const len = a.frames.length;
  const idx = a.loop ? ((n % len) + len) % len : Math.max(0, Math.min(n, len - 1));
  return a.frames[idx]!;
}

export function actorsAt(cs: Cutscene, t: number): ActorState[] {
  const work = new Map<string, Work>();
  for (const a of cs.actors) work.set(a.id, { id: a.id, x: a.x, y: a.y, face: a.face, anim: a.anim, start: 0, rest: a.anim, visible: a.visible });
  for (const ev of cs.events) {
    if (ev.t > t) break;
    if (ev.track !== "actor") continue;
    const a = work.get(ev.actor as string);
    if (!a) continue;
    if (ev.op === "move") {
      const to = ev.to as [number, number];
      const k = progress(ev, t);
      const e = ease(ev.ease, k);
      if (typeof ev.face === "string") a.face = ev.face as Face;
      else if (to[0] > a.x) a.face = "right";
      else if (to[0] < a.x) a.face = "left";
      a.x = a.x + (to[0] - a.x) * e;
      a.y = a.y + (to[1] - a.y) * e;
      if (k < 1) {
        a.anim = ev.anim as string;
        a.start = ev.t;
      } else {
        a.anim = a.rest;
        a.start = ev.t + ev.dur;
      }
    } else if (ev.op === "face") {
      a.face = ev.dir as Face;
    } else if (ev.op === "anim") {
      if (ev.dur > 0) {
        if (t < ev.t + ev.dur) {
          a.anim = ev.anim as string;
          a.start = ev.t;
        } else {
          a.anim = a.rest;
          a.start = ev.t + ev.dur;
        }
      } else {
        a.anim = ev.anim as string;
        a.rest = ev.anim as string;
        a.start = ev.t;
      }
    } else if (ev.op === "show") a.visible = true;
    else if (ev.op === "hide") a.visible = false;
  }
  return [...work.values()].map((a) => ({ id: a.id, x: a.x, y: a.y, face: a.face, anim: a.anim, frame: frameOf(a.anim, a.start, t), visible: a.visible }));
}

export function evaluate(cs: Cutscene, t: number): FrameState {
  const st = cs.stage;
  const cam = { x: st.camera.x, y: st.camera.y, zoom: st.camera.zoom, sx: 0, sy: 0 };
  const fade = { a: 0, color: "#000000" };
  let line: LineState | null = null;
  const fx: FxState[] = [];
  let music: string | null = null;
  for (const ev of cs.events) {
    if (ev.t > t) break;
    const k = progress(ev, t);
    if (ev.track === "camera") {
      if (ev.op === "pan") {
        const to = ev.to as [number, number];
        const e = ease(ev.ease, k);
        cam.x = cam.x + (to[0] - cam.x) * e;
        cam.y = cam.y + (to[1] - cam.y) * e;
      } else if (ev.op === "zoom") {
        cam.zoom = cam.zoom + ((ev.to as number) - cam.zoom) * ease(ev.ease, k);
      } else if (ev.op === "shake" && t < ev.t + ev.dur) {
        const u = t - ev.t;
        const amp = (ev.amp as number) * (1 - k);
        cam.sx = amp * Math.sin(u * 94.2477796);
        cam.sy = amp * Math.cos(u * 69.1150384);
      }
    } else if (ev.track === "screen" && ev.op === "fade") {
      fade.a = fade.a + ((ev.to as number) - fade.a) * k;
      fade.color = ev.color as string;
    } else if (ev.track === "dialogue" && t < ev.t + ev.dur) {
      const text = (cs.lang === "th" ? (ev.th ?? ev.en) : (ev.en ?? ev.th)) as string | undefined ?? "";
      const speaker = (ev.speaker as string | null) ?? null;
      const actor = speaker ? cs.actors.find((a) => a.id === speaker) : undefined;
      const name = actor ? ((cs.lang === "th" ? (actor.name?.th ?? actor.name?.en) : (actor.name?.en ?? actor.name?.th)) ?? actor.id) : "";
      const shown = safeCount(text, Math.floor((t - ev.t) * CPS + 1e-6));
      line = { i: ev.i, speaker, name, text, shown, ref: (ev.ref as string | undefined) ?? null, done: shown >= text.length };
    } else if (ev.track === "fx" && t < ev.t + ev.dur) {
      let x = 0;
      let y = 0;
      const off = ev.offset as [number, number];
      if (Array.isArray(ev.at)) {
        x = (ev.at as number[])[0]!;
        y = (ev.at as number[])[1]!;
      } else if (typeof ev.actor === "string") {
        const a = actorsAt(cs, ev.t).find((s) => s.id === ev.actor);
        if (a) {
          x = a.x;
          y = a.y;
        }
      }
      fx.push({ i: ev.i, fx: ev.fx as string, x: x + off[0], y: y + off[1], age: t - ev.t, dur: ev.dur });
    } else if (ev.track === "audio") {
      if (ev.op === "music") music = ev.music as string;
      else if (ev.op === "music_stop") music = null;
    }
  }
  const halfW = st.width / (2 * cam.zoom);
  const halfH = st.height / (2 * cam.zoom);
  cam.x = st.worldWidth <= 2 * halfW ? st.worldWidth / 2 : Math.max(halfW, Math.min(st.worldWidth - halfW, cam.x));
  cam.y = st.worldHeight <= 2 * halfH ? st.worldHeight / 2 : Math.max(halfH, Math.min(st.worldHeight - halfH, cam.y));
  return { t, actors: actorsAt(cs, t), camera: cam, fade, line, fx, music };
}

/** Events whose start falls in (t0, t1]: what a runtime fires when time crosses them (sfx, music, fx, lines, wait_input). */
export function cuesBetween(cs: Cutscene, t0: number, t1: number): NormalEvent[] {
  return cs.events.filter((ev) => ev.t > t0 && ev.t <= t1);
}

/** The first wait_input at or after t0 and at or before t1, if any (runtimes pause there). */
export function waitInputIn(cs: Cutscene, t0: number, t1: number): NormalEvent | undefined {
  return cs.events.find((ev) => ev.op === "wait_input" && ev.t >= t0 && ev.t <= t1);
}
