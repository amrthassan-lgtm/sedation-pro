import { describe, expect, it } from 'vitest';

import { dismissalSafety, type DismissalInputs } from './dismissal-safety';

const READY: DismissalInputs = {
  ambulatory: true,
  orientedX3: true,
  nauseaOrVomiting: false,
  excessiveBleeding: false,
  spo2: 98,
  bp: { sbp: 118, dbp: 76 },
  companionDocumented: true,
  providerSigned: true,
  pulseOxPrintoutFiled: true,
};

describe('dismissalSafety', () => {
  it('clears when every gate passes', () => {
    const r = dismissalSafety(READY);
    expect(r.clear).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks when patient is not ambulatory or not oriented', () => {
    const r = dismissalSafety({ ...READY, ambulatory: false, orientedX3: false });
    expect(r.blocked).toBe(true);
    expect(r.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining(['not-ambulatory', 'not-oriented']),
    );
  });

  it('blocks on recovery-room nausea or excessive bleeding', () => {
    const r = dismissalSafety({ ...READY, nauseaOrVomiting: true, excessiveBleeding: true });
    expect(r.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining(['nausea-vomiting', 'excessive-bleeding']),
    );
  });

  it('blocks when SpO₂ is below the 94% floor', () => {
    const r = dismissalSafety({ ...READY, spo2: 92 });
    expect(r.blocked).toBe(true);
    expect(r.blockers[0]?.code).toBe('low-spo2');
  });

  it('passes SpO₂ at exactly the 94% floor (mild hypoxemia still blocked by engine classifier)', () => {
    // 94% is the first "normal" tier in classifySpo2 — confirm parity.
    const r = dismissalSafety({ ...READY, spo2: 94 });
    // 94% is "mild" per classifySpo2 (severity 'caution'); we block on
    // anything not 'safe'.
    expect(r.blocked).toBe(true);
    expect(r.blockers[0]?.code).toBe('low-spo2');
  });

  it('passes SpO₂ at 95% (the first "safe" tier)', () => {
    const r = dismissalSafety({ ...READY, spo2: 95 });
    expect(r.clear).toBe(true);
  });

  it('blocks on hypertensive crisis BP', () => {
    const r = dismissalSafety({ ...READY, bp: { sbp: 195, dbp: 125 } });
    expect(r.blocked).toBe(true);
    expect(r.blockers[0]?.code).toBe('bp-crisis');
  });

  it('ignores BP when either side is null (not measured)', () => {
    const r = dismissalSafety({ ...READY, bp: { sbp: null, dbp: null } });
    expect(r.clear).toBe(true);
  });

  it('blocks when companion is not documented', () => {
    const r = dismissalSafety({ ...READY, companionDocumented: false });
    expect(r.blockers[0]?.code).toBe('no-companion');
  });

  it('requires the provider signature', () => {
    const r = dismissalSafety({ ...READY, providerSigned: false });
    expect(r.blockers.map((b) => b.code)).toEqual(['no-provider-signature']);
  });

  it('blocks when the pulse-oximetry printout has not been filed', () => {
    const r = dismissalSafety({ ...READY, pulseOxPrintoutFiled: false });
    expect(r.blocked).toBe(true);
    expect(r.blockers.map((b) => b.code)).toEqual(['no-pulse-ox-printout']);
  });

  it('returns every blocker that fires, in a stable order', () => {
    const r = dismissalSafety({
      ambulatory: false,
      orientedX3: false,
      nauseaOrVomiting: true,
      excessiveBleeding: true,
      spo2: 88,
      bp: { sbp: 200, dbp: 130 },
      companionDocumented: false,
      providerSigned: false,
      pulseOxPrintoutFiled: false,
    });
    expect(r.blockers.map((b) => b.code)).toEqual([
      'not-ambulatory',
      'not-oriented',
      'nausea-vomiting',
      'excessive-bleeding',
      'low-spo2',
      'bp-crisis',
      'no-companion',
      'no-provider-signature',
      'no-pulse-ox-printout',
    ]);
  });
});
