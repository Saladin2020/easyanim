// Types for easyanim-core.js (bundled from src/shared/evaluate.ts).
export const CPS: number;
export const FRAME: number;
export const FRAME_COLUMNS: readonly string[];
export const SIDE_ROWS: string[];
export const ANIMS: Record<string, { frames: string[]; fps: number; loop: boolean }>;
export function evaluate(cutscene: unknown, t: number): unknown;
export function actorsAt(cutscene: unknown, t: number): unknown[];
export function cuesBetween(cutscene: unknown, t0: number, t1: number): unknown[];
export function waitInputIn(cutscene: unknown, t0: number, t1: number): unknown;
export function safeCount(text: string, n: number): number;
export function ease(kind: unknown, k: number): number;
export function frameOf(anim: string, start: number, t: number): string;
export function columnOf(frame: string): number;
