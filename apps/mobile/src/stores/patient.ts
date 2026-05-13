import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { BpValue } from '@sedation-pro/ui';
import {
  phase1Completeness,
  type AsaClass,
  type MallampatiClass,
  type OsaStatus,
  type SmokingStatus,
} from '@sedation-pro/clinical';

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
  const diabetic = ref(false);
  const baselineGlucose = ref<number | null>(null);

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
        baseline_glucose: baselineGlucose.value ?? '',
      },
      diabetic: diabetic.value ? 'yes' : 'no',
    });
  });

  const isPhase1Complete = computed(() => completeness.value.complete);

  function reset() {
    name.value = '';
    mrn.value = '';
    provider.value = '';
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
    diabetic.value = false;
    baselineGlucose.value = null;
  }

  return {
    name,
    mrn,
    provider,
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
    diabetic,
    baselineGlucose,
    completeness,
    isPhase1Complete,
    reset,
  };
});
