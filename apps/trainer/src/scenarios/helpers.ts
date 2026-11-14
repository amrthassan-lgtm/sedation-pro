import type { Ctx, DoseEvent, Target } from '@/engine/types';

/** A target the value drifts toward at `rate` units per second. */
export function toward(to: number, rate: number): Target {
  return { to, rate };
}

/** True for `seconds` after the action was last done. */
export function within(ctx: Ctx, action: string, seconds: number): boolean {
  const last = ctx.last(action);
  return last !== null && ctx.t - last <= seconds;
}

/**
 * The moment a running total of a drug first reached `thresholdMcg`, counting
 * only doses that pass `counts`. `null` if it never did.
 */
export function reachedAt(
  doses: ReadonlyArray<DoseEvent>,
  thresholdMcg: number,
  counts: (d: DoseEvent) => boolean = () => true,
): number | null {
  let sum = 0;
  for (const d of doses) {
    if (!counts(d)) continue;
    sum += d.mcg;
    // 1% slack: three 0.1 ml pulls must not fall a hair short of one 0.3 ml draw.
    if (sum >= thresholdMcg * 0.99) return d.t;
  }
  return null;
}
