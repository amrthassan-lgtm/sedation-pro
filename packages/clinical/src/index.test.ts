import { describe, expect, it } from 'vitest';

import {
  CLINICAL_LIB_VERSION,
  DEFAULT_FORMULARY,
  classifyBmi,
  classifyBp,
  classifyEncounter,
  classifySpo2,
  diazepamGate,
  ivSedationStatus,
  lastExamCutoffMonths,
  nicotineProtocol,
  phase1Completeness,
  releaseEligibility,
} from './index';

describe('@sedation-pro/clinical', () => {
  it('exports a semver-shaped version constant', () => {
    expect(CLINICAL_LIB_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('re-exports the engine surface from a single entry point', () => {
    // Smoke-test that every top-level export is reachable from src/index.ts.
    expect(DEFAULT_FORMULARY.iv).not.toHaveLength(0);
    expect(classifyBmi(22)).toBe('normal');
    expect(classifyBp(115, 75)?.category).toBe('normal');
    expect(classifySpo2(98)?.category).toBe('normal');
    expect(diazepamGate('none')).toBe('allow');
    expect(ivSedationStatus(0, 0).combined.severity).toBe('safe');
    expect(lastExamCutoffMonths(65)).toBe(6);
    expect(nicotineProtocol(15)?.hoursBefore).toBe(8);
    expect(phase1Completeness({ values: {} }).complete).toBe(false);
    expect(releaseEligibility({ now: Date.now() }).eligible).toBe(true);
    expect(releaseEligibility({ now: Date.now() }).reason).toBe('no-iv-sedative');
    expect(classifyEncounter({ oralPremedGiven: false, ivMedGiven: false })).toBe('assessment');
  });
});
