/**
 * The chrono-log row for a vitals stamp (pre-op, sedation level, recovery).
 * One builder so the three stamps can never drift in how they print a
 * missing value, a BP pair or the diabetic-only glucose line.
 */
export interface VitalsReading {
  readonly hr: number | null;
  readonly bpSys: number | null;
  readonly bpDia: number | null;
  readonly spo2: number | null;
  readonly etco2: number | null;
  readonly glucose: number | null;
  readonly diabetic: boolean;
  readonly response: string;
}

export function vitalsDetails(v: VitalsReading): Record<string, string> {
  return {
    HR: v.hr !== null ? `${v.hr} bpm` : '—',
    BP: v.bpSys !== null && v.bpDia !== null ? `${v.bpSys}/${v.bpDia}` : '—',
    SpO2: v.spo2 !== null ? `${v.spo2}%` : '—',
    EtCO2: v.etco2 !== null ? `${v.etco2} mmHg` : '—',
    ...(v.diabetic && v.glucose !== null ? { Glucose: `${v.glucose} mg/dL` } : {}),
    Response: v.response,
  };
}
