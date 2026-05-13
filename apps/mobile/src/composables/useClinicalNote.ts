import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { useEventLogStore, type LogEvent } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useLocalAnestheticStore } from '@/stores/local';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { localCombined, type LocalCombinedResult } from '@sedation-pro/clinical';

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
  /** Prose paragraphs, in order — main body of the clinical note. */
  readonly narrative: ReadonlyArray<string>;
  readonly sections: ReadonlyArray<ClinicalNoteSection>;
  readonly chronology: ReadonlyArray<ClinicalNoteRow>;
  readonly signatures: {
    readonly providerDataUrl: string | null;
    readonly companion: string;
    readonly signedAt: string | null;
  };
  /** ISO date string of when the note was rendered — printed in the footer. */
  readonly generatedAt: string;
}

const PRACTICE_NAME = 'Apex Dental';

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

const OSA_LABELS: Record<string, string> = {
  none: 'no known OSA',
  'osa-diagnosed': 'diagnosed OSA',
  'cpap-prescribed': 'CPAP-prescribed OSA',
};

const SMOKING_LABELS: Record<string, string> = {
  never: 'non-smoker',
  current: 'current smoker',
  former: 'former smoker',
};

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
    const today = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // -------- Pre-sedation summary (key/value table) -----------------------

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
      ['Date of last physical exam', fmtDate(patient.lastExamDate)],
    ];

    // -------- IV sedation totals -------------------------------------------

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

    // -------- Local anesthetic totals --------------------------------------

    let localResult: LocalCombinedResult | null = null;
    const localRows: Array<readonly [string, string]> = [];
    if (patient.weightLb && local.doses.length > 0) {
      localResult = localCombined(
        local.doses.map((d) => ({ drugId: d.drugId, carpules: d.carpules, givenAt: d.givenAt })),
        patient.weightLb,
        Date.now(),
      );
      for (const row of localResult.perDrug) {
        localRows.push([
          row.name,
          `${row.carpulesGiven} carpule${row.carpulesGiven === 1 ? '' : 's'} · ${row.totalMgGiven.toFixed(0)} mg total`,
        ]);
      }
      localRows.push([
        'Malamed combined',
        `${localResult.combinedPercent.toFixed(0)}% (${localResult.severity})`,
      ]);
    } else {
      localRows.push(['Local anesthesia', 'None administered']);
    }

    // -------- Recovery + discharge -----------------------------------------

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

    // -------- Narrative paragraphs -----------------------------------------
    // Conditional prose so the note reads like a real chart entry, not a
    // dump of fields. Each paragraph adapts to what was actually documented.

    const narrative: string[] = [];

    // Para 1 — Identification + procedure
    {
      const bits: string[] = [];
      bits.push(`${patient.name || '[patient]'}`);
      if (patient.age !== null) bits.push(`a ${patient.age}-year-old`);
      if (patient.mrn) bits.push(`(MRN ${patient.mrn})`);
      const intro = bits.join(' ');
      const proc = patient.procedure?.trim() || 'a planned dental procedure';
      const prov = patient.provider?.trim() || 'the attending provider';
      narrative.push(
        `${intro} presented to ${PRACTICE_NAME} on ${today} for ${proc} under moderate IV sedation. Attending provider: ${prov}.`,
      );
    }

    // Para 2 — Pre-sedation findings
    {
      const sentences: string[] = [];
      const asa = patient.asaClass ? `ASA ${patient.asaClass}` : null;
      const mall = patient.mallampati ? `Mallampati Class ${patient.mallampati}` : null;
      const bmi = patient.bmi
        ? `BMI ${patient.bmi.value.toFixed(1)} (${patient.bmi.category})`
        : null;
      const classBits = [asa, mall, bmi].filter(Boolean);
      if (classBits.length > 0) {
        sentences.push(
          `Pre-sedation assessment classified the patient as ${classBits.join(', ')}.`,
        );
      }
      const vitals: string[] = [];
      if (patient.baselineBp.sbp !== null && patient.baselineBp.dbp !== null) {
        vitals.push(`BP ${patient.baselineBp.sbp}/${patient.baselineBp.dbp} mmHg`);
      }
      if (patient.baselineSpo2 !== null) vitals.push(`SpO₂ ${patient.baselineSpo2}%`);
      if (vitals.length > 0) sentences.push(`Baseline vitals: ${vitals.join(', ')}.`);

      const flags: string[] = [];
      if (patient.osaStatus && patient.osaStatus !== 'none' && OSA_LABELS[patient.osaStatus]) {
        flags.push(OSA_LABELS[patient.osaStatus] as string);
      }
      if (patient.smokingStatus && patient.smokingStatus !== 'never') {
        flags.push(SMOKING_LABELS[patient.smokingStatus] ?? patient.smokingStatus);
      }
      if (patient.diabetic) flags.push('diabetic');
      if (flags.length > 0) sentences.push(`Relevant history: ${flags.join(', ')}.`);

      if (patient.medsVerified) {
        sentences.push('Drug interactions verified via Epocrates prior to sedation.');
      }
      if (patient.npoConfirmed) sentences.push('NPO status was confirmed.');

      if (sentences.length > 0) narrative.push(sentences.join(' '));
    }

    // Para 3 — Sedation course
    {
      const sentences: string[] = [];
      if (iv.ivStarted) {
        const gauge = iv.ivCatheterGauge || '—';
        const site = iv.ivSite || 'IV site';
        const attempts =
          iv.ivCatheterAttempts === 1 ? '1 attempt' : `${iv.ivCatheterAttempts} attempts`;
        const fluid = iv.ivFluid || 'maintenance fluid';
        sentences.push(
          `An IV catheter (${gauge}g) was placed in the ${site} after ${attempts}; ${fluid} was initiated.`,
        );
      }
      const meds: string[] = [];
      if (iv.versedTotalMg > 0) meds.push(`${iv.versedTotalMg.toFixed(1)} mg midazolam`);
      if (iv.fentanylTotalMcg > 0) meds.push(`${iv.fentanylTotalMcg.toFixed(0)} mcg fentanyl`);
      if (iv.zofranTotalMg > 0) meds.push(`${iv.zofranTotalMg.toFixed(0)} mg ondansetron`);
      if (meds.length > 0) {
        sentences.push(
          `Sedation achieved with ${meds.join(', ')} IV titrated to effect; ${iv.doses.filter((d) => !['flumazenil', 'naloxone'].includes(d.drug)).length} dose${iv.doses.length === 1 ? '' : 's'} total.`,
        );
      }
      if (iv.procedureStartedAt !== null) {
        sentences.push(`Procedure commenced at ${fmtClock(iv.procedureStartedAt)}.`);
      }
      if (sentences.length > 0) narrative.push(sentences.join(' '));
    }

    // Para 4 — Local anesthesia (if any)
    if (localResult && localResult.perDrug.length > 0) {
      const parts = localResult.perDrug.map(
        (row) => `${row.name} ×${row.carpulesGiven} carpule${row.carpulesGiven === 1 ? '' : 's'}`,
      );
      narrative.push(
        `Local anesthesia: ${parts.join(', ')}. Malamed combined active load peaked at ${localResult.combinedPercent.toFixed(0)}% (${localResult.severity}).`,
      );
    }

    // Para 5 — Reversal (if any)
    if (flumazenilTotal > 0 || naloxoneTotal > 0) {
      const lines: string[] = [];
      if (flumazenilTotal > 0) {
        lines.push(
          `Flumazenil ${flumazenilTotal.toFixed(1)} mg IV given for benzodiazepine reversal; post-reversal monitoring extended to 120 minutes per protocol.`,
        );
      }
      if (naloxoneTotal > 0) {
        lines.push(
          `Naloxone ${naloxoneTotal.toFixed(1)} mg IV given for opioid reversal; patient monitored for re-sedation as naloxone half-life is shorter than the opioid administered.`,
        );
      }
      narrative.push(lines.join(' '));
    }

    // Para 6 — Recovery + discharge
    {
      const sentences: string[] = [];
      sentences.push('Recovery proceeded without complication.');
      const tolerance: string[] = [];
      if (recovery.ambulatory) tolerance.push('ambulatory');
      if (recovery.orientedX3) tolerance.push('oriented ×3');
      if (tolerance.length > 0) {
        sentences.push(`Patient was ${tolerance.join(' and ')} prior to discharge.`);
      }
      const concerns: string[] = [];
      if (recovery.nauseaOrVomiting) concerns.push('nausea or vomiting');
      if (recovery.excessiveBleeding) concerns.push('excessive bleeding');
      if (concerns.length > 0) {
        sentences.push(`Noted concerns at discharge: ${concerns.join(', ')}.`);
      }
      if (recovery.endHr || recovery.endBpSys || recovery.endSpo2) {
        const vitals: string[] = [];
        if (recovery.endHr !== null) vitals.push(`HR ${recovery.endHr}`);
        if (recovery.endBpSys !== null && recovery.endBpDia !== null) {
          vitals.push(`BP ${recovery.endBpSys}/${recovery.endBpDia}`);
        }
        if (recovery.endSpo2 !== null) vitals.push(`SpO₂ ${recovery.endSpo2}%`);
        sentences.push(`Recovery vitals: ${vitals.join(', ')}.`);
      }
      if (recovery.ivOutAt !== null) {
        sentences.push(`IV catheter was removed at ${fmtClock(recovery.ivOutAt)}.`);
      }
      if (recovery.companionDocumented) {
        sentences.push(
          `Patient was discharged accompanied by ${recovery.companionName} (${recovery.companionRelation}). Verbal and written post-op instructions were given; companion co-signed the printed post-op-instructions form.`,
        );
      }
      narrative.push(sentences.join(' '));
    }

    // -------- Chronology table --------------------------------------------

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
        date: today,
        provider: patient.provider || '—',
        procedure: patient.procedure?.trim() || 'Moderate IV sedation',
      },
      narrative,
      sections: [
        { heading: 'Pre-Sedation Assessment', rows: preSedation },
        { heading: 'IV Sedation Totals', rows: ivRows },
        { heading: 'Local Anesthesia', rows: localRows },
        { heading: 'Recovery & Discharge', rows: recoveryRows },
      ],
      chronology,
      signatures: {
        providerDataUrl: recovery.providerSignatureDataUrl,
        companion: recovery.companionDocumented
          ? `${recovery.companionName} (${recovery.companionRelation})`
          : '—',
        signedAt: providerSignedAt !== null ? fmtClock(providerSignedAt) : null,
      },
      generatedAt: new Date().toLocaleString(),
    };
  });
}
