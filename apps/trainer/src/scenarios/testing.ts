import type { Simulation } from '@/engine/engine';
import type { SyringeSize } from '@/engine/syringe';

/** Test helpers: play a scenario the way a player would, without a browser. */

export function advance(sim: Simulation, seconds: number): void {
  for (let i = 0; i < seconds * 4 && !sim.ending; i += 1) sim.tick(0.25);
}

/** Run until the sim is in `phase` (or has ended). Returns false on timeout. */
export function until(sim: Simulation, phase: string, maxSeconds = 600): boolean {
  for (let i = 0; i < maxSeconds * 4; i += 1) {
    if (sim.phase === phase || sim.ending) return sim.phase === phase;
    sim.tick(0.25);
  }
  return false;
}

export function untilEnd(sim: Simulation, maxSeconds = 1200): boolean {
  for (let i = 0; i < maxSeconds * 4 && !sim.ending; i += 1) sim.tick(0.25);
  return sim.ending !== null;
}

export function drawAndGive(
  sim: Simulation,
  vialKey: string,
  ml: number,
  options: { size?: SyringeSize; route?: 'IV' | 'IM'; label?: boolean } = {},
): void {
  const id = sim.pickUpSyringe(options.size ?? 3);
  sim.drawFromVial(id, vialKey, ml);
  if (options.label ?? true) sim.labelSyringe(id);
  sim.give(id, ml, options.route ?? 'IV');
}
