import { ADAPTATION } from "./thresholds";

const FORBIDDEN = [
  /\bdementia\b/i,
  /\balzheimer'?s?\b/i,
  /\bdiagnos(is|e|ed|tic)\b/i,
  /\bcondition (has )?(worsen|declin|deteriorat)\w*/i,
  /\b(worsening|deteriorating|declining) (condition|health|cognition)\b/i,
  /\bhigh[- ]risk\b/i,
  /\bcognitive (decline|impairment)\b/i,
  /\bmedicine (must|should) be (changed|increased|reduced|stopped)\b/i,
  /\bchange (the |their |his |her )?(medication|medicine|dose|dosage)\b/i,
  /\bprescri(be|bed|ption)\b/i,
  /\bgame over\b/i,
  /\b(wrong|failed|failure|poor performance)\b/i,
  /\bpatient is (getting )?(worse|unwell|sick)\b/i,
  /\bmemory loss\b/i,
  /\bdisease\b/i,
];

export function isSafeText(text: string): boolean {
  return FORBIDDEN.every((pattern) => !pattern.test(text));
}

export function clampDifficulty(value: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : ADAPTATION.minDifficulty;
  return Math.max(ADAPTATION.minDifficulty, Math.min(ADAPTATION.maxDifficulty, n));
}

/** Difficulty never changes by more than one level at a time. */
export function clampStep(current: number, proposed: number): number {
  const bounded = clampDifficulty(proposed);
  const from = clampDifficulty(current);
  if (bounded > from + 1) return clampDifficulty(from + 1);
  if (bounded < from - 1) return clampDifficulty(from - 1);
  return bounded;
}

export function clampHintLevel(value: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.max(1, Math.min(ADAPTATION.maxHintLevel, n));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}
