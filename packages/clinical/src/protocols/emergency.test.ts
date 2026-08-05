import { describe, expect, it } from 'vitest';

import {
  CRITICAL_PROTOCOL_IDS,
  EMERGENCY_PROTOCOLS,
  findProtocol,
  protocolsByCategory,
} from './emergency';

describe('emergency protocols', () => {
  it('every CRITICAL_PROTOCOL_IDS entry resolves to a protocol flagged critical', () => {
    for (const id of CRITICAL_PROTOCOL_IDS) {
      const proto = findProtocol(id);
      expect(proto, `missing protocol ${id}`).toBeDefined();
      expect(proto?.critical).toBe(true);
    }
  });

  it('findProtocol returns undefined for unknown ids', () => {
    expect(findProtocol('does-not-exist')).toBeUndefined();
  });

  it('protocolsByCategory partitions the library without dropping any protocol', () => {
    const categories = [
      'airway',
      'cardiac-ischemia',
      'cardiac-arrhythmia',
      'cardiac-arrest',
      'allergic',
      'neurological',
      'other',
    ] as const;
    const total = categories.reduce((acc, c) => acc + protocolsByCategory(c).length, 0);
    expect(total).toBe(EMERGENCY_PROTOCOLS.length);
  });

  it('every protocol has at least one step and a non-empty summary', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      expect(proto.steps.length).toBeGreaterThan(0);
      expect(proto.summary.length).toBeGreaterThan(0);
    }
  });

  it('relatedProtocols ids all resolve', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      for (const relId of proto.relatedProtocols ?? []) {
        expect(findProtocol(relId), `${proto.id} → ${relId}`).toBeDefined();
      }
    }
  });

  it('both hypertension protocols carry hydralazine as a second-line callout', () => {
    for (const id of ['hypertension', 'hypertensive_crisis']) {
      const proto = findProtocol(id);
      const hydralazine = proto?.steps.find((s) => s.drug?.name === 'Hydralazine');
      expect(hydralazine, `${id} missing hydralazine`).toBeDefined();
      expect(hydralazine?.drug?.concentration).toBe('20 mg/ml');
    }
  });

  it('dexamethasone callouts quote volumes for both stocked concentrations', () => {
    const dexCallouts = EMERGENCY_PROTOCOLS.flatMap((p) => p.steps)
      .map((s) => s.drug)
      .filter((d) => d?.name === 'Dexamethasone');
    expect(dexCallouts.length).toBeGreaterThan(0);
    for (const callout of dexCallouts) {
      expect(callout?.concentration).toContain('4 mg/ml');
      expect(callout?.concentration).toContain('10 mg/ml');
    }
  });
});
