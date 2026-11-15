import type { Cutscene, CutsceneDoc, Diagnostic } from "../../src/shared/types";

export interface CutsceneItem {
  id: string;
  th: string;
  en: string;
  tags: string[];
  duration: number;
  backdrop: string;
  actors: string[];
  events: number;
  source: "sample" | "workspace";
}

export interface WorkspaceSummary {
  root: string;
  cutscenes: CutsceneItem[];
  broken: Array<{ id: string; errors: Diagnostic[] }>;
  sprites: string[];
  trackOps: Record<string, string[]>;
  anims: string[];
  faces: string[];
  backdrops: string[];
  catalog: { sprites: string[]; fx: string[]; sfx: string[]; music: string[] };
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const fetchWorkspace = () => fetch("/api/workspace").then((r) => json<WorkspaceSummary>(r));
export const fetchCutscene = (id: string) => fetch(`/api/cutscenes/${id}`).then((r) => json<{ doc: CutsceneDoc; source: string; cutscene: Cutscene | null; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const saveCutscene = (id: string, doc: unknown) => post(`/api/cutscenes/${id}`, { doc }).then((r) => json<{ ok: boolean; file: string; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const exportCutscenes = (ids: string[] | undefined, preset: string) => post("/api/export", { ids, preset }).then((r) => json<{ dirs: string[]; files: number; warnings: string[] }>(r));

/** Load an image (sprite sheet or stage image) from the API. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}
