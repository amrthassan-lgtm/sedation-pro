import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { useEventLogStore, type LogEvent } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useLocalAnestheticStore } from '@/stores/local';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { localCombined } from '@sedation-pro/clinical';

/** Single row in the chronological table of the printable note. */
export interface ClinicalNoteRow {
  readonly time: string;
  readonly event: string;
  readonly detail: string;
}

export interface ClinicalNoteSection {
  readonly heading: string;
  readonly rows: ReadonlyArray<readonly [string, string]>;
}

export interface ClinicalNote {
  readonly header: {
    readonly patient: string;
    readonly mrn: string;
    readonly date: string;
    readonly provider: string;
    readonly procedure: string;
  };
  readonly sections: ReadonlyArray<ClinicalNoteSection>;
  readonly chronology: ReadonlyArray<ClinicalNoteRow>;
  readonly signatures: {
    readonly providerDataUrl: string | null;
    readonly companionDataUrl: string | null;
    readonly companion: string;
    readonly signedAt: string | null;
  };
  /** ISO date string of when the note was rendered — printed in the footer. */
  readonly generatedAt: string;
}

function fmtClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDetail(details: Readonly<Record<string, string>>): string {
  const entries = Object.entries(details).filter(([, v]) => v && v !== '—');
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
}

/**
 * Compose the clinical note from every store. Returns a structured shape the
 * view renders; the same shape is the seam for future PDF generation.
 *
 * The note is *derived* — never mutates store state, never reads twice from
 * the DOM. Same data object feeds the in-app preview and any downstream
 * print / share / export.
 */
export function useClinicalNote(): ComputedRef<ClinicalNote> {
  const patient = usePatientStore();
  const iv = useIVStore();
  const local = useLocalAnestheticStore();
  const recovery = useRecoveryStore();
  const eventLog = useEventLogStore();

  const { events } = storeToRefs(eventLog);

  return computed<ClinicalNote>(() => {
    const date = patient.lastExamDate
      ? fmtDate(patient.lastExamDate)
      : new Date().toLocaleDateString();

    // Pre-sedation summary
    const preSedation: Array<readonly [string, string]> = [
      ['Name', patient.name || '—'],
      ['MRN', patient.mrn || '—'],
      ['Age', patient.age !== null ? `${patient.age} years` : '—'],
      [
        'Weight / Height',
        patient.weightLb !== null && patient.heightIn !== null
          ? `${patient.weightLb} lb · ${patient.heightIn} in`
          : '—',
      ],
      ['BMI', patient.bmi ? `${patient.bmi.value.toFixed(1)} (${patient.bmi.category})` : '—'],
      ['ASA classification', patient.asaClass || '—'],
      ['Mallampati score', patient.mallampati || '—'],
      ['OSA / CPAP history', patient.osaStatus || '—'],
      ['Smoking status', patient.smokingStatus || '—'],
      [
        'Baseline BP',
        patient.baselineBp.sbp !== null && patient.baselineBp.dbp !== null
          ? `${patient.baselineBp.sbp}/${patient.baselineBp.dbp} mmHg`
          : '—',
      ],
      [
        'Diabetic',
        patient.diabetic
          ? patient.baselineGlucose
            ? `Yes — baseline glucose ${patient.baselineGlucose} mg/dL`
            : 'Yes'
          : 'No',
      ],
      ['Drug-interaction check (Epocrates)', patient.medsVerified ? 'Verified' : '—'],
      ['NPO confirmed', patient.npoConfirmed ? 'Yes (≥6h solids / ≥2h liquids)' : '—'],
    ];

    // IV sedation totals
    const ivRows: Array<readonly [string, string]> = [];
    if (iv.versedTotalMg > 0)
      ivRows.push(['Midazolam (Versed)', `${iv.versedTotalMg.toFixed(1)} mg IV`]);
    if (iv.fentanylTotalMcg > 0)
      ivRows.push(['Fentanyl', `${iv.fentanylTotalMcg.toFixed(0)} mcg IV`]);
    if (iv.zofranTotalMg > 0)
      ivRows.push(['Ondansetron (Zofran)', `${iv.zofranTotalMg.toFixed(0)} mg IV`]);
    const flumazenilTotal = iv.doses
      .filter((d) => d.drug === 'flumazenil')
      .reduce((sum, d) => sum + (d.mg ?? 0), 0);
    const naloxoneTotal = iv.doses
      .filter((d) => d.drug === 'naloxone')
      .reduce((sum, d) => sum + (d.mg ?? 0), 0);
    if (flumazenilTotal > 0)
      ivRows.push(['Flumazenil (reversal)', `${flumazenilTotal.toFixed(1)} mg IV`]);
    if (naloxoneTotal > 0)
      ivRows.push(['Naloxone (reversal)', `${naloxoneTotal.toFixed(1)} mg IV`]);
    if (ivRows.length === 0) ivRows.push(['IV sedation', 'None administered']);

    // Local anesthetic totals
    const localRows: Array<readonly [string, string]> = [];
    if (patient.weightLb && local.doses.length > 0) {
      const result = localCombined(
        local.doses.map((d) => ({ drugId: d.drugId, carpules: d.carpules, givenAt: d.givenAt })),
        patient.weightLb,
        Date.now(),
      );
      for (const row of result.perDrug) {
        localRows.push([
          row.name,
          `${row.carpulesGiven} carpule${row.carpulesGiven === 1 ? '' : 's'} · ${row.totalMgGiven.toFixed(0)} mg total`,
        ]);
      }
      localRows.push([
        'Malamed combined',
        `${result.combinedPercent.toFixed(0)}% (${result.severity})`,
      ]);
    } else {
      localRows.push(['Local anesthesia', 'None administered']);
    }

    // Recovery + discharge
    const recoveryRows: Array<readonly [string, string]> = [
      [
        'Recovery vitals',
        recovery.endHr !== null || recovery.endBpSys !== null || recovery.endSpo2 !== null
          ? `HR ${recovery.endHr ?? '—'} · BP ${recovery.endBpSys ?? '—'}/${recovery.endBpDia ?? '—'} · SpO₂ ${recovery.endSpo2 ?? '—'}%`
          : '—',
      ],
      ['Patient response', recovery.endResponse || '—'],
      ['Ambulatory', recovery.ambulatory ? 'Yes' : 'No'],
      ['Oriented ×3', recovery.orientedX3 ? 'Yes' : 'No'],
      ['Nausea / vomiting', recovery.nauseaOrVomiting ? 'Yes' : 'No'],
      ['Excessive bleeding', recovery.excessiveBleeding ? 'Yes' : 'No'],
      [
        'Responsible companion',
        recovery.companionDocumented
          ? `${recovery.companionName} (${recovery.companionRelation})`
          : '—',
      ],
      ['IV catheter removed', fmtClock(recovery.ivOutAt)],
    ];

    // Chronology table — one row per event
    const chronology: ClinicalNoteRow[] = events.value.map((e: LogEvent) => ({
      time: fmtClock(e.timestamp),
      event: e.event,
      detail: fmtDetail(e.details),
    }));

    const providerSignedAt = recovery.providerSignatureDataUrl ? Date.now() : null;

    return {
      header: {
        patient: patient.name || '[Patient Name]',
        mrn: patient.mrn || '—',
        date,
        provider: patient.provider || '—',
        procedure: 'Moderate IV sedation',
      },
      sections: [
        { heading: 'Pre-Sedation Assessment', rows: preSedation },
        { heading: 'IV Sedation Totals', rows: ivRows },
        { heading: 'Local Anesthesia', rows: localRows },
        { heading: 'Recovery & Discharge', rows: recoveryRows },
      ],
      chronology,
      signatures: {
        providerDataUrl: recovery.providerSignatureDataUrl,
        companionDataUrl: recovery.companionSignatureDataUrl,
        companion: recovery.companionDocumented
          ? `${recovery.companionName} (${recovery.companionRelation})`
          : '—',
        signedAt: providerSignedAt !== null ? fmtClock(providerSignedAt) : null,
      },
      generatedAt: new Date().toLocaleString(),
    };
  });
}
