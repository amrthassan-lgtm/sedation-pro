import { describe, expect, it } from 'vitest';

import { pressureFell, pressureRange, readings } from './recorder';
import type { Sample } from './types';

const sample = (t: number, sbp: number): Sample => ({ t, spo2: 98, hr: 70, sbp });

describe('the pressure a debrief draws', () => {
  it('has no range before anything was recorded', () => {
    expect(pressureRange([])).toBeNull();
    expect(pressureFell([])).toBe(false);
  });

  it('is the run’s own lowest and highest systolic, in whole numbers', () => {
    expect(pressureRange([sample(0, 121.6), sample(5, 64.2), sample(9, 88)])).toEqual({
      low: 64,
      high: 122,
    });
  });

  it('is drawn once it has fallen far from where the scene opened', () => {
    expect(pressureFell([sample(0, 120), sample(60, 112)])).toBe(false);
    expect(pressureFell([sample(0, 120), sample(60, 100)])).toBe(true);
  });

  it('is left out of a run where it only rose', () => {
    expect(pressureFell([sample(0, 102), sample(60, 137), sample(90, 124)])).toBe(false);
  });

  it('has nothing to draw where he had no pulse: those samples are no reading at all', () => {
    const noPulse = (t: number, sbp: number): Sample => ({ ...sample(t, sbp), pulseless: true });
    const run = [sample(0, 130), noPulse(6, 40), noPulse(60, 12), sample(120, 118)];
    expect(readings(run).map((s) => s.t)).toEqual([0, 120]);
    expect(pressureRange(run)).toEqual({ low: 118, high: 130 });
    expect(pressureFell(run)).toBe(false);
    // A run that opened with no pulse is measured from its first reading.
    expect(pressureFell([noPulse(0, 0), sample(30, 120), sample(60, 96)])).toBe(true);
    expect(pressureRange([noPulse(0, 0)])).toBeNull();
  });
});
