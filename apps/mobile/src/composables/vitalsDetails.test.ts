import { describe, expect, it } from 'vitest';

import { vitalsDetails } from './vitalsDetails';

const FULL = {
  hr: 72,
  bpSys: 128,
  bpDia: 80,
  spo2: 98,
  etco2: 38,
  glucose: 110,
  diabetic: true,
  response: 'Alert',
};

describe('vitalsDetails', () => {
  it('formats every reading with its unit, in a fixed key order', () => {
    expect(vitalsDetails(FULL)).toEqual({
      HR: '72 bpm',
      BP: '128/80',
      SpO2: '98%',
      EtCO2: '38 mmHg',
      Glucose: '110 mg/dL',
      Response: 'Alert',
    });
    expect(Object.keys(vitalsDetails(FULL))).toEqual([
      'HR',
      'BP',
      'SpO2',
      'EtCO2',
      'Glucose',
      'Response',
    ]);
  });

  it('prints a dash for missing readings and for a half-entered BP', () => {
    const d = vitalsDetails({ ...FULL, hr: null, bpDia: null, spo2: null, etco2: null });
    expect(d.HR).toBe('—');
    expect(d.BP).toBe('—');
    expect(d.SpO2).toBe('—');
    expect(d.EtCO2).toBe('—');
  });

  it('omits glucose for a non-diabetic or when no reading was taken', () => {
    expect(vitalsDetails({ ...FULL, diabetic: false })).not.toHaveProperty('Glucose');
    expect(vitalsDetails({ ...FULL, glucose: null })).not.toHaveProperty('Glucose');
  });
});
