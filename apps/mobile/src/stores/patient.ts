import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { BpValue } from '@sedation-pro/ui';
import {
  bmiFromImperial,
  classifyBp,
  classifySpo2,
  phase1Completeness,
  type AsaClass,
  type BmiResult,
  type BpResult,
  type MallampatiClass,
  type OsaStatus,
  type SmokingStatus,
  type Spo2Result,
} from '@sedation-pro/clinical';

import { persistRefs } from './persistence';

/**
 * A live safety alert surfaced in the sticky bar. Computed from the patient
 * store so the alert pills can't drift from the rest of the UI.
 */
/**
 * Drinks-per-week buckets backing the alcohol chip group. Stored value is
 * the bucket's midpoint (or lower bound for the open-ended top bucket) so
 * the printed note + audit log can describe the patient's drinking band
 * accurately even though we no longer collect an exact weekly count.
 * Legacy stored values from the previous numeric dropdown still map
 * correctly to their bucket.
 */
export function alcoholBucketValue(weekly: number | null): number | null {
  if (weekly === null) return null;
  if (weekly === 0) return 0;
  if (weekly <= 7) return 4;
  if (weekly <= 14) return 11;
  return 15;
}

export function formatAlcoholBucket(weekly: number | null): string {
  const b = alcoholBucketValue(weekly);
  if (b === null) return '—';
  if (b === 0) return '0';
  if (b === 4) return '1–7';
  if (b === 11) return '8–14';
  return '15+';
}

export interface SafetyAlert {
  readonly code: 'asa' | 'osa' | 'mallampati' | 'bmi' | 'age' | 'diabetes';
  readonly label: string;
  readonly tone: 'caution' | 'danger';
}

/**
 * The Phase 1 input bag. Holds *only* what the patient's pre-sedation
 * assessment captures — IV doses, vitals stamps, and procedure events live
 * elsewhere. The fields here are the inputs to `phase1Completeness`, so the
 * computed `completeness` below is the single source of truth for whether
 * Phase 2/3/4 are unlocked.
 *
 * For Phase 3 (the shell) we wire only the fields needed to drive gating.
 * Phase 4 will widen this to every form input.
 */
export const usePatientStore = defineStore('patient', () => {
  const name = ref('');
  const mrn = ref('');
  // Seeded to the practice's first roster entry (formulary
  // picklists.providers[0] / dentalAssistants[0]); default.test.ts guards
  // that these literals stay in sync with the shipped formulary.
  const provider = ref('Dr. Amr Hassan');
  /** "; "-separated dental assistant name(s) on the case (names embed a
   * ", Title", so they can't be comma-joined). Surfaces in the clinical
   * note's header block and the procedure narrative. */
  const assistants = ref('Raycha Dobbins, EFDA');
  /** Procedure description — e.g. "EXT #19". Optional; surfaces in the note narrative. */
  const procedure = ref('');
  const careName = ref('');
  const carePhone = ref('');
  /**
   * Caregiver's relationship to the patient (Spouse / Parent / etc.). Same
   * vocabulary as `recovery.companionRelation` — Phase 4 auto-fills its
   * companion fields from these caregiver entries on mount when the
   * companion fields are still empty, so the responsible adult typically
   * only gets named once at intake.
   */
  const careRelation = ref('');
  const weightLb = ref<number | null>(null);
  const heightIn = ref<number | null>(null);
  const age = ref<number | null>(null);
  const lastExamDate = ref<string>('');
  const baselineBp = ref<BpValue>({ sbp: null, dbp: null });
  const baselineSpo2 = ref<number | null>(null);
  const medsVerified = ref(false);
  const osaStatus = ref<OsaStatus | ''>('');
  const smokingStatus = ref<SmokingStatus | ''>('');
  const mallampati = ref<MallampatiClass | ''>('');
  const asaClass = ref<AsaClass | ''>('');
  const npoConfirmed = ref(false);
  const consentObtained = ref(false);
  /**
   * Multi-select chip vocabulary for the patient's active medical problems
   * (CVD, Hypertension, Diabetes, etc.). Optional — not part of the unlock
   * gate. The chip "Diabetes" is bidirectionally bound with the `diabetic`
   * boolean below so ticking Diabetic auto-adds Diabetes to the chip
   * cloud, and toggling Diabetes off the cloud unticks the checkbox.
   */
  const medicalProblems = ref<string[]>([]);
  /**
   * Diabetic flag. Earlier iterations split this into Type I / Type II
   * but the morning-of sedation protocol is the same for both — hold the
   * morning meds, keep the insulin pump on basal rate — and the type
   * distinction wasn't actionable inside the app workflow. The
   * medications list still records the specific drugs (Metformin,
   * Insulin, etc.) so the chart carries the clinically actionable detail
   * without a parallel typed enum.
   */
  const diabetic = ref(false);
  const baselineGlucose = ref<number | null>(null);

  // -------- Expanded medical / social history -------------------------------
  // Free-text fields the legacy app captured as textareas. Optional inputs —
  // not part of the unlock gate, but they flow into the clinical note's
  // pre-sedation summary and narrative so the chart is real.
  const medicationsList = ref('');
  const allergiesList = ref('');
  const hospitalisations = ref('');
  const surgeries = ref('');
  const familyHistory = ref('');
  const anesthesiaHistory = ref('');
  const alcoholPerWeek = ref<number | null>(null);
  const recreationalDrugs = ref('');
  const cigarettesPerDay = ref<number | null>(null);

  // -------- Expanded safety checklist (required to unlock) ------------------
  const ekgPlaced = ref(false);
  const emergencyDrugsAvailable = ref(false);
  const monitoringEquipmentChecked = ref(false);

  // -------- Live derived state ---------------------------------------------

  const bmi = computed<BmiResult | null>(() =>
    weightLb.value !== null && heightIn.value !== null
      ? bmiFromImperial(weightLb.value, heightIn.value)
      : null,
  );

  const bp = computed<BpResult | null>(() =>
    baselineBp.value.sbp !== null && baselineBp.value.dbp !== null
      ? classifyBp(baselineBp.value.sbp, baselineBp.value.dbp)
      : null,
  );

  const spo2 = computed<Spo2Result | null>(() =>
    baselineSpo2.value !== null ? classifySpo2(baselineSpo2.value) : null,
  );

  /**
   * Safety alerts shown in the sticky bar across every phase. ASA III/IV,
   * documented OSA, Mallampati III/IV, BMI ≥30. The legacy app rendered
   * these as red pills — same idea here, with caution for amber-level flags.
   */
  const safetyAlerts = computed<ReadonlyArray<SafetyAlert>>(() => {
    const alerts: SafetyAlert[] = [];
    if (asaClass.value === 'III' || asaClass.value === 'IV') {
      alerts.push({ code: 'asa', label: `ASA ${asaClass.value}`, tone: 'danger' });
    }
    if (osaStatus.value === 'osa-diagnosed' || osaStatus.value === 'cpap-prescribed') {
      alerts.push({ code: 'osa', label: 'OSA', tone: 'danger' });
    }
    if (mallampati.value === 'III' || mallampati.value === 'IV') {
      alerts.push({
        code: 'mallampati',
        label: `Mallampati ${mallampati.value}`,
        tone: 'danger',
      });
    }
    if (bmi.value && bmi.value.value >= 30) {
      alerts.push({
        code: 'bmi',
        label: `BMI ${bmi.value.value.toFixed(1)}`,
        tone: bmi.value.value >= 40 ? 'danger' : 'caution',
      });
    }
    if (age.value !== null && age.value >= 65) {
      alerts.push({
        code: 'age',
        label: `Age ${age.value}`,
        tone: age.value >= 75 ? 'danger' : 'caution',
      });
    }
    if (diabetic.value) {
      // The morning-of protocol applies to every diabetic regardless of
      // type — hold the morning meds, keep the pump on basal rate. Pill
      // keeps that reminder visible after Phase 1.
      alerts.push({ code: 'diabetes', label: 'DM', tone: 'caution' });
    }
    return alerts;
  });

  const completeness = computed(() => {
    return phase1Completeness({
      values: {
        pt: name.value,
        mrn: mrn.value,
        prov: provider.value,
        care_name: careName.value,
        care_phone: carePhone.value,
        weight: weightLb.value ?? '',
        height: heightIn.value ?? '',
        patient_age: age.value ?? '',
        last_exam: lastExamDate.value,
        meds_verified: medsVerified.value,
        osa_history: osaStatus.value,
        smoking_status: smokingStatus.value,
        mallampati: mallampati.value || '',
        asa_class: asaClass.value || '',
        npo_confirmed: npoConfirmed.value,
        consent_obtained: consentObtained.value,
        ekg_placed: ekgPlaced.value,
        emergency_drugs_available: emergencyDrugsAvailable.value,
        monitoring_equipment_checked: monitoringEquipmentChecked.value,
        baseline_glucose: baselineGlucose.value ?? '',
      },
      diabetic: diabetic.value ? 'yes' : 'no',
    });
  });

  const isPhase1Complete = computed(() => completeness.value.complete);

  /**
   * Flips true the first time the user tries to leave Phase 1 with required
   * fields still empty (router guard + nav-drawer tap). Components read it to
   * surface red-ring "required" highlights on the offending fields. We reset
   * once the form is clean so the rings clear themselves — and stay off the
   * next time the user reopens a partially-filled chart, since this flag is
   * ephemeral UI state and intentionally not persisted.
   */
  const phase1ValidationAttempted = ref(false);

  function markValidationAttempted() {
    phase1ValidationAttempted.value = true;
  }

  watch(isPhase1Complete, (complete) => {
    if (complete) phase1ValidationAttempted.value = false;
  });

  // Flipping diabetic back to "no" must wipe the baseline glucose so a stale
  // value from an earlier toggle can't flow into the chart. Cross-store
  // glucose refs (IV pre-op, recovery end-of-case) clear themselves via the
  // same diabetic-watch pattern in their own stores. flush: 'sync' so the
  // cleanup is observable in the same tick the toggle happens.
  watch(
    diabetic,
    (isDiabetic) => {
      if (!isDiabetic) baselineGlucose.value = null;
    },
    { flush: 'sync' },
  );

  // Bidirectional sync between the Medical Problems chip cloud and the
  // Diabetic flag. Ticking the checkbox auto-adds "Diabetes" to the
  // cloud; toggling Diabetes off the cloud unticks the checkbox. Both
  // controls represent the same fact and the provider can touch either
  // without driving the chart out of sync. flush: 'sync' so the
  // auto-toggle is observable in the same tick the user-driven
  // mutation happens.
  watch(
    diabetic,
    (isDiabetic) => {
      const has = medicalProblems.value.includes('Diabetes');
      if (isDiabetic && !has) {
        medicalProblems.value = [...medicalProblems.value, 'Diabetes'];
      } else if (!isDiabetic && has) {
        medicalProblems.value = medicalProblems.value.filter((p) => p !== 'Diabetes');
      }
    },
    { flush: 'sync' },
  );
  watch(
    () => medicalProblems.value.includes('Diabetes'),
    (hasDiabetes) => {
      if (!hasDiabetes && diabetic.value) {
        diabetic.value = false;
      } else if (hasDiabetes && !diabetic.value) {
        diabetic.value = true;
      }
    },
    { flush: 'sync' },
  );

  // Add "Diabetes" to medical problems when the medications list mentions
  // Metformin or Insulin. Picking one of those quick-add chips (or just
  // typing the word) is a strong signal the patient is diabetic, so the
  // chip cloud and Diabetic checkbox reflect it without requiring a
  // separate tap. Already-ticked state is left alone — this watcher
  // never un-adds the chip.
  // Sticky behaviour: once added, the watcher doesn't re-fire on the same
  // text, so a deliberate "remove Diabetes from medical problems" by the
  // provider isn't undone unless the medication list itself changes again.
  watch(
    medicationsList,
    (meds) => {
      const lower = meds.toLowerCase();
      const hasDiabetesMed = lower.includes('metformin') || lower.includes('insulin');
      if (hasDiabetesMed && !medicalProblems.value.includes('Diabetes')) {
        medicalProblems.value = [...medicalProblems.value, 'Diabetes'];
      }
    },
    { flush: 'sync' },
  );

  // Persist the form so reloading the page (or relaunching from the iPhone
  // home screen) doesn't wipe progress. Schema migrations land in Phase 5
  // proper — for now we trust the snapshot.
  persistRefs('sedation-pro:patient:v7', {
    name,
    mrn,
    provider,
    assistants,
    procedure,
    careName,
    carePhone,
    careRelation,
    weightLb,
    heightIn,
    age,
    lastExamDate,
    baselineBp,
    baselineSpo2,
    medsVerified,
    osaStatus,
    smokingStatus,
    mallampati,
    asaClass,
    npoConfirmed,
    consentObtained,
    medicalProblems,
    diabetic,
    baselineGlucose,
    medicationsList,
    allergiesList,
    hospitalisations,
    surgeries,
    familyHistory,
    anesthesiaHistory,
    alcoholPerWeek,
    recreationalDrugs,
    cigarettesPerDay,
    ekgPlaced,
    emergencyDrugsAvailable,
    monitoringEquipmentChecked,
  });

  function reset() {
    name.value = '';
    mrn.value = '';
    provider.value = 'Dr. Amr Hassan';
    assistants.value = 'Raycha Dobbins, EFDA';
    procedure.value = '';
    careName.value = '';
    carePhone.value = '';
    careRelation.value = '';
    weightLb.value = null;
    heightIn.value = null;
    age.value = null;
    lastExamDate.value = '';
    baselineBp.value = { sbp: null, dbp: null };
    baselineSpo2.value = null;
    medsVerified.value = false;
    osaStatus.value = '';
    smokingStatus.value = '';
    mallampati.value = '';
    asaClass.value = '';
    npoConfirmed.value = false;
    consentObtained.value = false;
    medicalProblems.value = [];
    diabetic.value = false;
    baselineGlucose.value = null;
    medicationsList.value = '';
    allergiesList.value = '';
    hospitalisations.value = '';
    surgeries.value = '';
    familyHistory.value = '';
    anesthesiaHistory.value = '';
    alcoholPerWeek.value = null;
    recreationalDrugs.value = '';
    cigarettesPerDay.value = null;
    ekgPlaced.value = false;
    emergencyDrugsAvailable.value = false;
    monitoringEquipmentChecked.value = false;
    phase1ValidationAttempted.value = false;
  }

  return {
    name,
    mrn,
    provider,
    assistants,
    procedure,
    careName,
    carePhone,
    careRelation,
    weightLb,
    heightIn,
    age,
    lastExamDate,
    baselineBp,
    baselineSpo2,
    medsVerified,
    osaStatus,
    smokingStatus,
    mallampati,
    asaClass,
    npoConfirmed,
    consentObtained,
    medicalProblems,
    diabetic,
    baselineGlucose,
    medicationsList,
    allergiesList,
    hospitalisations,
    surgeries,
    familyHistory,
    anesthesiaHistory,
    alcoholPerWeek,
    recreationalDrugs,
    cigarettesPerDay,
    ekgPlaced,
    emergencyDrugsAvailable,
    monitoringEquipmentChecked,
    bmi,
    bp,
    spo2,
    safetyAlerts,
    completeness,
    isPhase1Complete,
    phase1ValidationAttempted,
    markValidationAttempted,
    reset,
  };
});
