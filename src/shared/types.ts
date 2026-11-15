/** Easy Anim shared types: the `easyanim/1` cutscene format. Pure data, usable in Node, the browser and the runtimes. */

export const FORMAT = "easyanim/1";

/** Easy Sprite side-view facings (row order of a native side sheet). */
export const FACES = ["right", "left", "front"] as const;
export type Face = (typeof FACES)[number];

export const EASES = ["linear", "in", "out", "inOut"] as const;
export type Ease = (typeof EASES)[number];

export const BACKDROPS = ["village_morning", "raya_house", "river_night", "plain"] as const;
export type BackdropId = (typeof BACKDROPS)[number];

/** Track → ops it accepts. */
export const TRACK_OPS = {
  actor: ["move", "face", "anim", "show", "hide"],
  camera: ["pan", "zoom", "shake"],
  dialogue: ["line"],
  fx: ["spawn"],
  audio: ["sfx", "music", "music_stop"],
  screen: ["fade", "wait", "wait_input"],
} as const;
export type Track = keyof typeof TRACK_OPS;
export const TRACKS = Object.keys(TRACK_OPS) as Track[];

export type Vec = [number, number];

export interface Stage {
  /** Viewport in pixels (default 320×180). */
  width: number;
  height: number;
  /** World size; the camera stays inside it (default = viewport). */
  worldWidth: number;
  worldHeight: number;
  /** Procedural backdrop id, or `plain` with `color`. */
  backdrop: BackdropId;
  /** Optional workspace image (PNG) used instead of the procedural backdrop. */
  image?: string;
  color: string;
  /** Ground line in world pixels: actors stand on y (their feet). */
  ground: number;
  /** Initial camera centre and zoom. */
  camera: { x: number; y: number; zoom: number };
}

export interface Actor {
  id: string;
  /** Easy Sprite side-view sheet id (e.g. side_hijab_teacher). Missing sheets render as a placeholder. */
  sprite: string;
  name?: { th?: string; en?: string };
  /** Placeholder colours when no Easy Sprite sheet is present. */
  colors?: { skin?: string; hair?: string; top?: string; bottom?: string };
  x: number;
  y: number;
  face: Face;
  anim: string;
  visible: boolean;
}

interface Base {
  /** Start time in seconds. */
  t: number;
  /** Optional note shown in the editor. */
  note?: string;
}

export type CutsceneEvent =
  | (Base & { track: "actor"; op: "move"; actor: string; to: Vec; dur?: number; anim?: string; ease?: Ease; face?: Face })
  | (Base & { track: "actor"; op: "face"; actor: string; dir: Face })
  | (Base & { track: "actor"; op: "anim"; actor: string; anim: string; dur?: number })
  | (Base & { track: "actor"; op: "show" | "hide"; actor: string })
  | (Base & { track: "camera"; op: "pan"; to: Vec; dur?: number; ease?: Ease })
  | (Base & { track: "camera"; op: "zoom"; to: number; dur?: number; ease?: Ease })
  | (Base & { track: "camera"; op: "shake"; dur?: number; amp?: number })
  | (Base & { track: "dialogue"; op: "line"; speaker?: string | null; th?: string; en?: string; ref?: string; dur?: number })
  | (Base & { track: "fx"; op: "spawn"; fx: string; at?: Vec; actor?: string; offset?: Vec; dur?: number })
  | (Base & { track: "audio"; op: "sfx"; sfx: string })
  | (Base & { track: "audio"; op: "music"; music: string; fade?: number })
  | (Base & { track: "audio"; op: "music_stop"; fade?: number })
  | (Base & { track: "screen"; op: "fade"; to: number; dur?: number; color?: string })
  | (Base & { track: "screen"; op: "wait"; dur: number })
  | (Base & { track: "screen"; op: "wait_input"; dur?: number });

/** Workspace / sample file `cutscenes/<id>.easyanim.json`. Stage fields are optional (defaults filled). */
export interface CutsceneDoc {
  format: typeof FORMAT;
  th?: string;
  en?: string;
  tags?: string[];
  lang?: "th" | "en";
  stage?: Partial<Stage>;
  actors: Array<Partial<Actor> & { id: string; sprite: string }>;
  events: CutsceneEvent[];
}

/** Every default filled in, events sorted by time (stable), every `dur` explicit. Runtimes read this shape. */
export interface NormalEvent {
  i: number;
  t: number;
  dur: number;
  track: Track;
  op: string;
  [k: string]: unknown;
}

export interface Cutscene {
  format: typeof FORMAT;
  id: string;
  th: string;
  en: string;
  tags: string[];
  lang: "th" | "en";
  duration: number;
  stage: Stage;
  actors: Actor[];
  events: NormalEvent[];
}

export interface Diagnostic {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export const EXPORT_PRESETS = ["godot", "pixi", "video", "json", "all"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];
