/**
 * Procedural pixel backdrops for previews and exports (no image files). Generic places only: houses, stalls,
 * trees, lamps, river; no sacred figures, no script or calligraphy.
 */
import type { BackdropId } from "./types.js";

type C = [number, number, number];
const hex = (h: string): C => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Raster {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  px(x: number, y: number, c: C) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 4;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
    this.data[o + 3] = 255;
  }
  rect(x0: number, y0: number, w: number, h: number, c: C) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.floor(y0 + h)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.width, Math.floor(x0 + w)); x++) this.px(x, y, c);
  }
  /** Vertical dithered gradient between rows y0 and y1. */
  grad(y0: number, y1: number, a: C, b: C, steps = 6) {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      for (let x = 0; x < this.width; x++) {
        const lvl = t * steps;
        const base = Math.floor(lvl);
        const frac = lvl - base;
        const k = (base + (frac * 16 > BAYER[(y & 3) * 4 + (x & 3)]! ? 1 : 0)) / steps;
        this.px(x, y, [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]);
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: C) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
  }
  /** Gable roof triangle with its base from x0..x1 at row y and apex height h. */
  roof(x0: number, x1: number, y: number, h: number, c: C, edge: C) {
    for (let i = 0; i < h; i++) {
      const inset = ((x1 - x0) / 2) * (i / h);
      this.rect(x0 + inset, y - i, x1 - x0 - 2 * inset, 1, i === 0 ? edge : c);
      this.px(x0 + inset, y - i, edge);
      this.px(x1 - inset - 1, y - i, edge);
    }
  }
}

const INK = hex("#1e1610");

function palm(r: Raster, x: number, ground: number, h: number, trunk: C, leaf: C) {
  for (let i = 0; i < h; i++) r.rect(x + Math.round(Math.sin(i / 9) * 2), ground - i, 3, 1, i % 4 === 0 ? INK : trunk);
  const tx = x + Math.round(Math.sin(h / 9) * 2) + 1;
  const ty = ground - h;
  for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [0, -1]] as const) {
    for (let i = 0; i < 14; i++) r.rect(tx + dx * i, ty + Math.round((dy * i) + (i * i) / 22), 2, 2, leaf);
  }
  r.rect(tx - 1, ty, 3, 3, hex("#6a4a2a"));
}

function stiltHouse(r: Raster, x: number, ground: number, w: number, wall: C, roofC: C, win: C) {
  const floorY = ground - 12;
  for (let i = 4; i < w; i += Math.max(8, Math.floor(w / 4))) r.rect(x + i, floorY, 2, 12, INK);
  r.rect(x, floorY - 22, w, 22, wall);
  r.rect(x, floorY - 1, w, 2, INK);
  for (let i = 0; i < w; i += 4) r.rect(x + i, floorY - 22, 1, 21, [Math.max(0, wall[0] - 24), Math.max(0, wall[1] - 24), Math.max(0, wall[2] - 24)]);
  r.rect(x + 6, floorY - 16, 8, 8, win);
  r.rect(x + w - 14, floorY - 16, 8, 8, win);
  r.roof(x - 4, x + w + 4, floorY - 22, Math.round(w / 2.6), roofC, INK);
}

export function drawBackdrop(id: BackdropId, width: number, height: number, ground: number, color = "#2e2014"): { width: number; height: number; data: Uint8ClampedArray } {
  const r = new Raster(width, height);
  const rnd = mulberry(width * 31 + height * 7 + id.length * 1013);
  if (id === "plain") {
    r.rect(0, 0, width, height, hex(color));
    r.rect(0, ground, width, height - ground, [Math.max(0, hex(color)[0] - 16), Math.max(0, hex(color)[1] - 16), Math.max(0, hex(color)[2] - 16)]);
  } else if (id === "village_morning") {
    r.grad(0, Math.floor(ground * 0.75), hex("#8fc7e8"), hex("#f7e8c8"));
    r.rect(0, Math.floor(ground * 0.75), width, ground, hex("#f7e8c8"));
    r.disc(width - 46, 30, 12, hex("#fff6c8"));
    r.disc(width - 46, 30, 9, hex("#ffe08a"));
    // distant hills
    for (let x = 0; x < width; x++) {
      const hy = Math.floor(ground * 0.62 + Math.sin(x / 37) * 8 + Math.sin(x / 13) * 3);
      r.rect(x, hy, 1, ground - hy, hex("#9cc48a"));
      const hy2 = Math.floor(ground * 0.74 + Math.sin(x / 23 + 2) * 5);
      r.rect(x, hy2, 1, ground - hy2, hex("#6fae5a"));
    }
    // clouds
    for (let i = 0; i < Math.ceil(width / 140); i++) {
      const cx = 30 + i * 140 + Math.floor(rnd() * 40);
      const cy = 18 + Math.floor(rnd() * 20);
      r.rect(cx, cy, 30, 5, hex("#fbf4ea"));
      r.rect(cx + 6, cy - 4, 16, 5, hex("#fbf4ea"));
    }
    // houses, stall and palms along the street
    let x = 8;
    let k = 0;
    while (x < width - 30) {
      if (k % 3 === 0) palm(r, x + 6, ground - 6, 54 + Math.floor(rnd() * 14), hex("#8a6040"), hex("#3f8a4a"));
      else if (k % 3 === 1) stiltHouse(r, x, ground - 6, 56, hex("#b07a48"), hex("#7a3a22"), hex("#3a2a1e"));
      else {
        // market stall with a striped awning
        r.rect(x, ground - 36, 2, 30, INK);
        r.rect(x + 46, ground - 36, 2, 30, INK);
        for (let i = 0; i < 48; i++) r.rect(x + i, ground - 42, 1, 7, i % 8 < 4 ? hex("#d0503c") : hex("#fbf4ea"));
        r.rect(x, ground - 20, 48, 3, hex("#8a6040"));
        r.rect(x + 4, ground - 24, 10, 4, hex("#f4ae3d"));
        r.rect(x + 18, ground - 25, 8, 5, hex("#6fae5a"));
        r.rect(x + 30, ground - 24, 12, 4, hex("#e8604a"));
      }
      x += k % 3 === 0 ? 30 : 70;
      k++;
    }
    // road + grass
    r.rect(0, ground - 6, width, 6, hex("#6fae5a"));
    r.rect(0, ground, width, height - ground, hex("#c8a878"));
    for (let i = 0; i < width; i += 2) if (rnd() < 0.3) r.px(i, ground + 2 + Math.floor(rnd() * (height - ground - 3)), hex("#b08a58"));
    r.rect(0, ground, width, 1, hex("#8a6a40"));
  } else if (id === "raya_house") {
    r.grad(0, Math.floor(ground * 0.8), hex("#3a2a5a"), hex("#e8946a"), 7);
    r.rect(0, Math.floor(ground * 0.8), width, ground, hex("#e8946a"));
    for (let x = 0; x < width; x++) {
      const hy = Math.floor(ground * 0.66 + Math.sin(x / 19) * 6 + Math.sin(x / 7) * 2);
      r.rect(x, hy, 1, ground - hy, hex("#2a3a2a"));
    }
    // big kampung house with a veranda (serambi) across the middle of the world
    const hw = Math.min(width - 40, 260);
    const hx = Math.floor(width / 2 - hw / 2);
    const floorY = ground - 14;
    for (let i = 6; i < hw; i += 24) r.rect(hx + i, floorY, 3, 14, INK);
    r.rect(hx, floorY - 40, hw, 40, hex("#a8703c"));
    for (let i = 0; i < hw; i += 5) r.rect(hx + i, floorY - 40, 1, 39, hex("#8a5a30"));
    r.rect(hx, floorY - 2, hw, 3, INK);
    // veranda railings and an open door with warm light
    for (let i = 0; i < hw; i += 6) r.rect(hx + i, floorY - 12, 2, 10, hex("#e6c890"));
    r.rect(hx, floorY - 13, hw, 2, hex("#e6c890"));
    r.rect(hx + hw / 2 - 10, floorY - 34, 20, 32, hex("#ffd27a"));
    r.rect(hx + 20, floorY - 32, 16, 14, hex("#ffd27a"));
    r.rect(hx + hw - 36, floorY - 32, 16, 14, hex("#ffd27a"));
    // steps
    for (let i = 0; i < 4; i++) r.rect(hx + hw / 2 - 12 - i * 2, floorY + i * 3 + 2, 24 + i * 4, 2, hex("#8a5a30"));
    r.roof(hx - 10, hx + hw + 10, floorY - 40, 44, hex("#7a3a22"), INK);
    // ketupat (woven palm-leaf parcels) hanging from the eaves, green and yellow bunting
    for (let i = 14; i < hw; i += 22) {
      const kx = hx + i;
      r.rect(kx, floorY - 40, 1, 6, hex("#e6c890"));
      for (let d = 0; d < 4; d++) r.rect(kx - d, floorY - 33 + d, 1 + d * 2, 1, d % 2 ? hex("#c8c45a") : hex("#6fae5a"));
      for (let d = 0; d < 4; d++) r.rect(kx - 3 + d, floorY - 29 + d, 7 - d * 2, 1, d % 2 ? hex("#6fae5a") : hex("#c8c45a"));
    }
    for (let i = 0; i < width; i += 8) r.rect(i, 8 + Math.floor(Math.abs(Math.sin(i / 32)) * 6), 6, 4, (i / 8) % 2 ? hex("#2f9e6a") : hex("#f4ae3d"));
    // pelita oil lamps on bamboo posts along the yard
    for (let i = 12; i < width; i += 34) {
      r.rect(i, ground - 26, 2, 26, hex("#c8a060"));
      r.disc(i + 1, ground - 29, 3, hex("#f4ae3d"));
      r.rect(i + 1, ground - 33, 1, 3, hex("#fff6c8"));
    }
    r.rect(0, ground, width, height - ground, hex("#8a6a48"));
    for (let i = 0; i < width; i += 2) if (rnd() < 0.25) r.px(i, ground + 2 + Math.floor(rnd() * (height - ground - 3)), hex("#6a5038"));
    r.rect(0, ground, width, 1, hex("#5a4030"));
  } else if (id === "river_night") {
    r.grad(0, Math.floor(ground * 0.55), hex("#0e0c22"), hex("#2a2a5a"), 6);
    for (let i = 0; i < width * 0.25; i++) r.px(Math.floor(rnd() * width), Math.floor(rnd() * ground * 0.45), rnd() < 0.3 ? hex("#fff6c8") : hex("#8a8ab8"));
    r.disc(Math.floor(width * 0.72), 28, 10, hex("#fbf4ea"));
    r.disc(Math.floor(width * 0.72) + 4, 25, 9, hex("#2a2a5a"));
    const shore = Math.floor(ground * 0.55);
    for (let x = 0; x < width; x++) {
      const hy = Math.floor(shore - 10 + Math.sin(x / 11) * 4 + Math.sin(x / 4) * 2);
      r.rect(x, hy, 1, shore - hy + 1, hex("#141a2a"));
    }
    // far stilt houses with warm windows
    for (let x = 20; x < width - 40; x += 90 + Math.floor(rnd() * 40)) {
      r.rect(x, shore - 22, 34, 14, hex("#1a1e30"));
      r.roof(x - 3, x + 37, shore - 22, 12, hex("#1a1e30"), hex("#0e0c18"));
      r.rect(x + 6, shore - 18, 5, 4, hex("#f4ae3d"));
      r.rect(x + 22, shore - 18, 5, 4, hex("#f4ae3d"));
      for (let i = 2; i < 34; i += 10) r.rect(x + i, shore - 8, 1, 8, hex("#0e0c18"));
    }
    // river with moonlight and window reflections
    r.grad(shore, ground - 8, hex("#1e2a4a"), hex("#2c3a66"), 4);
    for (let y = shore + 2; y < ground - 8; y += 3) {
      const w = 6 + Math.floor(rnd() * 10);
      r.rect(Math.floor(width * 0.72) - w / 2 + Math.floor(rnd() * 6), y, w, 1, hex("#8a9ad0"));
      if (rnd() < 0.5) r.rect(Math.floor(rnd() * width), y, 4, 1, hex("#a8743a"));
    }
    // near bank: grass, a small wooden pier
    r.rect(0, ground - 8, width, 8, hex("#24402e"));
    for (let i = 0; i < width; i += 3) r.rect(i, ground - 10 - Math.floor(rnd() * 3), 1, 3, hex("#2e5a3a"));
    const px = Math.floor(width * 0.4);
    r.rect(px, ground - 12, 60, 3, hex("#6a4a30"));
    for (let i = 0; i < 60; i += 14) r.rect(px + i, ground - 9, 2, 10, hex("#4a3020"));
    r.rect(0, ground, width, height - ground, hex("#1e3424"));
    r.rect(0, ground, width, 1, hex("#142418"));
  }
  return { width, height, data: r.data };
}
