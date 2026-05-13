import { computed, ref } from 'vue';
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
export interface SafetyAlert {
  readonly code: 'asa' | 'osa' | 'mallampati' | 'bmi' | 'age';
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
  const provider = ref('');
  /** Comma-separated dental assistant name(s) on the case. Surfaces in the
   * clinical note's header block and the procedure narrative. */
  const assistants = ref('');
  /** Procedure description — e.g. "EXT #19". Optional; surfaces in the note narrative. */
  const procedure = ref('');
  const careName = ref('');
  const carePhone = ref('');
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
  const timeOutPerformed = ref(false);
  const teamReady = ref(false);
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
        time_out: timeOutPerformed.value,
        team_ready: teamReady.value,
        emergency_drugs_available: emergencyDrugsAvailable.value,
        monitoring_equipment_checked: monitoringEquipmentChecked.value,
        baseline_glucose: baselineGlucose.value ?? '',
      },
      diabetic: diabetic.value ? 'yes' : 'no',
    });
  });

  const isPhase1Complete = computed(() => completeness.value.complete);

  // Persist the form so reloading the page (or relaunching from the iPhone
  // home screen) doesn't wipe progress. Schema migrations land in Phase 5
  // proper — for now we trust the snapshot.
  persistRefs('sedation-pro:patient:v4', {
    name,
    mrn,
    provider,
    assistants,
    procedure,
    careName,
    carePhone,
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
    timeOutPerformed,
    teamReady,
    emergencyDrugsAvailable,
    monitoringEquipmentChecked,
  });

  function reset() {
    name.value = '';
    mrn.value = '';
    provider.value = '';
    assistants.value = '';
    procedure.value = '';
    careName.value = '';
    carePhone.value = '';
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
    timeOutPerformed.value = false;
    teamReady.value = false;
    emergencyDrugsAvailable.value = false;
    monitoringEquipmentChecked.value = false;
  }

  return {
    name,
    mrn,
    provider,
    assistants,
    procedure,
    careName,
    carePhone,
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
    timeOutPerformed,
    teamReady,
    emergencyDrugsAvailable,
    monitoringEquipmentChecked,
    bmi,
    bp,
    spo2,
    safetyAlerts,
    completeness,
    isPhase1Complete,
    reset,
  };
});
