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
});
