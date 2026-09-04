import { describe, expect, it } from 'vitest';

import { DEFAULT_FORMULARY } from './default';
import { mergeFormulary, type FormularyOverrides } from './overrides';

describe('mergeFormulary', () => {
  /**
   * The load-bearing property: a practice that has changed nothing runs on
   * the shipped formulary itself, not on a copy of it. Identity — not deep
   * equality — is the assertion, because a copy taken at install time is
   * exactly what would freeze a practice out of future corrections.
   */
  it.each([
    ['no overrides recorded', {}],
    ['a null override blob', null],
    ['an undefined override blob', undefined],
  ])('returns the base formulary itself given %s', (_label, overrides) => {
    expect(mergeFormulary(DEFAULT_FORMULARY, overrides)).toBe(DEFAULT_FORMULARY);
  });

  it('replaces one pick-list and leaves its siblings on the shipped values', () => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, {
      picklists: { providers: ['Dr. Ada Lovelace'] },
    });

    expect(merged.picklists.providers).toEqual(['Dr. Ada Lovelace']);
    expect(merged.picklists.ivFluids).toEqual(DEFAULT_FORMULARY.picklists.ivFluids);
    expect(merged.picklists.dentalAssistants).toEqual(DEFAULT_FORMULARY.picklists.dentalAssistants);
  });

  it('overrides the practice name', () => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, { practiceName: 'Second Office' });

    expect(merged.practiceName).toBe('Second Office');
  });

  it('never mutates the base formulary', () => {
    const before = structuredClone(DEFAULT_FORMULARY);

    mergeFormulary(DEFAULT_FORMULARY, {
      practiceName: 'Elsewhere',
      picklists: { catheterGauges: ['18'] },
    });

    expect(DEFAULT_FORMULARY).toEqual(before);
  });

  /**
   * A practice with no EFDAs on staff is a real configuration, so an empty
   * list has to mean "none" rather than silently falling back to this
   * office's roster — which would put three strangers' names on their note.
   */
  it('honours an explicitly emptied list', () => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, {
      picklists: { dentalAssistants: [] },
    });

    expect(merged.picklists.dentalAssistants).toEqual([]);
  });

  /**
   * Overrides are user-edited data that survives a reload, so a corrupted or
   * hand-mangled blob must not take the app down at boot. Anything that is
   * not an array falls back to the shipped list.
   */
  it('ignores a non-array pick-list from a corrupted blob', () => {
    const corrupt = { picklists: { providers: 'Dr. Nobody' } } as unknown as FormularyOverrides;

    const merged = mergeFormulary(DEFAULT_FORMULARY, corrupt);

    expect(merged.picklists.providers).toEqual(DEFAULT_FORMULARY.picklists.providers);
  });

  /**
   * Drug data, ceilings and wait windows are a separate tier that this type
   * deliberately cannot reach — they are clinical safety values, and the
   * only way to change them stays a code change until the gated editor
   * exists. This test is the tripwire on that boundary.
   */
  it('leaves drugs, ceilings and timings untouched', () => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, {
      practiceName: 'Second Office',
      picklists: { providers: ['Dr. Ada Lovelace'] },
    });

    expect(merged.ceilings).toBe(DEFAULT_FORMULARY.ceilings);
    expect(merged.timings).toBe(DEFAULT_FORMULARY.timings);
    expect(merged.iv).toBe(DEFAULT_FORMULARY.iv);
    expect(merged.oral).toBe(DEFAULT_FORMULARY.oral);
    expect(merged.locals).toBe(DEFAULT_FORMULARY.locals);
  });
});

describe('mergeFormulary guards on the practice name', () => {
  /**
   * The practice name is the letterhead on a medicolegal record. A blank one
   * is never a deliberate edit, so it falls back to the shipped name rather
   * than printing an unattributed note.
   */
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('ignores %s', (_label, practiceName) => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, { practiceName });

    expect(merged.practiceName).toBe(DEFAULT_FORMULARY.practiceName);
  });

  it('trims a name that was pasted with stray spacing', () => {
    const merged = mergeFormulary(DEFAULT_FORMULARY, { practiceName: '  Second Office  ' });

    expect(merged.practiceName).toBe('Second Office');
  });
});
