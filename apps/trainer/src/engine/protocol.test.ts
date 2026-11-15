import { describe, expect, it } from 'vitest';

import {
  administrations,
  calloutAt,
  doseRangeOf,
  gaveProtocolDose,
  minutesInStep,
  numberInStep,
  overProtocolDose,
} from './protocol';
import type { DoseEvent } from './types';

const NALOXONE = calloutAt('oversedation_opioid', 'Naloxone IV');
const AMPULE = calloutAt('anaphylaxis', 'second IM dose from the ampule');

function dose(t: number, mcg: number, route: DoseEvent['route'] = 'IV'): DoseEvent {
  return {
    t,
    phase: 'a',
    drugKey: 'x',
    drugName: 'X',
    mcg,
    ml: 1,
    route,
    mcgPerMl: mcg,
    syringeMl: 3,
    labeled: true,
    device: null,
  };
}

describe('reading a protocol callout', () => {
  it('fails loudly when the step is gone or its dose is not a mass', () => {
    expect(() => calloutAt('anaphylaxis', 'no such step')).toThrow();
    expect(() => doseRangeOf(calloutAt('anaphylaxis', 'Albuterol (if wheezing)'))).toThrow();
  });

  it('reads a wait from the step that states it, and throws when the words change', () => {
    expect(minutesInStep('anaphylaxis', 'second IM dose', /(\d+) min, not better/)).toBe(5);
    expect(() => minutesInStep('anaphylaxis', 'second IM dose', /(\d+) hours/)).toThrow();
  });

  it('reads a threshold from the step that states it, and throws when the words change', () => {
    expect(numberInStep('bronchospasm', 'Auvi-Q 0.3 first', /SpO₂ under (\d+)%/)).toBe(92);
    expect(() => numberInStep('bronchospasm', 'Auvi-Q 0.3 first', /SpO₂ over (\d+)%/)).toThrow();
  });
});

describe('grading doses against a callout', () => {
  it('accepts the whole protocol range, not one magic number', () => {
    expect(gaveProtocolDose(NALOXONE, [dose(0, 400)])).toBe(true);
    expect(gaveProtocolDose(NALOXONE, [dose(0, 2_000)])).toBe(true);
    expect(gaveProtocolDose(NALOXONE, [dose(0, 200)])).toBe(false);
    expect(gaveProtocolDose(NALOXONE, [dose(0, 2_400)])).toBe(false);
    expect(gaveProtocolDose(NALOXONE, [])).toBe(false);
  });

  it('tolerates float noise from repeated draws', () => {
    const noisy = 0.1 * 3 * 1_000 * 0.4; // 0.30000000000000004 ml of 0.4 mg/ml
    expect(gaveProtocolDose(NALOXONE, [dose(0, 400 + (noisy - 120))])).toBe(true);
  });

  it('counts only the protocol route', () => {
    expect(gaveProtocolDose(NALOXONE, [dose(0, 400, 'IM')])).toBe(false);
    expect(gaveProtocolDose(AMPULE, [dose(0, 300, 'IM')])).toBe(true);
  });

  it('adds up pushes given back to back, as one administration', () => {
    expect(administrations([dose(10, 200), dose(20, 200)])).toEqual([{ t: 10, mcg: 400 }]);
    expect(gaveProtocolDose(NALOXONE, [dose(10, 200), dose(20, 200)])).toBe(true);
    // 0.3 mg and 0.3 mg in the same minute is 0.6 mg at once: over the ampule dose.
    expect(gaveProtocolDose(AMPULE, [dose(0, 300, 'IM'), dose(30, 300, 'IM')])).toBe(false);
  });

  it('a repeat the protocol allows later is judged on its own, not as an overdose', () => {
    const repeat = [dose(0, 300, 'IM'), dose(300, 300, 'IM')];
    expect(administrations(repeat)).toHaveLength(2);
    expect(gaveProtocolDose(AMPULE, repeat)).toBe(true);
    expect(gaveProtocolDose(AMPULE, [dose(0, 300, 'IM'), dose(300, 3_000, 'IM')])).toBe(false);
  });

  it('says when one administration is over the callout', () => {
    expect(overProtocolDose(AMPULE, 500)).toBe(false);
    expect(overProtocolDose(AMPULE, 3_000)).toBe(true);
  });
});
