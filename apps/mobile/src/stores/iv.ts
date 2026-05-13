import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  fentanylTimer,
  ivSedationStatus,
  versedTimer,
  type IVSedationStatus,
  type TimerStatus,
} from '@sedation-pro/clinical';

import type { BpValue } from '@sedation-pro/ui';

import { persistRefs } from './persistence';

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
  function startIV() {
    ivStarted.value = true;
  }

  function setPreOpVitals(v: VitalsStamp) {
    preOpVitals.value = v;
  }
  function setSedationVitals(v: VitalsStamp) {
    sedationVitals.value = v;
  }

  function clear() {
    doses.value = [];
    n2oOn.value = false;
    o2OnlyOn.value = false;
    ivStarted.value = false;
    preOpVitals.value = null;
    sedationVitals.value = null;
  }

  // Persistence — every dose, every timer anchor, every gas-flow flag must
  // survive a reload mid-procedure.
  persistRefs('sedation-pro:iv:v1', {
    doses,
    n2oOn,
    o2OnlyOn,
    ivStarted,
    ivCatheterGauge,
    ivCatheterAttempts,
    ivSite,
    ivFluid,
    preOpVitals,
    sedationVitals,
  });

  return {
    // raw state
    doses,
    n2oOn,
    o2OnlyOn,
    ivStarted,
    ivCatheterGauge,
    ivCatheterAttempts,
    ivSite,
    ivFluid,
    preOpVitals,
    sedationVitals,

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
    startIV,
    setPreOpVitals,
    setSedationVitals,
    clear,
  };
});
