import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  localCombined,
  type LocalCombinedResult,
  type LocalDose as EngineLocalDose,
} from '@sedation-pro/clinical';

import { persistRefs } from './persistence';

/**
 * Local-anesthetic dose record. Persisted because the half-life decay math
 * runs against absolute timestamps — a reload mid-procedure must keep
 * `givenAt` intact so the Malamed combined-% picks up where it left off.
 */
export interface LocalDoseRecord {
  readonly id: string;
  readonly drugId: string;
  readonly carpules: number;
  readonly givenAt: number;
}

let localCounter = 0;
function nextLocalId(): string {
  localCounter += 1;
  return `loc-${localCounter}-${Date.now().toString(36)}`;
}

/**
 * Local-anesthetic state. Holds the running list of carpule administrations
 * and derives the Malamed combined-% via the engine. Caller supplies
 * `now` (from `useNow`) so the live decay percent re-renders in lockstep
 * with the IV drug timers.
 */
export const useLocalAnestheticStore = defineStore('local', () => {
  const doses = ref<LocalDoseRecord[]>([]);

  function logCarpule(drugId: string, carpules = 1): LocalDoseRecord {
    const entry: LocalDoseRecord = {
      id: nextLocalId(),
      drugId,
      carpules,
      givenAt: Date.now(),
    };
    doses.value.push(entry);
    return entry;
  }

  function removeById(id: string): boolean {
    const idx = doses.value.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    doses.value.splice(idx, 1);
    return true;
  }

  function clear() {
    doses.value = [];
  }

  /** Engine wrapper — returns a fresh `LocalCombinedResult` for `(weight, now)`. */
  function combinedAt(weightLb: number, now: number): LocalCombinedResult {
    const engineDoses: EngineLocalDose[] = doses.value.map((d) => ({
      drugId: d.drugId,
      carpules: d.carpules,
      givenAt: d.givenAt,
    }));
    return localCombined(engineDoses, weightLb, now);
  }

  const lastLocalAt = computed(() => {
    if (doses.value.length === 0) return null;
    return doses.value[doses.value.length - 1]?.givenAt ?? null;
  });

  persistRefs('sedation-pro:local:v1', { doses });

  return {
    doses,
    lastLocalAt,
    logCarpule,
    removeById,
    clear,
    combinedAt,
  };
});
