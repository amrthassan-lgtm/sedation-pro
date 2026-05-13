import { describe, expect, it } from 'vitest';

import { premedWait, releaseEligibility } from './release-eligibility';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('releaseEligibility', () => {
  it('blocks release when no medication has been given', () => {
    const r = releaseEligibility({ now: T0 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('no-medication-given');
  });

  it('requires a 20-minute wait after last IV medication by default', () => {
    const r = releaseEligibility({ lastMedicationAt: T0, now: T0 + 10 * MIN });
    expect(r.eligible).toBe(false);
    expect(r.waitMin).toBe(20);
    expect(r.reason).toBe('standard');
    expect(r.remainingMin).toBe(10);
  });

  it('becomes eligible exactly at the 20-minute boundary', () => {
    const r = releaseEligibility({ lastMedicationAt: T0, now: T0 + 20 * MIN });
    expect(r.eligible).toBe(true);
    expect(r.remainingMin).toBe(0);
  });

  it('extends the wait to 120 minutes when flumazenil was given', () => {
    const r = releaseEligibility({
      lastMedicationAt: T0,
      lastFlumazenilAt: T0 + 5 * MIN,
      now: T0 + 30 * MIN,
    });
    expect(r.reason).toBe('flumazenil-reversal');
    expect(r.waitMin).toBe(120);
    expect(r.eligible).toBe(false);
  });

  it('anchors the flumazenil wait on the reversal timestamp, not the last med', () => {
    // Last med at T0, flumazenil at T0+5min — release eligible at T0+125min.
    const before = releaseEligibility({
      lastMedicationAt: T0,
      lastFlumazenilAt: T0 + 5 * MIN,
      now: T0 + 124 * MIN,
    });
    const after = releaseEligibility({
      lastMedicationAt: T0,
      lastFlumazenilAt: T0 + 5 * MIN,
      now: T0 + 125 * MIN,
    });
    expect(before.eligible).toBe(false);
    expect(after.eligible).toBe(true);
  });

  it('honours a custom flumazenil wait window', () => {
    const r = releaseEligibility(
      { lastMedicationAt: T0, lastFlumazenilAt: T0, now: T0 + 60 * MIN },
      {
        versedMinWaitMin: 3,
        versedReadyMin: 5,
        fentanylMinWaitMin: 5,
        premedWaitMin: 30,
        releaseWaitMin: 20,
        flumazenilDischargeWaitMin: 60,
      },
    );
    expect(r.eligible).toBe(true);
    expect(r.waitMin).toBe(60);
  });
});

describe('premedWait', () => {
  it('is eligible when no pre-med was given', () => {
    const r = premedWait({ now: T0 });
    expect(r.eligible).toBe(true);
    expect(r.remainingMin).toBe(0);
  });

  it('blocks IV start for 30 minutes after a pre-med', () => {
    const r = premedWait({ lastPremedAt: T0, now: T0 + 15 * MIN });
    expect(r.eligible).toBe(false);
    expect(r.remainingMin).toBe(15);
  });

  it('clears at the 30-minute boundary', () => {
    const r = premedWait({ lastPremedAt: T0, now: T0 + 30 * MIN });
    expect(r.eligible).toBe(true);
  });
});
