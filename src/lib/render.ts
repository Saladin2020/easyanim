/** Render cutscene frames with @napi-rs/canvas: single PNG frames, contact strips, and GIF / MP4 through ffmpeg. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { drawFrame, type Ctx2D } from "../shared/draw.js";
import { evaluate } from "../shared/evaluate.js";
import type { Cutscene } from "../shared/types.js";
import { registerFonts } from "./assets.js";
import { backdropPng, sheetsFor, toImage } from "./sheets.js";

export function ffmpegPath(): string | null {
  const env = process.env.EASYANIM_FFMPEG?.trim();
  if (env) return existsSync(env) ? env : null;
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0 ? "ffmpeg" : null;
}

export async function renderer(root: string, cs: Cutscene, scale = 2) {
  registerFonts();
  const backdrop = toImage(await backdropPng(root, cs));
  const sheets: Record<string, unknown> = {};
  const info = await sheetsFor(root, cs);
  for (const [id, s] of info) sheets[id] = toImage(s.png);
  const W = cs.stage.width * scale;
  const H = cs.stage.height * scale;
  const canvas = createCanvas(W, H);
  const g = canvas.getContext("2d");
  return {
    width: W,
    height: H,
    placeholders: [...info.values()].filter((s) => s.placeholder).map((s) => s.sprite),
    draw(t: number) {
      drawFrame(g as unknown as Ctx2D, cs, evaluate(cs, t), { backdrop, sheets }, scale, { font: "Kanit, sans-serif" });
      return canvas;
    },
    rgba(t: number): Buffer {
      this.draw(t);
      return Buffer.from(g.getImageData(0, 0, W, H).data.buffer);
    },
  };
}

export async function renderPng(root: string, cs: Cutscene, t: number, scale = 2): Promise<Buffer> {
  const r = await renderer(root, cs, scale);
  return r.draw(t).toBuffer("image/png");
}

/** A grid of frames at evenly spaced times (README / MCP preview). */
export async function contactSheet(root: string, cs: Cutscene, opts: { count?: number; cols?: number; scale?: number } = {}): Promise<Buffer> {
  const count = opts.count ?? 8;
  const cols = opts.cols ?? 4;
  const scale = opts.scale ?? 1;
  const r = await renderer(root, cs, scale);
  const rows = Math.ceil(count / cols);
  const gap = 4;
  const out = createCanvas(cols * (r.width + gap) + gap, rows * (r.height + gap + 12) + gap);
  const g = out.getContext("2d");
  g.fillStyle = "#140e0a";
  g.fillRect(0, 0, out.width, out.height);
  for (let i = 0; i < count; i++) {
    const t = Math.round(((cs.duration * (i + 0.5)) / count) * 100) / 100;
    const x = gap + (i % cols) * (r.width + gap);
    const y = gap + Math.floor(i / cols) * (r.height + gap + 12);
    g.drawImage(r.draw(t), x, y);
    g.fillStyle = "#b8a080";
    g.font = "10px Kanit, sans-serif";
    g.fillText(`${t.toFixed(1)} s`, x + 2, y + r.height + 10);
  }
  return out.toBuffer("image/png");
}

export interface VideoOptions {
  fps?: number;
  scale?: number;
  from?: number;
  to?: number;
}

/** GIF (palette, no dithering) or MP4 (H.264 yuv420p) through ffmpeg, frames streamed as raw RGBA. */
export async function renderVideo(root: string, cs: Cutscene, out: string, opts: VideoOptions = {}): Promise<{ file: string; frames: number; seconds: number; width: number; height: number }> {
  const ff = ffmpegPath();
  if (!ff) throw new Error("GIF / MP4 need ffmpeg on PATH (or EASYANIM_FFMPEG); PNG frames work without it");
  const fps = opts.fps ?? 12;
  const r = await renderer(root, cs, opts.scale ?? 2);
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(cs.duration, opts.to ?? cs.duration);
  const frames = Math.max(1, Math.round((to - from) * fps));
  const ext = path.extname(out).toLowerCase();
  await mkdir(path.dirname(out), { recursive: true });
  const args = ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${r.width}x${r.height}`, "-r", String(fps), "-i", "-"];
  if (ext === ".gif") args.push("-vf", "split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none", "-loop", "0", out);
  else if (ext === ".mp4") args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "veryfast", "-movflags", "+faststart", out);
  else if (ext === ".webm") args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", out);
  else throw new Error(`unsupported video extension ${ext} (use .gif, .mp4 or .webm)`);
  const proc = spawn(ff, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += String(d)));
  const done = new Promise<number>((resolve) => proc.on("close", (c) => resolve(c ?? 1)));
  for (let i = 0; i < frames; i++) {
    const buf = r.rgba(from + i / fps);
    if (!proc.stdin.write(buf)) await new Promise((res) => proc.stdin.once("drain", res));
  }
  proc.stdin.end();
  const code = await done;
  if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.trim()}`);
  return { file: out, frames, seconds: frames / fps, width: r.width, height: r.height };
}

export async function writePng(file: string, png: Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png);
}
