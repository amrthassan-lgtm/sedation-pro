import { describe, expect, it } from 'vitest';
import { EMERGENCY_PROTOCOLS } from '@sedation-pro/clinical';

import { protocolBarTitle, protocolShortName } from './protocolNames';

describe('protocol names where space is short', () => {
  it('drops the bracket or the dash part', () => {
    expect(protocolShortName('anaphylaxis')).toBe('Anaphylaxis');
    expect(protocolShortName('lma')).toBe('LMA');
    expect(protocolShortName('hypotension')).toBe('Hypotension');
  });

  it('keeps the full name when two protocols would read the same', () => {
    expect(protocolShortName('oversedation_opioid')).toBe('Oversedation (Opioid)');
    expect(protocolShortName('oversedation_benzo')).toBe('Oversedation (Benzodiazepine)');
  });

  it('never gives two protocols the same short name', () => {
    const names = EMERGENCY_PROTOCOLS.map((p) => protocolShortName(p.id));
    expect(new Set(names).size).toBe(names.length);
  });

  it('the top bar shows the name and the category under it, and nothing for an unknown id', () => {
    expect(protocolBarTitle('vfib_vtach')).toEqual({
      label: 'V-Fib / Pulseless V-Tach',
      sub: 'Cardiac · Arrest',
    });
    expect(protocolBarTitle('no-such-page')).toBeNull();
  });
});
