/**
 * Extract numeric vital values out of HL7 v2 ORU^R01 messages.
 *
 * Vital monitors don't agree on which coding system to use in OBX-3 (the
 * observation identifier). The three we see in the wild are:
 *
 *   - LOINC          e.g. "8867-4"                          (standard)
 *   - ISO/IEEE 11073 e.g. "MDC_ECG_HEART_RATE"              (device-class standard)
 *   - manufacturer   e.g. "HR" / "SpO2" / "NIBP_SYS"        (Edan, Philips, GE …)
 *
 * Rather than gamble on which one the X10 actually emits, the dictionary
 * below maps every common variant to the same normalized vital name. The
 * parser tries each OBX-3 component (identifier code, alt code, text
 * description) against the dictionary; the first match wins. Any OBX the
 * dictionary doesn't recognise is surfaced via `extractUnknownCodes()`
 * so the practice can see what their monitor is actually sending and we
 * extend the dictionary to match — no guessing.
 */

/** Normalized vital name — what consumers see, regardless of source coding. */
export type VitalName =
  | 'hr'
  | 'spo2'
  | 'sbp'
  | 'dbp'
  | 'map'
  | 'resp'
  | 'temp'
  | 'etco2'
  | 'ficO2'
  | 'pulse';

/**
 * Best-guess vocabulary mapping. Keys are OBX-3 codes the parser sees;
 * values are the normalized vital. The dictionary is intentionally
 * permissive — adding a synonym only helps and never miscategorises a
 * different vital because LOINC / MDC codes are globally unique.
 *
 * If your monitor sends a code not listed here, `extractUnknownCodes()`
 * will surface it on the bridge's debug endpoint; add a line and rebuild.
 */
const DICTIONARY: ReadonlyMap<string, VitalName> = new Map([
  // ----- Heart rate -----
  ['HR', 'hr'],
  ['ECG_HR', 'hr'],
  ['HEART_RATE', 'hr'],
  ['PULSE_RATE', 'pulse'], // peripheral pulse (often from SpO2 probe) — distinct from ECG HR
  ['PR', 'pulse'],
  ['8867-4', 'hr'], // LOINC: Heart rate
  ['MDC_ECG_HEART_RATE', 'hr'],
  ['MDC_PULS_RATE', 'pulse'],

  // ----- Oxygen saturation -----
  ['SpO2', 'spo2'],
  ['SPO2', 'spo2'],
  ['SAO2', 'spo2'],
  ['O2_SAT', 'spo2'],
  ['2708-6', 'spo2'], // LOINC: Oxygen saturation in Arterial blood
  ['59408-5', 'spo2'], // LOINC: Oxygen saturation in Arterial blood by Pulse oximetry
  ['MDC_PULS_OXIM_SAT_O2', 'spo2'],

  // ----- Non-invasive blood pressure -----
  ['NIBP_SYS', 'sbp'],
  ['NIBP_SYSTOLIC', 'sbp'],
  ['SYS', 'sbp'],
  ['NIBPS', 'sbp'],
  ['8480-6', 'sbp'], // LOINC: Systolic blood pressure
  ['MDC_PRESS_BLD_NONINV_SYS', 'sbp'],
  ['MDC_PRESS_CUFF_SYS', 'sbp'],

  ['NIBP_DIA', 'dbp'],
  ['NIBP_DIASTOLIC', 'dbp'],
  ['DIA', 'dbp'],
  ['NIBPD', 'dbp'],
  ['8462-4', 'dbp'], // LOINC: Diastolic blood pressure
  ['MDC_PRESS_BLD_NONINV_DIA', 'dbp'],
  ['MDC_PRESS_CUFF_DIA', 'dbp'],

  ['NIBP_MAP', 'map'],
  ['NIBP_MEAN', 'map'],
  ['MAP', 'map'],
  ['NIBPM', 'map'],
  ['8478-0', 'map'], // LOINC: Mean blood pressure
  ['MDC_PRESS_BLD_NONINV_MEAN', 'map'],
  ['MDC_PRESS_CUFF_MEAN', 'map'],

  // ----- Respiratory rate -----
  ['RR', 'resp'],
  ['RESP', 'resp'],
  ['RESP_RATE', 'resp'],
  ['9279-1', 'resp'], // LOINC: Respiratory rate
  ['MDC_RESP_RATE', 'resp'],
  ['MDC_TTHOR_RESP_RATE', 'resp'],

  // ----- Temperature -----
  ['TEMP', 'temp'],
  ['T1', 'temp'],
  ['BODY_TEMP', 'temp'],
  ['8310-5', 'temp'], // LOINC: Body temperature
  ['MDC_TEMP', 'temp'],
  ['MDC_TEMP_BODY', 'temp'],
  ['MDC_TEMP_TYMP', 'temp'],

  // ----- End-tidal / inspired CO2 -----
  ['EtCO2', 'etco2'],
  ['ETCO2', 'etco2'],
  ['CO2_ET', 'etco2'],
  ['19891-4', 'etco2'], // LOINC: End tidal CO2
  ['MDC_AWAY_CO2_ET', 'etco2'],

  ['FiCO2', 'ficO2'],
  ['FICO2', 'ficO2'],
  ['CO2_FI', 'ficO2'],
  ['MDC_AWAY_CO2_INSP', 'ficO2'],
]);

/** One sampled vital point. `timestamp` is epoch ms; null `value` is rare
 *  but legal (e.g. NIBP sample failed, monitor returned an empty OBX-5). */
export interface VitalPoint {
  readonly timestamp: number;
  readonly vital: VitalName;
  readonly value: number | null;
  readonly unit: string;
}

const SEGMENT_SEP = '\r';

/**
 * Try to map an OBX-3 component to a normalized vital name. OBX-3 is a CE
 * (coded element) with up to three sub-components separated by `^`:
 *   identifier ^ text ^ name-of-coding-system [ ^ alt-id ^ alt-text ^ alt-system ]
 * We try all of them against the dictionary so a monitor that quotes a
 * LOINC code in the alt-id position still matches.
 */
function normaliseVital(obx3: string): VitalName | null {
  const components = obx3.split('^');
  for (const c of components) {
    const trimmed = c.trim();
    if (trimmed === '') continue;
    const hit = DICTIONARY.get(trimmed);
    if (hit !== undefined) return hit;
  }
  return null;
}

/**
 * Parse `YYYYMMDDHHMMSS[.sss][±zzzz]` HL7 timestamp into epoch ms. Returns
 * null when the input is empty or malformed. Bridge falls back to the
 * MSH-7 (message timestamp) when OBR/OBX timestamps are missing.
 */
function parseHl7Timestamp(s: string): number | null {
  const cleaned = s.trim();
  if (cleaned.length < 8) return null;
  const y = Number(cleaned.slice(0, 4));
  const mo = Number(cleaned.slice(4, 6));
  const d = Number(cleaned.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const h = cleaned.length >= 10 ? Number(cleaned.slice(8, 10)) : 0;
  const mi = cleaned.length >= 12 ? Number(cleaned.slice(10, 12)) : 0;
  const sec = cleaned.length >= 14 ? Number(cleaned.slice(12, 14)) : 0;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  const t = date.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Pull each OBX out of a single HL7 message and emit one VitalPoint per
 * recognised observation. Message timestamp falls back through OBX-14 →
 * OBR-7 → MSH-7 in that order (newest-to-oldest authority).
 */
export function extractVitals(message: string): VitalPoint[] {
  const segments = message.split(SEGMENT_SEP);
  let mshTimestamp: number | null = null;
  let obrTimestamp: number | null = null;

  for (const seg of segments) {
    if (seg.startsWith('MSH|')) {
      const fields = seg.split('|');
      mshTimestamp = parseHl7Timestamp(fields[6] ?? '');
    } else if (seg.startsWith('OBR|')) {
      const fields = seg.split('|');
      obrTimestamp = parseHl7Timestamp(fields[7] ?? '');
    }
  }

  const points: VitalPoint[] = [];
  for (const seg of segments) {
    if (!seg.startsWith('OBX|')) continue;
    const fields = seg.split('|');
    // OBX-3 identifier, OBX-5 value, OBX-6 units, OBX-14 observation datetime
    const obx3 = fields[3] ?? '';
    const valueRaw = (fields[5] ?? '').trim();
    const unit = (fields[6] ?? '').trim();
    const obx14 = fields[14] ?? '';

    const vital = normaliseVital(obx3);
    if (vital === null) continue;

    const value = valueRaw === '' ? null : Number(valueRaw);
    const ts = parseHl7Timestamp(obx14) ?? obrTimestamp ?? mshTimestamp ?? Number.NaN;
    if (!Number.isFinite(ts)) continue;

    points.push({
      timestamp: ts,
      vital,
      value: Number.isFinite(value as number) ? (value as number) : null,
      unit,
    });
  }
  return points;
}

/**
 * Return every distinct OBX-3 *identifier* code seen across `messages`,
 * along with one example value + unit. Used by the bridge's debug
 * endpoint so a new practice can see exactly which codes their monitor
 * is sending and we can extend the dictionary if anything's missing.
 *
 * The first component of OBX-3 is the canonical identifier; alt codes
 * are listed separately so a LOINC/MDC alt-code stays visible.
 */
export interface UnknownCode {
  readonly code: string;
  readonly text: string;
  readonly unit: string;
  readonly sampleValue: string;
}

export function extractUnknownCodes(messages: ReadonlyArray<string>): UnknownCode[] {
  const seen = new Map<string, UnknownCode>();
  for (const message of messages) {
    for (const seg of message.split(SEGMENT_SEP)) {
      if (!seg.startsWith('OBX|')) continue;
      const fields = seg.split('|');
      const obx3 = fields[3] ?? '';
      if (normaliseVital(obx3) !== null) continue;
      const [code, text] = obx3.split('^');
      const key = (code ?? '').trim();
      if (key === '' || seen.has(key)) continue;
      seen.set(key, {
        code: key,
        text: (text ?? '').trim(),
        unit: (fields[6] ?? '').trim(),
        sampleValue: (fields[5] ?? '').trim(),
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.code.localeCompare(b.code));
}
