import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  fentanylTimer,
  ivSedationStatus,
  versedTimer,
  type IVSedationStatus,
  type TimerStatus,
} from '@sedation-pro/clinical';

import type { BpValue } from '@sedation-pro/ui';

import { haptic } from '@/composables/useHaptics';
import { persistRefs } from './persistence';
import { usePatientStore } from './patient';

/**
 * Per-drug IV dose record. Stored exactly as logged so totals and timer
 * timestamps re-derive from the same source of truth on reload.
 */
export interface IVDoseRecord {
  readonly id: string;
  readonly drug: 'versed' | 'fentanyl' | 'zofran' | 'flumazenil' | 'naloxone';
  /** Amount in mg (Versed / Zofran / Flumazenil / Naloxone). */
  readonly mg?: number;
  /** Amount in mcg (Fentanyl). */
  readonly mcg?: number;
  readonly at: number;
}

export interface VitalsStamp {
  readonly hr: number | null;
  readonly bp: BpValue;
  readonly spo2: number | null;
  readonly etco2: number | null;
  /** Fingerstick glucose in mg/dL — captured for diabetic patients only. */
  readonly glucose: number | null;
  readonly response: string;
  readonly at: number;
}

let doseCounter = 0;
function nextDoseId(): string {
  doseCounter += 1;
  return `iv-${doseCounter}-${Date.now().toString(36)}`;
}

/**
 * IV sedation state. Holds:
 *   - the running list of IV doses (source of truth for totals + timers)
 *   - N₂O / O₂ flow status
 *   - IV-line metadata once started
 *   - preop / sedation / recovery vitals stamps
 *
 * Computed properties derive everything else (per-drug totals, last-dose
 * timestamps, drug timer status, IV ceiling status). The clinical engine
 * still owns the math.
 */
export const useIVStore = defineStore('iv', () => {
  // ------- Raw state ---------------------------------------------------------

  const doses = ref<IVDoseRecord[]>([]);

  /** N₂O on means the patient is on the N₂O/O₂ mix. False after the OFF step. */
  const n2oOn = ref(false);
  /** O₂-only flag set when N₂O turns off but pure oxygen continues. */
  const o2OnlyOn = ref(false);

  const ivStarted = ref(false);
  const ivCatheterGauge = ref('22');
  const ivCatheterAttempts = ref<number>(1);
  const ivSite = ref('Right dorsal hand');
  const ivFluid = ref('D5W 100 mL');

  const preOpVitals = ref<VitalsStamp | null>(null);
  const sedationVitals = ref<VitalsStamp | null>(null);

  // ------- Vitals form inputs (persisted so reload preserves typed values) --
  // The inputs live in the store; views v-model directly. Snapshot vitals
  // above hold the *stamped* row appended to the chrono log; these refs are
  // the *live* form state.

  const preOpHr = ref<number | null>(null);
  const preOpBpSys = ref<number | null>(null);
  const preOpBpDia = ref<number | null>(null);
  const preOpSpo2 = ref<number | null>(null);
  const preOpEtco2 = ref<number | null>(null);
  /** Fingerstick glucose mg/dL — only collected when patient.diabetic is true. */
  const preOpGlucose = ref<number | null>(null);
  const preOpResponse = ref<string>('Alert');
  /** Wall-clock ms at which pre-op vitals were stamped. null until stamped. */
  const preOpStampedAt = ref<number | null>(null);

  const sedHr = ref<number | null>(null);
  const sedBpSys = ref<number | null>(null);
  const sedBpDia = ref<number | null>(null);
  const sedSpo2 = ref<number | null>(null);
  const sedEtco2 = ref<number | null>(null);
  const sedGlucose = ref<number | null>(null);
  const sedResponse = ref<string>('Relaxed');
  const sedStampedAt = ref<number | null>(null);

  /** Wall-clock ms the procedure was started. null until tapped. */
  const procedureStartedAt = ref<number | null>(null);
  /** Wall-clock ms IV started — derived for badges; ivStarted bool kept for compat. */
  const ivStartedAt = ref<number | null>(null);

  // ------- Derived totals + timers ------------------------------------------

  const versedTotalMg = computed(() =>
    doses.value.filter((d) => d.drug === 'versed').reduce((sum, d) => sum + (d.mg ?? 0), 0),
  );

  const fentanylTotalMcg = computed(() =>
    doses.value.filter((d) => d.drug === 'fentanyl').reduce((sum, d) => sum + (d.mcg ?? 0), 0),
  );

  const zofranTotalMg = computed(() =>
    doses.value.filter((d) => d.drug === 'zofran').reduce((sum, d) => sum + (d.mg ?? 0), 0),
  );

  function lastDoseAt(drug: IVDoseRecord['drug']): number | null {
    for (let i = doses.value.length - 1; i >= 0; i -= 1) {
      if (doses.value[i]?.drug === drug) return doses.value[i]!.at;
    }
    return null;
  }

  const lastVersedAt = computed(() => lastDoseAt('versed'));
  const lastFentanylAt = computed(() => lastDoseAt('fentanyl'));
  const lastZofranAt = computed(() => lastDoseAt('zofran'));
  const lastFlumazenilAt = computed(() => lastDoseAt('flumazenil'));
  const lastIvMedAt = computed(() => {
    if (doses.value.length === 0) return null;
    return doses.value[doses.value.length - 1]?.at ?? null;
  });

  /**
   * Drug timer state — `versedTimer` / `fentanylTimer` encode the engine's
   * cooling / ramping / ready thresholds against elapsed seconds. Returns
   * `null` when no dose has been logged yet so the UI can show an "empty"
   * pill.
   */
  function versedTimerAt(now: number): TimerStatus | null {
    if (lastVersedAt.value === null) return null;
    return versedTimer(Math.floor((now - lastVersedAt.value) / 1000));
  }
  function fentanylTimerAt(now: number): TimerStatus | null {
    if (lastFentanylAt.value === null) return null;
    return fentanylTimer(Math.floor((now - lastFentanylAt.value) / 1000));
  }

  const sedationStatus = computed<IVSedationStatus>(() =>
    ivSedationStatus(versedTotalMg.value, fentanylTotalMcg.value),
  );

  // ------- Mutators ---------------------------------------------------------

  function logDose(record: Omit<IVDoseRecord, 'id' | 'at'>): IVDoseRecord {
    const entry: IVDoseRecord = { ...record, id: nextDoseId(), at: Date.now() };
    doses.value.push(entry);
    // Reversal agents are the highest-tension actions in the workflow —
    // give them the "heavy" haptic so the user knows the tap registered
    // without having to look at the screen.
    haptic(record.drug === 'flumazenil' || record.drug === 'naloxone' ? 'heavy' : 'medium');
    return entry;
  }

  function removeDoseById(id: string): boolean {
    const idx = doses.value.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    doses.value.splice(idx, 1);
    return true;
  }

  function setN2oOn() {
    n2oOn.value = true;
    o2OnlyOn.value = false;
  }
  function setN2oOff() {
    n2oOn.value = false;
    o2OnlyOn.value = true;
  }
  /**
   * Restore the gas-flow flags to an arbitrary prior pair — used by the undo
   * stack so an undone N₂O ON / OFF action puts BOTH booleans back to the
   * state they had before the action, not just the one the setter touched.
   */
  function restoreGasState(prevN2oOn: boolean, prevO2OnlyOn: boolean) {
    n2oOn.value = prevN2oOn;
    o2OnlyOn.value = prevO2OnlyOn;
  }
  function startIV() {
    ivStarted.value = true;
    if (ivStartedAt.value === null) {
      ivStartedAt.value = Date.now();
      haptic('medium');
    }
  }

  function setPreOpVitals(v: VitalsStamp) {
    preOpVitals.value = v;
    preOpStampedAt.value = v.at;
    haptic('medium');
  }
  function setSedationVitals(v: VitalsStamp) {
    sedationVitals.value = v;
    sedStampedAt.value = v.at;
    haptic('medium');
  }
  function startProcedure() {
    if (procedureStartedAt.value === null) {
      procedureStartedAt.value = Date.now();
      haptic('medium');
    }
  }

  function clearPreOpStamp() {
    preOpStampedAt.value = null;
    preOpVitals.value = null;
  }
  function clearSedationStamp() {
    sedStampedAt.value = null;
    sedationVitals.value = null;
  }
  function clearProcedureStart() {
    procedureStartedAt.value = null;
  }
  function clearIvStart() {
    ivStarted.value = false;
    ivStartedAt.value = null;
  }

  function clear() {
    doses.value = [];
    n2oOn.value = false;
    o2OnlyOn.value = false;
    ivStarted.value = false;
    ivStartedAt.value = null;
    preOpVitals.value = null;
    sedationVitals.value = null;
    preOpHr.value = null;
    preOpBpSys.value = null;
    preOpBpDia.value = null;
    preOpSpo2.value = null;
    preOpEtco2.value = null;
    preOpGlucose.value = null;
    preOpResponse.value = 'Alert';
    preOpStampedAt.value = null;
    sedHr.value = null;
    sedBpSys.value = null;
    sedBpDia.value = null;
    sedSpo2.value = null;
    sedEtco2.value = null;
    sedGlucose.value = null;
    sedResponse.value = 'Relaxed';
    sedStampedAt.value = null;
    procedureStartedAt.value = null;
  }

  // Pre-op glucose is collected only when the patient is flagged diabetic;
  // flipping diabetic back to "no" wipes the stale reading so it can't leak
  // into the chart or the recovery comparison.
  const patient = usePatientStore();
  watch(
    () => patient.diabetic,
    (isDiabetic) => {
      if (!isDiabetic) preOpGlucose.value = null;
    },
    { flush: 'sync' },
  );

  // Persistence — every dose, every timer anchor, every gas-flow flag, every
  // input keystroke must survive a reload mid-procedure.
  persistRefs('sedation-pro:iv:v2', {
    doses,
    n2oOn,
    o2OnlyOn,
    ivStarted,
    ivStartedAt,
    ivCatheterGauge,
    ivCatheterAttempts,
    ivSite,
    ivFluid,
    preOpVitals,
    sedationVitals,
    preOpHr,
    preOpBpSys,
    preOpBpDia,
    preOpSpo2,
    preOpEtco2,
    preOpGlucose,
    preOpResponse,
    preOpStampedAt,
    sedHr,
    sedBpSys,
    sedBpDia,
    sedSpo2,
    sedEtco2,
    sedGlucose,
    sedResponse,
    sedStampedAt,
    procedureStartedAt,
  });

  return {
    // raw state
    doses,
    n2oOn,
    o2OnlyOn,
    ivStarted,
    ivStartedAt,
    ivCatheterGauge,
    ivCatheterAttempts,
    ivSite,
    ivFluid,
    preOpVitals,
    sedationVitals,
    preOpHr,
    preOpBpSys,
    preOpBpDia,
    preOpSpo2,
    preOpEtco2,
    preOpGlucose,
    preOpResponse,
    preOpStampedAt,
    sedHr,
    sedBpSys,
    sedBpDia,
    sedSpo2,
    sedEtco2,
    sedGlucose,
    sedResponse,
    sedStampedAt,
    procedureStartedAt,

    // derived
    versedTotalMg,
    fentanylTotalMcg,
    zofranTotalMg,
    lastVersedAt,
    lastFentanylAt,
    lastZofranAt,
    lastFlumazenilAt,
    lastIvMedAt,
    versedTimerAt,
    fentanylTimerAt,
    sedationStatus,

    // mutators
    logDose,
    removeDoseById,
    setN2oOn,
    setN2oOff,
    restoreGasState,
    startIV,
    setPreOpVitals,
    setSedationVitals,
    startProcedure,
    clearPreOpStamp,
    clearSedationStamp,
    clearProcedureStart,
    clearIvStart,
    clear,
  };
});
