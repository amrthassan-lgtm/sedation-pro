import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { EncounterKind } from '@sedation-pro/clinical';

import type { ClinicalNote } from '@/composables/useClinicalNote';
import { persistRefs } from './persistence';

/**
 * Practice-level and deliberately outside the per-case keys: this is the one
 * thing "Start new case" must not touch, so it is listed in
 * `useCaseReset`'s preserved set.
 */
export const NOTE_ARCHIVE_KEY = 'sedation-pro:notes:v1';

/**
 * A note as it read at the moment the encounter finished.
 *
 * `useClinicalNote` is a live `computed` — it re-renders from whatever is in
 * the stores right now. That is correct while a case is open and fatal
 * afterwards: most of this practice's work runs as two visits, so the moment
 * the first IV dose of the sedation visit lands, the assessment note signed
 * three weeks earlier stops existing and regenerates as a sedation note.
 *
 * Freezing is what makes a signed note a record rather than a projection.
 */
export interface FrozenNote {
  readonly id: string;
  /** Epoch ms the note was frozen — the archive is ordered by this. */
  readonly frozenAt: number;
  readonly kind: EncounterKind;
  /** Denormalised so the list renders without rehydrating every note. */
  readonly patientName: string;
  readonly mrn: string;
  readonly note: ClinicalNote;
}

export const useNoteArchiveStore = defineStore('note-archive', () => {
  const notes = ref<FrozenNote[]>([]);

  /** Newest first — the case you are most likely looking for. */
  const byNewest = computed<ReadonlyArray<FrozenNote>>(() =>
    [...notes.value].sort((a, b) => b.frozenAt - a.frozenAt),
  );

  const count = computed(() => notes.value.length);

  function find(id: string): FrozenNote | undefined {
    return notes.value.find((n) => n.id === id);
  }

  /**
   * Append-only by design. A frozen note is the record of a finished
   * encounter, so nothing here edits one in place — the only way to change
   * what it says is to have said it differently before concluding.
   */
  function freeze(entry: Omit<FrozenNote, 'id' | 'frozenAt'>): FrozenNote {
    const frozen: FrozenNote = {
      ...entry,
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      frozenAt: Date.now(),
    };
    notes.value = [...notes.value, frozen];
    return frozen;
  }

  /**
   * Deleting is explicit and per-note. There is no "clear all": the archive
   * exists precisely so a note cannot be lost by accident.
   */
  function remove(id: string): boolean {
    const before = notes.value.length;
    notes.value = notes.value.filter((n) => n.id !== id);
    return notes.value.length !== before;
  }

  persistRefs(NOTE_ARCHIVE_KEY, { notes });

  return { notes, byNewest, count, find, freeze, remove };
});
