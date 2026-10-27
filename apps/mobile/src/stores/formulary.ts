import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { DEFAULT_FORMULARY, mergeFormulary, type PracticePicklists } from '@sedation-pro/clinical';

import { persistRefs } from './persistence';

/**
 * Practice-level, not per-case: this outlives "Start new case" and is listed
 * in `useCaseReset`'s preserved keys. Wiping it would silently return the
 * practice to this office's roster mid-day.
 */
export const FORMULARY_KEY = 'sedation-pro:formulary:v1';

export type PicklistKey = keyof PracticePicklists;

function sameList(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

/**
 * The formulary the practice actually runs on: the shipped
 * `DEFAULT_FORMULARY` with this practice's edits layered over it.
 *
 * Only the diff is stored. A practice that has never opened the editor runs
 * on the shipped object itself, so a future correction to the formulary
 * still reaches them — which a full copy taken at setup would prevent
 * forever.
 *
 * Scope is deliberately the roster and pick-lists. Drugs, ceilings and wait
 * windows are a separate tier and the `FormularyOverrides` type cannot
 * express them.
 */
export const useFormularyStore = defineStore('formulary', () => {
  /** Empty means "not overridden" — see `mergeFormulary`. */
  const practiceNameOverride = ref('');
  const picklistOverrides = ref<Partial<Record<PicklistKey, string[]>>>({});

  const active = computed(() =>
    mergeFormulary(DEFAULT_FORMULARY, {
      ...(practiceNameOverride.value.trim() === ''
        ? {}
        : { practiceName: practiceNameOverride.value }),
      picklists: picklistOverrides.value,
    }),
  );

  const picklists = computed(() => active.value.picklists);
  const practiceName = computed(() => active.value.practiceName);

  function isOverridden(key: PicklistKey): boolean {
    return picklistOverrides.value[key] !== undefined;
  }

  function shippedList(key: PicklistKey): ReadonlyArray<string> {
    return DEFAULT_FORMULARY.picklists[key];
  }

  /**
   * Entries are trimmed and de-duplicated because they are typed by hand and
   * land verbatim on a medicolegal note — "Dr. Amr Hassan " and
   * "Dr. Amr Hassan" must not read as two different clinicians.
   *
   * Setting a list back to the shipped values drops the override rather than
   * recording an identical one, so "unchanged" stays a real state.
   */
  function setList(key: PicklistKey, entries: ReadonlyArray<string>): void {
    const cleaned = [...new Set(entries.map((entry) => entry.trim()).filter((e) => e !== ''))];
    if (sameList(cleaned, shippedList(key))) {
      delete picklistOverrides.value[key];
      return;
    }
    picklistOverrides.value[key] = cleaned;
  }

  function restoreList(key: PicklistKey): void {
    delete picklistOverrides.value[key];
  }

  function restoreAll(): void {
    picklistOverrides.value = {};
    practiceNameOverride.value = '';
  }

  persistRefs(FORMULARY_KEY, { practiceNameOverride, picklistOverrides });

  return {
    active,
    picklists,
    practiceName,
    practiceNameOverride,
    isOverridden,
    shippedList,
    setList,
    restoreList,
    restoreAll,
  };
});
