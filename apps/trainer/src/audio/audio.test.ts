import { describe, expect, it } from 'vitest';

import { LEAD_SILENCE_SEC, LIMIT_BURST, URGENT_BURST, renderBurst } from './alarm';
import { spokenForm } from './voice';

describe('alarm tones', () => {
  it('start with silence, so the unlock play is inaudible', () => {
    const pcm = renderBurst(LIMIT_BURST);
    const lead = Math.floor(LEAD_SILENCE_SEC * 22_050);
    expect(pcm.subarray(0, lead).every((s) => s === 0)).toBe(true);
    expect(pcm.subarray(lead).some((s) => s !== 0)).toBe(true);
  });

  it('never clip', () => {
    for (const burst of [LIMIT_BURST, URGENT_BURST]) {
      const peak = renderBurst(burst).reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      expect(peak).toBeLessThanOrEqual(0x7fff * burst.peak + 1);
      expect(peak).toBeGreaterThan(0x7fff * burst.peak * 0.9);
    }
  });

  it('the urgent burst is distinguishable: more pulses than the limit burst', () => {
    expect(URGENT_BURST.pulses.length).toBeGreaterThan(LIMIT_BURST.pulses.length);
  });
});

describe('spoken lines', () => {
  it('says symbols and units the way the room does', () => {
    expect(spokenForm('Nitrous off. Oxygen at 100%.')).toBe('Nitrous off. Oxygen at 100%.');
    expect(spokenForm('911 is on the way.')).toBe('nine one one is on the way.');
    expect(spokenForm('Doc… look at his neck.')).toBe('Doc,  look at his neck.');
  });
});
