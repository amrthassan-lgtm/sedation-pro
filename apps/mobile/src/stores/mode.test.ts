import { describe, beforeEach, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { useModeStore } from './mode';

describe('mode store — Training⇄Clinical toggle', () => {
  beforeEach(() => {
    // persistRefs() reads from localStorage on store init; without clearing,
    // values written by an earlier test would re-hydrate the next store and
    // mask the assertion under test.
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('defaults to Clinical (training === false)', () => {
    const mode = useModeStore();
    expect(mode.training).toBe(false);
  });

  it('toggle() flips between Clinical and Training', () => {
    const mode = useModeStore();
    mode.toggle();
    expect(mode.training).toBe(true);
    mode.toggle();
    expect(mode.training).toBe(false);
  });

  it('persists across a fresh pinia + store instance', async () => {
    const mode = useModeStore();
    mode.toggle();
    expect(mode.training).toBe(true);
    // Let the deep watcher flush the write to localStorage.
    await nextTick();

    setActivePinia(createPinia());
    const rehydrated = useModeStore();
    expect(rehydrated.training).toBe(true);
  });
});
