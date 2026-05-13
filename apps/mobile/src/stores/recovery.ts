import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

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
  /** Provider signature data URL — written by the signature pad in next push. */
  const providerSignatureDataUrl = ref<string | null>(null);
  const companionSignatureDataUrl = ref<string | null>(null);
  /** Quick placeholders until the canvas pad lands. */
  const providerSigned = ref(false);
  const companionSigned = ref(false);

  // ------- Discharge checklist (manual confirmations) -----------------------

  const discharge = ref<Record<string, boolean>>({
    escortedToVehicle: false,
    verbalInstructionsGiven: false,
    writtenInstructionsGiven: false,
    propertyReturned: false,
    pulseOxPrinted: false,
  });

  // ------- IV-out stamp -----------------------------------------------------

  const ivOutAt = ref<number | null>(null);

  // ------- Procedure-end-vitals helpers -------------------------------------

  function stampRecoveryVitals() {
    endStampedAt.value = Date.now();
  }
  function clearRecoveryStamp() {
    endStampedAt.value = null;
  }
  function stampIvOut() {
    if (ivOutAt.value === null) ivOutAt.value = Date.now();
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
    endResponse.value = 'Alert';
    endStampedAt.value = null;
    ambulatory.value = false;
    orientedX3.value = false;
    nauseaOrVomiting.value = false;
    excessiveBleeding.value = false;
    companionName.value = '';
    companionRelation.value = '';
    providerSignatureDataUrl.value = null;
    companionSignatureDataUrl.value = null;
    providerSigned.value = false;
    companionSigned.value = false;
    discharge.value = {
      escortedToVehicle: false,
      verbalInstructionsGiven: false,
      writtenInstructionsGiven: false,
      propertyReturned: false,
      pulseOxPrinted: false,
    };
    ivOutAt.value = null;
  }

  const companionDocumented = computed(
    () => companionName.value.trim() !== '' && companionRelation.value.trim() !== '',
  );

  persistRefs('sedation-pro:recovery:v1', {
    endHr,
    endBpSys,
    endBpDia,
    endSpo2,
    endEtco2,
    endResponse,
    endStampedAt,
    ambulatory,
    orientedX3,
    nauseaOrVomiting,
    excessiveBleeding,
    companionName,
    companionRelation,
    providerSignatureDataUrl,
    companionSignatureDataUrl,
    providerSigned,
    companionSigned,
    discharge,
    ivOutAt,
  });

  return {
    // form refs
    endHr,
    endBpSys,
    endBpDia,
    endSpo2,
    endEtco2,
    endResponse,
    endStampedAt,
    ambulatory,
    orientedX3,
    nauseaOrVomiting,
    excessiveBleeding,
    companionName,
    companionRelation,
    providerSignatureDataUrl,
    companionSignatureDataUrl,
    providerSigned,
    companionSigned,
    discharge,
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
