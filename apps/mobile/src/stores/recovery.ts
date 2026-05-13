import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { haptic } from '@/composables/useHaptics';
import { persistRefs } from './persistence';

/**
 * Recovery + discharge state. Separate store so Phase 4 owns its own
 * persistence boundary. Fields here are the inputs that drive
 * `dismissalSafety` plus the discharge checklist / companion details.
 */
export const useRecoveryStore = defineStore('recovery', () => {
  // ------- Recovery vitals form ---------------------------------------------

  const endHr = ref<number | null>(null);
  const endBpSys = ref<number | null>(null);
  const endBpDia = ref<number | null>(null);
  const endSpo2 = ref<number | null>(null);
  const endEtco2 = ref<number | null>(null);
  /** Fingerstick glucose mg/dL — only collected when patient.diabetic is true. */
  const endGlucose = ref<number | null>(null);
  const endResponse = ref<string>('Alert');
  const endStampedAt = ref<number | null>(null);

  // ------- Discharge gate flags (drive dismissalSafety) ---------------------

  const ambulatory = ref(false);
  const orientedX3 = ref(false);
  const nauseaOrVomiting = ref(false);
  const excessiveBleeding = ref(false);

  // ------- Companion + signatures -------------------------------------------

  const companionName = ref('');
  const companionRelation = ref('');
  /** Provider signature data URL — written by the signature pad on pointer-up. */
  const providerSignatureDataUrl = ref<string | null>(null);

  // ------- Discharge checklist (manual confirmations) -----------------------

  const discharge = ref<Record<string, boolean>>({
    escortedToVehicle: false,
    verbalInstructionsGiven: false,
    writtenInstructionsGiven: false,
    propertyReturned: false,
    pulseOxPrinted: false,
  });

  // ------- Prescriptions given on discharge ---------------------------------

  /**
   * Free-text list of prescriptions handed to the patient (e.g.
   * "Ibuprofen 600 mg #20 q6h prn pain; Amoxicillin 500 mg #21 tid x7d").
   * Renders into the clinical note's Recovery & Discharge section.
   */
  const prescriptions = ref('');

  // ------- Provider-rated sedation quality + complications ------------------
  //
  // The legacy app's discharge form lets the provider grade the case and
  // capture complications in two distinct text fields (one for sedation
  // course, one for venipuncture). These flow into the clinical note so
  // billing / QA can audit case-by-case outcomes.

  /** Provider rating of sedation quality — 'excellent' | 'good' | 'fair' | 'poor' | ''. */
  const sedationRating = ref<string>('');
  const sedationComplications = ref('');
  const venipunctureComplications = ref('');
  /** Free-text procedure note — anything the provider wants in the chart. */
  const procedureNotes = ref('');

  // ------- Return-visit plan ------------------------------------------------
  //
  // Legacy presents two mutually-exclusive options: PRN (return as needed) or
  // a scheduled date. We persist both — the UI shows a select, the date only
  // when 'scheduled' is picked.
  const returnVisitPlan = ref<'' | 'prn' | 'scheduled'>('');
  const returnVisitDate = ref<string>('');

  // ------- IV-out stamp -----------------------------------------------------

  const ivOutAt = ref<number | null>(null);

  // ------- Procedure-end-vitals helpers -------------------------------------

  function stampRecoveryVitals() {
    endStampedAt.value = Date.now();
    haptic('medium');
  }
  function clearRecoveryStamp() {
    endStampedAt.value = null;
  }
  function stampIvOut() {
    if (ivOutAt.value === null) {
      ivOutAt.value = Date.now();
      // IV-out closes the case — give it the "success" rhythm rather than the
      // single buzz a normal stamp gets, so the user feels the transition.
      haptic('success');
    }
  }
  function clearIvOut() {
    ivOutAt.value = null;
  }

  function setDischarge(key: string, value: boolean) {
    discharge.value[key] = value;
  }

  function reset() {
    endHr.value = null;
    endBpSys.value = null;
    endBpDia.value = null;
    endSpo2.value = null;
    endEtco2.value = null;
    endGlucose.value = null;
    endResponse.value = 'Alert';
    endStampedAt.value = null;
    ambulatory.value = false;
    orientedX3.value = false;
    nauseaOrVomiting.value = false;
    excessiveBleeding.value = false;
    companionName.value = '';
    companionRelation.value = '';
    providerSignatureDataUrl.value = null;
    discharge.value = {
      escortedToVehicle: false,
      verbalInstructionsGiven: false,
      writtenInstructionsGiven: false,
      propertyReturned: false,
      pulseOxPrinted: false,
    };
    prescriptions.value = '';
    sedationRating.value = '';
    sedationComplications.value = '';
    venipunctureComplications.value = '';
    procedureNotes.value = '';
    returnVisitPlan.value = '';
    returnVisitDate.value = '';
    ivOutAt.value = null;
  }

  const companionDocumented = computed(
    () => companionName.value.trim() !== '' && companionRelation.value.trim() !== '',
  );

  persistRefs('sedation-pro:recovery:v5', {
    endHr,
    endBpSys,
    endBpDia,
    endSpo2,
    endEtco2,
    endGlucose,
    endResponse,
    endStampedAt,
    ambulatory,
    orientedX3,
    nauseaOrVomiting,
    excessiveBleeding,
    companionName,
    companionRelation,
    providerSignatureDataUrl,
    discharge,
    prescriptions,
    sedationRating,
    sedationComplications,
    venipunctureComplications,
    procedureNotes,
    returnVisitPlan,
    returnVisitDate,
    ivOutAt,
  });

  return {
    // form refs
    endHr,
    endBpSys,
    endBpDia,
    endSpo2,
    endEtco2,
    endGlucose,
    endResponse,
    endStampedAt,
    ambulatory,
    orientedX3,
    nauseaOrVomiting,
    excessiveBleeding,
    companionName,
    companionRelation,
    providerSignatureDataUrl,
    discharge,
    prescriptions,
    sedationRating,
    sedationComplications,
    venipunctureComplications,
    procedureNotes,
    returnVisitPlan,
    returnVisitDate,
    ivOutAt,

    // derived
    companionDocumented,

    // mutators
    stampRecoveryVitals,
    clearRecoveryStamp,
    stampIvOut,
    clearIvOut,
    setDischarge,
    reset,
  };
});
