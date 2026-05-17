import { describe, expect, it } from 'vitest';

import { fentanylTimer, versedTimer } from './drug-timer';
import { DEFAULT_FORMULARY } from '../formulary/default';

describe('versedTimer', () => {
  it('is cooling for the first 3 minutes', () => {
    expect(versedTimer(0).state).toBe('cooling');
    expect(versedTimer(179).state).toBe('cooling');
    expect(versedTimer(179).remainingSec).toBe(1);
  });

  it('skips the ramping tier and is ready from 3 minutes onward', () => {
    // Default formulary sets versedReadyMin === versedMinWaitMin, so there
    // is no intermediate ramping window — cooling goes straight to ready.
    expect(versedTimer(180).state).toBe('ready');
    expect(versedTimer(180).remainingSec).toBe(0);
    expect(versedTimer(1000).state).toBe('ready');
  });

  it('clamps negative inputs to zero seconds elapsed', () => {
    expect(versedTimer(-100).state).toBe('cooling');
    expect(versedTimer(-100).elapsedSec).toBe(0);
  });

  it('still supports a ramping window when a formulary sets ready > min', () => {
    // Engine stays general: a custom practice formulary with a gap between
    // the safety wait and the ready window still tiers cooling→ramping→ready.
    const custom = { ...DEFAULT_FORMULARY.timings, versedMinWaitMin: 3, versedReadyMin: 5 };
    expect(versedTimer(180, custom).state).toBe('ramping');
    expect(versedTimer(300, custom).state).toBe('ready');
  });
});

describe('fentanylTimer', () => {
  it('is cooling before 5 minutes', () => {
    expect(fentanylTimer(0).state).toBe('cooling');
    expect(fentanylTimer(299).state).toBe('cooling');
  });

  it('skips the ramping tier and goes straight to ready at 5 minutes', () => {
    expect(fentanylTimer(300).state).toBe('ready');
    expect(fentanylTimer(600).state).toBe('ready');
  });
});
