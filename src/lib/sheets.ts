/** Sprite sheets and backdrops as PNG bytes / canvas images: a workspace Easy Sprite sheet if present, else a placeholder. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Image, createCanvas } from "@napi-rs/canvas";
import { drawBackdrop } from "../shared/backdrops.js";
import { FRAME, FRAME_COLUMNS, SIDE_ROWS, placeholderColors, placeholderSheet } from "../shared/sprites.js";
import type { Actor, Cutscene } from "../shared/types.js";
import { decodePng, encodePng } from "./png.js";
import { assertSafeId, dirs, resolveInside } from "./workspace.js";

export interface SheetInfo {
  sprite: string;
  png: Buffer;
  placeholder: boolean;
  width: number;
  height: number;
}

/** The sheet for one actor: `sprites/<sprite>.png` from the workspace (must be the 1440×144 native side layout) or a placeholder. */
export async function sheetFor(root: string, actor: Pick<Actor, "sprite" | "colors">): Promise<SheetInfo> {
  assertSafeId(actor.sprite, "sprite id");
  const f = path.join(dirs(root).sprites, `${actor.sprite}.png`);
  if (existsSync(f)) {
    const png = await readFile(f);
    const { width, height } = decodePng(png);
    if (width === FRAME * FRAME_COLUMNS.length && height >= FRAME * SIDE_ROWS.length) return { sprite: actor.sprite, png, placeholder: false, width, height };
  }
  const s = placeholderSheet(placeholderColors(actor.sprite, actor.colors));
  return { sprite: actor.sprite, png: encodePng(s.width, s.height, s.data), placeholder: true, width: s.width, height: s.height };
}

export async function sheetsFor(root: string, cs: Cutscene): Promise<Map<string, SheetInfo>> {
  const out = new Map<string, SheetInfo>();
  for (const a of cs.actors) if (!out.has(a.sprite)) out.set(a.sprite, await sheetFor(root, a));
  return out;
}

/** World-sized backdrop PNG: the stage image (workspace-relative) or the procedural backdrop. */
export async function backdropPng(root: string, cs: Cutscene): Promise<Buffer> {
  const st = cs.stage;
  if (st.image) {
    const f = resolveInside(root, st.image);
    if (existsSync(f)) return readFile(f);
  }
  const b = drawBackdrop(st.backdrop, st.worldWidth, st.worldHeight, st.ground, st.color);
  return encodePng(b.width, b.height, b.data);
}

export function toImage(png: Buffer): Image {
  const img = new Image();
  img.src = png;
  return img;
}

export { createCanvas };
