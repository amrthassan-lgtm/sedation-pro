import { describe, expect, it } from 'vitest';

import { fentanylTimer, versedTimer } from './drug-timer';

describe('versedTimer', () => {
  it('is cooling for the first 3 minutes', () => {
    expect(versedTimer(0).state).toBe('cooling');
    expect(versedTimer(179).state).toBe('cooling');
    expect(versedTimer(179).remainingSec).toBe(1);
  });

  it('is ramping between 3 and 5 minutes', () => {
    expect(versedTimer(180).state).toBe('ramping');
    expect(versedTimer(180).remainingSec).toBe(120);
    expect(versedTimer(299).state).toBe('ramping');
  });

  it('is ready from 5 minutes onward', () => {
    expect(versedTimer(300).state).toBe('ready');
    expect(versedTimer(1000).state).toBe('ready');
    expect(versedTimer(300).remainingSec).toBe(0);
  });

  it('clamps negative inputs to zero seconds elapsed', () => {
    expect(versedTimer(-100).state).toBe('cooling');
    expect(versedTimer(-100).elapsedSec).toBe(0);
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
