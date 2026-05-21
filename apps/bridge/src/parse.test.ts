import { describe, it, expect } from 'vitest';
import { extractVitals, extractUnknownCodes } from './parse.js';

const SEP = '\r';

function build(segments: ReadonlyArray<string>): string {
  return segments.join(SEP);
}

describe('extractVitals — manufacturer-short codes (Edan-style)', () => {
  it('extracts HR, SpO2, NIBP, RESP, TEMP, EtCO2 from a single ORU message', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'PID|||12345^^^FAC^MR||DOE^JANE',
      'OBR|1|||VITALS^Vital Signs^EDAN|||20260521143205',
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min|60-100|N|||F',
      'OBX|2|NM|SpO2^Oxygen Saturation^EDAN||98|%|95-100|N|||F',
      'OBX|3|NM|NIBP_SYS^Systolic^EDAN||120|mmHg|90-140|N|||F',
      'OBX|4|NM|NIBP_DIA^Diastolic^EDAN||80|mmHg|60-90|N|||F',
      'OBX|5|NM|NIBP_MAP^Mean^EDAN||93|mmHg|70-110|N|||F',
      'OBX|6|NM|RESP^Respiration^EDAN||16|/min|12-20|N|||F',
      'OBX|7|NM|TEMP^Temperature^EDAN||37.0|degC||N|||F',
      'OBX|8|NM|EtCO2^End-Tidal CO2^EDAN||35|mmHg|35-45|N|||F',
    ]);
    const points = extractVitals(msg);
    const byVital = Object.fromEntries(points.map((p) => [p.vital, p]));
    expect(byVital['hr']?.value).toBe(72);
    expect(byVital['spo2']?.value).toBe(98);
    expect(byVital['sbp']?.value).toBe(120);
    expect(byVital['dbp']?.value).toBe(80);
    expect(byVital['map']?.value).toBe(93);
    expect(byVital['resp']?.value).toBe(16);
    expect(byVital['temp']?.value).toBe(37);
    expect(byVital['etco2']?.value).toBe(35);
  });

  it('falls back from OBX-14 → OBR-7 → MSH-7 for the timestamp', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143000||ORU^R01|0001|P|2.5',
      'PID|||12345^^^FAC^MR||DOE^JANE',
      'OBR|1|||VITALS|||20260521143010',
      // OBX has 14 fields; timestamp goes into OBX-14 (index 14 after segment name).
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min||N|||F|||20260521143020', // OBX-14 wins
      'OBX|2|NM|SpO2^Oxygen Saturation^EDAN||98|%||N|||F|||', // empty → OBR-7
    ]);
    const points = extractVitals(msg);
    const hr = points.find((p) => p.vital === 'hr')!;
    const spo2 = points.find((p) => p.vital === 'spo2')!;
    expect(hr.timestamp).toBe(Date.UTC(2026, 4, 21, 14, 30, 20));
    expect(spo2.timestamp).toBe(Date.UTC(2026, 4, 21, 14, 30, 10));
  });

  it('skips OBX with unrecognised codes (surfaces via extractUnknownCodes)', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min||N|||F',
      'OBX|2|NM|WEIRD_VAR^Weird Variable^EDAN||42|x||N|||F',
    ]);
    const points = extractVitals(msg);
    expect(points.map((p) => p.vital)).toEqual(['hr']);
  });
});

describe('extractVitals — LOINC + MDC coding fallback', () => {
  it('recognises LOINC codes for HR / SpO2 / sys BP / dia BP', () => {
    const msg = build([
      'MSH|^~\\&|MON|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|8867-4^Heart rate^LN||72|/min||N|||F',
      'OBX|2|NM|2708-6^Oxygen saturation^LN||98|%||N|||F',
      'OBX|3|NM|8480-6^Systolic BP^LN||120|mmHg||N|||F',
      'OBX|4|NM|8462-4^Diastolic BP^LN||80|mmHg||N|||F',
    ]);
    const points = extractVitals(msg);
    const vitals = points.map((p) => p.vital).sort();
    expect(vitals).toEqual(['dbp', 'hr', 'sbp', 'spo2']);
  });

  it('recognises MDC / ISO 11073 codes', () => {
    const msg = build([
      'MSH|^~\\&|MON|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|MDC_ECG_HEART_RATE^Heart Rate^MDC||72|/min||N|||F',
      'OBX|2|NM|MDC_PULS_OXIM_SAT_O2^SpO2^MDC||98|%||N|||F',
      'OBX|3|NM|MDC_PRESS_BLD_NONINV_SYS^Sys BP^MDC||120|mmHg||N|||F',
      'OBX|4|NM|MDC_AWAY_CO2_ET^EtCO2^MDC||35|mmHg||N|||F',
    ]);
    const points = extractVitals(msg);
    const vitals = points.map((p) => p.vital).sort();
    expect(vitals).toEqual(['etco2', 'hr', 'sbp', 'spo2']);
  });

  it('matches an alt-id LOINC sitting in OBX-3 component 4 if main identifier is unknown', () => {
    const msg = build([
      'MSH|^~\\&|MON|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|VENDOR_GARBLED_CODE^Heart Rate^L^8867-4^Heart rate^LN||72|/min||N|||F',
    ]);
    const points = extractVitals(msg);
    expect(points.map((p) => p.vital)).toEqual(['hr']);
  });
});

describe('extractVitals — edge cases', () => {
  it('returns an empty array when there are no recognised OBX segments', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'PID|||12345^^^FAC^MR',
    ]);
    expect(extractVitals(msg)).toEqual([]);
  });

  it('emits value=null when OBX-5 is empty (sample failed, monitor sent placeholder)', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|NIBP_SYS^Systolic^EDAN|||mmHg||N|||F',
    ]);
    const points = extractVitals(msg);
    expect(points).toHaveLength(1);
    expect(points[0]!.value).toBeNull();
  });

  it('skips messages with no parseable timestamp anywhere', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|||ORU^R01|0001|P|2.5',
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min||N|||F',
    ]);
    expect(extractVitals(msg)).toEqual([]);
  });
});

describe('extractUnknownCodes — debug surface', () => {
  it('surfaces only codes the dictionary did not recognise, deduped + sorted', () => {
    const m1 = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min||N|||F',
      'OBX|2|NM|MYSTERY_A^Mystery A^EDAN||10|x||N|||F',
    ]);
    const m2 = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143235||ORU^R01|0002|P|2.5',
      'OBX|1|NM|MYSTERY_B^Mystery B^EDAN||5|y||N|||F',
      'OBX|2|NM|MYSTERY_A^Mystery A^EDAN||11|x||N|||F',
    ]);
    const unknowns = extractUnknownCodes([m1, m2]);
    expect(unknowns.map((u) => u.code)).toEqual(['MYSTERY_A', 'MYSTERY_B']);
    expect(unknowns[0]!.text).toBe('Mystery A');
    expect(unknowns[0]!.sampleValue).toBe('10');
  });

  it('returns an empty list when every OBX is recognised', () => {
    const msg = build([
      'MSH|^~\\&|EDAN|FAC|BRIDGE|SEDPRO|20260521143205||ORU^R01|0001|P|2.5',
      'OBX|1|NM|HR^Heart Rate^EDAN||72|/min||N|||F',
      'OBX|2|NM|SpO2^Oxygen Saturation^EDAN||98|%||N|||F',
    ]);
    expect(extractUnknownCodes([msg])).toEqual([]);
  });
});
