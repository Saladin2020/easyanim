/**
 * Easy Sprite native side-view layout and the placeholder chibi drawn when a cutscene names a sheet you don't have.
 * Native sheet: 48px frames, 30 columns (FRAME_COLUMNS), rows right / left / front.
 */
import { SPRITE_COLORS } from "./catalog.js";
import type { Face } from "./types.js";

export const FRAME = 48;
export const FRAME_COLUMNS = [
  "idle", "walk0", "walk1", "walk2", "run0", "run1", "run2", "run3", "jump0", "jump1", "wave0", "wave1", "carry0", "carry1",
  "farm0", "farm1", "cheer0", "cheer1", "attack0", "attack1", "hurt0", "hurt1", "fall0", "fall1", "sleep0", "sleep1",
  "tired0", "tired1", "sit", "crouch",
] as const;
export const SIDE_ROWS: Face[] = ["right", "left", "front"];

/** Animations a cutscene can name: frame columns, frames per second, loop or hold the last frame. */
export const ANIMS: Record<string, { frames: string[]; fps: number; loop: boolean }> = {
  idle: { frames: ["idle"], fps: 1, loop: true },
  walk: { frames: ["walk0", "walk1", "walk2", "walk1"], fps: 8, loop: true },
  run: { frames: ["run0", "run1", "run2", "run3"], fps: 10, loop: true },
  jump: { frames: ["jump0", "jump1"], fps: 4, loop: false },
  wave: { frames: ["wave0", "wave1"], fps: 4, loop: true },
  carry: { frames: ["carry0", "carry1"], fps: 6, loop: true },
  farm: { frames: ["farm0", "farm1"], fps: 3, loop: true },
  cheer: { frames: ["cheer0", "cheer1"], fps: 4, loop: true },
  attack: { frames: ["attack0", "attack1"], fps: 8, loop: false },
  hurt: { frames: ["hurt0", "hurt1"], fps: 6, loop: false },
  fall: { frames: ["fall0", "fall1"], fps: 4, loop: false },
  sleep: { frames: ["sleep0", "sleep1"], fps: 1.5, loop: true },
  tired: { frames: ["tired0", "tired1"], fps: 2, loop: true },
  sit: { frames: ["sit"], fps: 1, loop: true },
  crouch: { frames: ["crouch"], fps: 1, loop: true },
};
export const ANIM_NAMES = Object.keys(ANIMS);

export function columnOf(frame: string): number {
  return Math.max(0, (FRAME_COLUMNS as readonly string[]).indexOf(frame));
}

// ---------------------------------------------------------------- placeholder chibi

type RGBA = [number, number, number, number];
const hex = (h: string): RGBA => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
};
const shade = (c: RGBA, f: number): RGBA => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), 255];

/** FNV-1a 32-bit of a string (placeholder colours for unknown sprite ids). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface PlaceholderColors {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  hat?: "hijab" | "kopiah" | "bald" | "bun" | "cap";
}

const TOPS = ["#d0503c", "#4fa3d9", "#2e8c52", "#f4ae3d", "#a07ae0", "#e0588f", "#2bb3a3"];
const SKINS = ["#e0b088", "#c9956c", "#a87048", "#d8a878"];

export function placeholderColors(sprite: string, override?: Partial<PlaceholderColors>): PlaceholderColors {
  const known = SPRITE_COLORS[sprite];
  const h = hash32(sprite);
  const base: PlaceholderColors = known ?? { skin: SKINS[h % SKINS.length]!, hair: "#2a201a", top: TOPS[(h >>> 4) % TOPS.length]!, bottom: "#3a4a6a" };
  return { ...base, ...Object.fromEntries(Object.entries(override ?? {}).filter(([, v]) => typeof v === "string")) };
}

interface Pose {
  bob: number;
  legs: number; // −2..2 stride
  arms: "down" | "up" | "forward" | "wave" | "carry" | "back";
  body: "stand" | "sit" | "crouch" | "lie";
  eyes: "open" | "closed" | "wince";
}

function poseOf(frame: string): Pose {
  const p: Pose = { bob: 0, legs: 0, arms: "down", body: "stand", eyes: "open" };
  switch (frame) {
    case "walk0": return { ...p, legs: 2, bob: 0 };
    case "walk1": return { ...p, legs: 0, bob: -1 };
    case "walk2": return { ...p, legs: -2, bob: 0 };
    case "run0": return { ...p, legs: 3, bob: 0, arms: "back" };
    case "run1": return { ...p, legs: 1, bob: -2, arms: "forward" };
    case "run2": return { ...p, legs: -3, bob: 0, arms: "back" };
    case "run3": return { ...p, legs: -1, bob: -2, arms: "forward" };
    case "jump0": return { ...p, body: "crouch", arms: "back" };
    case "jump1": return { ...p, bob: -6, legs: 1, arms: "up" };
    case "wave0": return { ...p, arms: "wave" };
    case "wave1": return { ...p, arms: "up" };
    case "carry0": return { ...p, arms: "carry", legs: 1 };
    case "carry1": return { ...p, arms: "carry", legs: -1, bob: -1 };
    case "farm0": return { ...p, body: "crouch", arms: "forward" };
    case "farm1": return { ...p, arms: "forward", bob: -1 };
    case "cheer0": return { ...p, arms: "up", bob: -2 };
    case "cheer1": return { ...p, arms: "wave", bob: 0 };
    case "attack0": return { ...p, arms: "back", legs: 1 };
    case "attack1": return { ...p, arms: "forward", legs: 2 };
    case "hurt0": return { ...p, eyes: "wince", bob: -1, arms: "back" };
    case "hurt1": return { ...p, eyes: "wince", arms: "back" };
    case "fall0": return { ...p, body: "crouch", eyes: "wince" };
    case "fall1": return { ...p, body: "lie", eyes: "closed" };
    case "sleep0": return { ...p, body: "lie", eyes: "closed" };
    case "sleep1": return { ...p, body: "lie", eyes: "closed", bob: -1 };
    case "tired0": return { ...p, bob: 1, eyes: "closed" };
    case "tired1": return { ...p, bob: 2, eyes: "closed" };
    case "sit": return { ...p, body: "sit" };
    case "crouch": return { ...p, body: "crouch" };
    default: return p;
  }
}

/** Draw one 48×48 placeholder frame into `buf` (RGBA, row stride `stride` px) at (ox, oy). */
function drawChibi(buf: Uint8ClampedArray, stride: number, ox: number, oy: number, c: PlaceholderColors, frame: string, face: Face) {
  const skin = hex(c.skin);
  const hair = hex(c.hair);
  const top = hex(c.top);
  const bottom = hex(c.bottom);
  const shoe = hex("#2a1e18");
  const eye = hex("#1e1814");
  const mask = new Uint8Array(FRAME * FRAME);
  const col: RGBA[] = new Array(FRAME * FRAME);
  const flip = face === "left";
  const put = (x: number, y: number, k: RGBA) => {
    const xx = flip ? FRAME - 1 - x : x;
    if (xx < 0 || y < 0 || xx >= FRAME || y >= FRAME) return;
    mask[y * FRAME + xx] = 1;
    col[y * FRAME + xx] = k;
  };
  const rect = (x0: number, y0: number, w: number, h: number, k: RGBA) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, k);
  };
  const p = poseOf(frame);
  const front = face === "front";

  if (p.body === "lie") {
    // lying on the ground, head on the left
    rect(6, 36, 20, 9, skin);
    rect(6, 34, 20, 3, c.hat === "bald" ? skin : hair);
    rect(26, 37, 12, 7, top);
    rect(38, 38, 8, 5, bottom);
    rect(44, 38, 2, 5, shoe);
    if (p.eyes !== "open") rect(18, 39, 3, 1, eye);
  } else {
    const sit = p.body === "sit";
    const crouch = p.body === "crouch";
    const dy = p.bob + (sit ? 6 : crouch ? 4 : 0);
    // legs
    if (sit) {
      rect(18, 40, 14, 4, bottom);
      rect(30, 40, 3, 6, bottom);
      rect(30, 45, 4, 2, shoe);
    } else if (crouch) {
      rect(17, 40, 6, 5, bottom);
      rect(25, 40, 6, 5, bottom);
      rect(16, 45, 7, 2, shoe);
      rect(25, 45, 7, 2, shoe);
    } else if (front) {
      rect(18, 38 + p.bob, 5, 7 - p.bob, bottom);
      rect(25, 38 + p.bob, 5, 7 - p.bob, bottom);
      rect(18, 45, 5, 2, shoe);
      rect(25, 45, 5, 2, shoe);
    } else {
      const s = p.legs;
      rect(21 + s, 38 + p.bob, 5, 7 - p.bob, shade(bottom, 0.8));
      rect(21 - s, 38 + p.bob, 5, 7 - p.bob, bottom);
      rect(21 + s, 45, 6, 2, shade(shoe, 0.8));
      rect(21 - s, 45, 6, 2, shoe);
    }
    // torso
    rect(17, 28 + dy, 14, 11, top);
    rect(17, 36 + dy, 14, 2, shade(top, 0.82));
    // arms
    const armY = 29 + dy;
    const arm = (x: number, mode: Pose["arms"], k: RGBA) => {
      if (mode === "up") rect(x, armY - 9, 3, 10, k), rect(x, armY - 11, 3, 2, skin);
      else if (mode === "wave") rect(x + 1, armY - 7, 3, 8, k), rect(x + 2, armY - 10, 3, 3, skin);
      else if (mode === "forward") rect(x, armY, 9, 3, k), rect(x + 9, armY, 2, 3, skin);
      else if (mode === "back") rect(x - 4, armY + 1, 6, 3, k), rect(x - 6, armY + 1, 2, 3, skin);
      else if (mode === "carry") rect(x, armY + 1, 8, 3, k), rect(x + 3, armY - 4, 8, 6, hex("#c49a5a")), rect(x + 3, armY - 4, 8, 1, hex("#8a6030"));
      else rect(x, armY, 3, 8, k), rect(x, armY + 8, 3, 2, skin);
    };
    if (front) {
      arm(14, p.arms === "forward" || p.arms === "carry" || p.arms === "back" ? "down" : p.arms, top);
      arm(31, p.arms === "wave" ? "down" : p.arms === "forward" || p.arms === "carry" || p.arms === "back" ? "down" : p.arms, top);
    } else {
      arm(23, p.arms, shade(top, 0.9));
    }
    // head
    const hy = 8 + dy;
    rect(15, hy + 1, 18, 18, skin);
    rect(16, hy, 16, 20, skin);
    // hair / headwear
    if (c.hat === "hijab") {
      rect(14, hy - 1, 20, 6, hair);
      if (front) rect(14, hy, 3, 22, hair), rect(31, hy, 3, 22, hair), rect(15, hy + 19, 18, 4, hair);
      else rect(14, hy, 8, 22, hair), rect(15, hy + 19, 16, 4, hair);
    } else if (c.hat !== "bald") {
      rect(15, hy - 1, 18, 5, hair);
      if (front) rect(15, hy, 2, 10, hair), rect(31, hy, 2, 10, hair);
      else rect(15, hy, 6, 12, hair);
      if (c.hat === "bun") rect(front ? 21 : 13, hy - 4, 6, 4, hair);
    }
    if (c.hat === "kopiah") rect(16, hy - 3, 16, 4, hex("#2a2a30")), rect(16, hy - 3, 16, 1, hex("#4a4a54"));
    if (c.hat === "cap") rect(15, hy - 2, 18, 4, hex("#c45c26")), front || rect(30, hy + 1, 6, 2, hex("#c45c26"));
    // eyes
    const ey = hy + 10;
    const drawEye = (x: number) => {
      if (p.eyes === "open") rect(x, ey, 2, 3, eye);
      else if (p.eyes === "wince") rect(x, ey + 1, 3, 1, eye), put(x + 1, ey, eye);
      else rect(x, ey + 1, 3, 1, eye);
    };
    if (front) drawEye(19), drawEye(27), rect(22, ey + 5, 4, 1, shade(skin, 0.7));
    else drawEye(28), rect(30, ey + 5, 2, 1, shade(skin, 0.7));
    // cheek
    put(front ? 18 : 27, ey + 4, hex("#e08a7a"));
  }

  // 1px dark outline, then copy into the sheet
  const ink: RGBA = [30, 22, 16, 255];
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const i = y * FRAME + x;
      let k: RGBA | undefined = mask[i] ? col[i] : undefined;
      if (!k) {
        const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < FRAME && yy < FRAME && mask[yy * FRAME + xx] === 1;
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) k = ink;
      }
      if (!k) continue;
      const o = ((oy + y) * stride + ox + x) * 4;
      buf[o] = k[0];
      buf[o + 1] = k[1];
      buf[o + 2] = k[2];
      buf[o + 3] = k[3];
    }
  }
}

/** A full placeholder sheet in the Easy Sprite native side layout (1440×144 RGBA). */
export function placeholderSheet(colors: PlaceholderColors): { width: number; height: number; data: Uint8ClampedArray } {
  const width = FRAME * FRAME_COLUMNS.length;
  const height = FRAME * SIDE_ROWS.length;
  const data = new Uint8ClampedArray(width * height * 4);
  SIDE_ROWS.forEach((face, r) => FRAME_COLUMNS.forEach((f, c) => drawChibi(data, width, c * FRAME, r * FRAME, colors, f, face)));
  return { width, height, data };
}
