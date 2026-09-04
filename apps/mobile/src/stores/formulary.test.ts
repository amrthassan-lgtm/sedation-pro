import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_FORMULARY } from '@sedation-pro/clinical';

import { useFormularyStore } from './formulary';
import { usePatientStore } from './patient';
import { PRESERVED_KEYS } from '@/composables/useCaseReset';
import { FORMULARY_KEY } from './formulary';

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

describe('the unedited practice', () => {
  /**
   * Identity, not deep equality. A practice that has changed nothing must be
   * running on the shipped formulary object itself — the moment it is a copy,
   * they are pinned to whatever shipped the day they installed and no later
   * correction can reach them.
   */
  it('runs on the shipped formulary itself', () => {
    expect(useFormularyStore().active).toBe(DEFAULT_FORMULARY);
  });

  it('reports every list as not overridden', () => {
    const f = useFormularyStore();

    expect(f.isOverridden('providers')).toBe(false);
    expect(f.isOverridden('dentalAssistants')).toBe(false);
  });
});

describe('editing a list', () => {
  it('takes effect on the active formulary', () => {
    const f = useFormularyStore();

    f.setList('providers', ['Dr. Ada Lovelace', 'Dr. Grace Hopper']);

    expect(f.picklists.providers).toEqual(['Dr. Ada Lovelace', 'Dr. Grace Hopper']);
    expect(f.isOverridden('providers')).toBe(true);
  });

  it('leaves the lists it did not touch on the shipped values', () => {
    const f = useFormularyStore();

    f.setList('providers', ['Dr. Ada Lovelace']);

    expect(f.picklists.ivFluids).toEqual(DEFAULT_FORMULARY.picklists.ivFluids);
  });

  /**
   * These strings land verbatim on a medicolegal note, so a stray space must
   * not produce what reads as a second clinician.
   */
  it('trims entries and drops blanks and duplicates', () => {
    const f = useFormularyStore();

    f.setList('dentalAssistants', [
      '  Kim Lee, EFDA ',
      '',
      'Kim Lee, EFDA',
      '   ',
      'Jo Diaz, EFDA',
    ]);

    expect(f.picklists.dentalAssistants).toEqual(['Kim Lee, EFDA', 'Jo Diaz, EFDA']);
  });

  it('accepts an emptied list, since a practice may have no assistants', () => {
    const f = useFormularyStore();

    f.setList('dentalAssistants', []);

    expect(f.picklists.dentalAssistants).toEqual([]);
    expect(f.isOverridden('dentalAssistants')).toBe(true);
  });

  /**
   * Typing the shipped values back in by hand has to leave the practice
   * genuinely unedited, not carrying an override that happens to match —
   * otherwise they quietly stop receiving corrections to that list.
   */
  it('drops the override when a list is set back to the shipped values', () => {
    const f = useFormularyStore();

    f.setList('providers', ['Dr. Ada Lovelace']);
    f.setList('providers', [...DEFAULT_FORMULARY.picklists.providers]);

    expect(f.isOverridden('providers')).toBe(false);
    expect(f.active).toBe(DEFAULT_FORMULARY);
  });

  it('restores one list without disturbing another', () => {
    const f = useFormularyStore();
    f.setList('providers', ['Dr. Ada Lovelace']);
    f.setList('catheterGauges', ['18']);

    f.restoreList('providers');

    expect(f.picklists.providers).toEqual(DEFAULT_FORMULARY.picklists.providers);
    expect(f.picklists.catheterGauges).toEqual(['18']);
  });

  it('restores everything at once', () => {
    const f = useFormularyStore();
    f.setList('providers', ['Dr. Ada Lovelace']);
    f.practiceNameOverride = 'Second Office';

    f.restoreAll();

    expect(f.active).toBe(DEFAULT_FORMULARY);
  });
});

describe('the practice name', () => {
  it('overrides the letterhead when set', () => {
    const f = useFormularyStore();

    f.practiceNameOverride = 'Second Office';

    expect(f.practiceName).toBe('Second Office');
  });

  it('falls back to the shipped name when blanked', () => {
    const f = useFormularyStore();
    f.practiceNameOverride = 'Second Office';

    f.practiceNameOverride = '   ';

    expect(f.practiceName).toBe(DEFAULT_FORMULARY.practiceName);
  });
});

describe('durability', () => {
  it('survives a reload', async () => {
    useFormularyStore().setList('providers', ['Dr. Ada Lovelace']);
    // persistRefs writes from a deep watcher, so the snapshot lands on the
    // next tick rather than inside setList.
    await nextTick();

    // Fresh pinia, same localStorage — what a tablet reload looks like.
    setActivePinia(createPinia());

    expect(useFormularyStore().picklists.providers).toEqual(['Dr. Ada Lovelace']);
  });

  /**
   * "Start new case" wipes per-CASE keys. The roster is per-PRACTICE, and
   * losing it mid-day would silently put this office's staff back on another
   * practice's notes.
   */
  it('is preserved across Start new case', () => {
    expect(PRESERVED_KEYS.has(FORMULARY_KEY)).toBe(true);
  });
});

describe('what a fresh case is seeded with', () => {
  /**
   * The bug this replaced: the provider and assistant were literals, and
   * `reset()` re-applied them — so a clinician removed in Settings came back
   * on the next case, and on the note.
   */
  it('names the practice roster, not the shipped one', async () => {
    useFormularyStore().setList('providers', ['Dr. Ada Lovelace', 'Dr. Grace Hopper']);
    useFormularyStore().setList('dentalAssistants', ['Kim Lee, EFDA']);
    await nextTick();
    setActivePinia(createPinia());

    const patient = usePatientStore();

    expect(patient.provider).toBe('Dr. Ada Lovelace');
    expect(patient.assistants).toBe('Kim Lee, EFDA');
  });

  it('keeps naming the roster after Start new case', async () => {
    useFormularyStore().setList('providers', ['Dr. Ada Lovelace']);
    await nextTick();
    setActivePinia(createPinia());
    const patient = usePatientStore();
    patient.provider = 'Dr. Someone Else';

    patient.reset();

    expect(patient.provider).toBe('Dr. Ada Lovelace');
  });

  /**
   * An empty roster is a legitimate mid-setup state (a new practice clearing
   * the shipped names before typing their own). It must leave the field
   * blank rather than crash the store that every phase depends on.
   */
  it('falls back to blank when the roster is empty', async () => {
    useFormularyStore().setList('providers', []);
    await nextTick();
    setActivePinia(createPinia());

    expect(usePatientStore().provider).toBe('');
  });
});
