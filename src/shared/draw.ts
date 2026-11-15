/**
 * Draw one cutscene frame on any 2D canvas context (browser canvas or @napi-rs/canvas). Used by the editor
 * preview and the CLI GIF / MP4 / PNG renderer. FX are drawn as small deterministic placeholder particles
 * (the real sprites come from Easy FX in the Godot and Pixi runners).
 */
import type { FrameState } from "./evaluate.js";
import { safeCount } from "./evaluate.js";
import { FRAME, SIDE_ROWS, columnOf, hash32 } from "./sprites.js";
import type { Cutscene } from "./types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Ctx2D {
  imageSmoothingEnabled: boolean;
  fillStyle: any;
  strokeStyle: any;
  globalAlpha: number;
  font: string;
  textBaseline: any;
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(img: any, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

export interface DrawAssets {
  /** World-sized backdrop image. */
  backdrop: any;
  /** Sheet image per sprite id (native side layout). */
  sheets: Record<string, any>;
}

export const UI = { teak: "#2e2014", teak2: "#21160e", gold: "#f4ae3d", cream: "#f7ebd3", muted: "#b8a080", ink: "#140e0a" };

/** Visible top-left of the camera in world pixels (integer, so pixels stay crisp). */
export function viewOrigin(cs: Cutscene, s: FrameState) {
  const z = s.camera.zoom;
  const vw = cs.stage.width / z;
  const vh = cs.stage.height / z;
  return { x: Math.round(s.camera.x - vw / 2 + s.camera.sx), y: Math.round(s.camera.y - vh / 2 + s.camera.sy), vw, vh, z };
}

function fxColors(id: string): string[] {
  if (/fire|torch|ember|campfire|pelita|lantern|khom|krathong|incense/.test(id)) return ["#fff6c8", "#ffd86a", "#f4ae3d", "#e8604a"];
  if (/water|splash|rain|songkran/.test(id)) return ["#e4f6fb", "#7cc8e8", "#4f8ac8"];
  if (/raya|firework|confetti/.test(id)) return ["#fff6c8", "#6fdc9a", "#f4ae3d", "#e0588f", "#7cc8e8"];
  if (/heal|leaf|leaves|firefl/.test(id)) return ["#eaffd8", "#c8f06a", "#8ee07a"];
  if (/smoke|dust|steam/.test(id)) return ["#ecdcbc", "#cfc6b8", "#a09a94"];
  if (/magic/.test(id)) return ["#f4ecff", "#c8a0ff", "#a07ae0"];
  return ["#ffffff", "#fff6c8", "#ffd86a", "#f4ae3d"];
}

/** Deterministic placeholder particles for an Easy FX id at (x, y), `age` seconds into `dur`. */
export function drawFxPlaceholder(g: Ctx2D, id: string, x: number, y: number, age: number, dur: number, ox: number, oy: number, k: number) {
  const cols = fxColors(id);
  const seed = hash32(id);
  const rising = /khom|lantern|smoke|steam|incense|ember|fire|pelita|torch|campfire/.test(id);
  const burst = /firework|burst|explosion|confetti|sparkle|level|splash|hit|coin|heal|dust/.test(id);
  const n = burst ? 18 : 10;
  const life = Math.max(0.05, dur);
  const fadeK = Math.max(0, 1 - age / life);
  g.save();
  for (let i = 0; i < n; i++) {
    const h = hash32(`${seed}:${i}`);
    const a = ((h % 360) * Math.PI) / 180;
    const sp = 8 + ((h >>> 9) % 28);
    let px: number;
    let py: number;
    if (/firefl/.test(id)) {
      px = x + Math.sin(age * 1.3 + i) * 24 + ((h >>> 3) % 40) - 20;
      py = y + Math.cos(age * 1.1 + i * 2) * 10 - ((h >>> 5) % 30);
      g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(age * 3 + i));
    } else if (/krathong/.test(id)) {
      // one krathong drifting on the water: banana-leaf base, flower, candle flame
      if (i > 0) continue;
      const kx = x + Math.sin(age * 0.6) * 3 + age * 1.5;
      const ky = y + Math.round(Math.sin(age * 2) * 0.6);
      const R = (dx: number, dy: number, w: number, h: number, c: string) => {
        g.fillStyle = c;
        g.fillRect(Math.round((kx + dx - ox) * k), Math.round((ky + dy - oy) * k), w * k, h * k);
      };
      g.globalAlpha = Math.min(1, age * 2);
      R(-6, 0, 12, 2, "#3f8a4a");
      R(-5, 2, 10, 1, "#2e5a3a");
      R(-3, -3, 6, 3, "#e0588f");
      R(-2, -4, 4, 1, "#f4a0c0");
      R(0, -8, 1, 4, "#fbf4ea");
      R(0, -10 - (Math.floor(age * 8) % 2), 1, 2, "#ffd86a");
      g.globalAlpha = 0.35 + 0.15 * Math.sin(age * 9);
      R(-4, 3, 8, 1, "#f4ae3d");
      continue;
    } else if (/khom/.test(id)) {
      px = x + ((h >>> 3) % 60) - 30 + Math.sin(age + i) * 3;
      py = y - age * (10 + (h % 8)) - ((h >>> 7) % 20);
      g.globalAlpha = 1;
      if (i < 4) {
        g.fillStyle = "#f4ae3d";
        g.fillRect(Math.round((px - ox) * k), Math.round((py - oy) * k), 3 * k, 4 * k);
        g.fillStyle = "#fff6c8";
        g.fillRect(Math.round((px - ox + 1) * k), Math.round((py - oy + 3) * k), 1 * k, 1 * k);
      }
      continue;
    } else if (rising) {
      const t = (age + ((h >>> 4) % 100) / 100) % 1;
      px = x + Math.cos(a) * 4 + Math.sin(t * 6 + i) * 2;
      py = y - t * sp;
      g.globalAlpha = 1 - t;
    } else if (burst) {
      px = x + Math.cos(a) * sp * age * 2;
      py = y + Math.sin(a) * sp * age * 2 + 20 * age * age;
      g.globalAlpha = fadeK;
    } else {
      px = x + Math.cos(a) * 10 * Math.sin(age * 2 + i);
      py = y + Math.sin(a) * 6;
      g.globalAlpha = fadeK;
    }
    g.fillStyle = cols[i % cols.length];
    const s = i % 3 === 0 ? 2 : 1;
    g.fillRect(Math.round((px - ox) * k), Math.round((py - oy) * k), s * k, s * k);
  }
  g.restore();
}

/** Break text into lines that fit `maxW`, only at spaces or at Thai-safe character boundaries. */
export function wrapText(g: Ctx2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start;
    let lastSpace = -1;
    while (end < text.length) {
      const next = safeCount(text, end + 1);
      if (g.measureText(text.slice(start, next)).width > maxW && end > start) break;
      if (text[next - 1] === " ") lastSpace = next;
      end = next;
    }
    if (end < text.length && lastSpace > start) end = lastSpace;
    lines.push(text.slice(start, end).trim());
    start = end;
  }
  return lines;
}

export function drawFrame(g: Ctx2D, cs: Cutscene, s: FrameState, assets: DrawAssets, scale = 1, opts: { font?: string } = {}) {
  const W = cs.stage.width * scale;
  const H = cs.stage.height * scale;
  const o = viewOrigin(cs, s);
  const k = o.z * scale;
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.fillStyle = cs.stage.color;
  g.fillRect(0, 0, W, H);
  // backdrop: the visible window of the world image
  g.drawImage(assets.backdrop, o.x, o.y, o.vw, o.vh, 0, 0, W, H);
  // actors and ground-level FX (krathong, splashes, lamps), back to front by y; airborne FX in front
  const GROUND_FX = /krathong|water|splash|dust|footstep|campfire|pelita|torch/;
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const a of s.actors) {
    if (!a.visible) continue;
    const sheet = assets.sheets[cs.actors.find((x) => x.id === a.id)?.sprite ?? ""];
    if (!sheet) continue;
    items.push({
      y: a.y,
      draw: () => {
        const col = columnOf(a.frame);
        const row = Math.max(0, SIDE_ROWS.indexOf(a.face));
        const dx = Math.round(a.x - FRAME / 2 - o.x);
        const dy = Math.round(a.y - FRAME + 1 - o.y);
        g.drawImage(sheet, col * FRAME, row * FRAME, FRAME, FRAME, Math.round(dx * k), Math.round(dy * k), FRAME * k, FRAME * k);
      },
    });
  }
  for (const f of s.fx) items.push({ y: GROUND_FX.test(f.fx) ? f.y : Number.POSITIVE_INFINITY, draw: () => drawFxPlaceholder(g, f.fx, f.x, f.y, f.age, f.dur, o.x, o.y, k) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // fade
  if (s.fade.a > 0) {
    g.globalAlpha = Math.min(1, s.fade.a);
    g.fillStyle = s.fade.color;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
  }
  // dialogue box
  if (s.line) {
    const font = opts.font ?? "Kanit, sans-serif";
    const pad = 6 * scale;
    const bh = 44 * scale;
    const bx = 8 * scale;
    const by = 6 * scale; // top of the screen: actors stand near the bottom
    const bw = W - 16 * scale;
    g.fillStyle = UI.ink;
    g.fillRect(bx - scale, by - scale, bw + 2 * scale, bh + 2 * scale);
    g.fillStyle = UI.gold;
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = UI.teak2;
    g.fillRect(bx + scale, by + scale, bw - 2 * scale, bh - 2 * scale);
    g.textBaseline = "top";
    let ty = by + pad - 2 * scale;
    if (s.line.name) {
      g.font = `${9 * scale}px ${font}`;
      g.fillStyle = UI.gold;
      g.fillText(s.line.name, bx + pad, ty);
      ty += 11 * scale;
    }
    g.font = `${9 * scale}px ${font}`;
    g.fillStyle = UI.cream;
    const text = s.line.text || (s.line.ref ? `[Easy Dialogue: ${s.line.ref}]` : "");
    const shown = s.line.text ? text.slice(0, s.line.shown) : text;
    const lines = wrapText(g, text, bw - 2 * pad);
    let used = 0;
    for (const ln of lines.slice(0, 3)) {
      const idx = text.indexOf(ln, used);
      const visible = Math.max(0, Math.min(ln.length, shown.length - idx));
      used = idx + ln.length;
      if (visible > 0) g.fillText(ln.slice(0, visible), bx + pad, ty);
      ty += 11 * scale;
    }
    if (s.line.done) {
      g.fillStyle = UI.gold;
      g.fillRect(bx + bw - pad - 4 * scale, by + bh - pad - 2 * scale, 4 * scale, 2 * scale);
    }
  }
}
