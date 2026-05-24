import { describe, beforeEach, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { useModeStore } from './mode';

describe('mode store — Clinical vs Training toggle', () => {
  beforeEach(() => {
    // persistRefs() hydrates from localStorage on init; clear so each test
    // starts from the cold default rather than the previous test's residue.
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('defaults to Clinical mode (training === false)', () => {
    const mode = useModeStore();
    expect(mode.training).toBe(false);
  });

  it('toggle() flips training back and forth', () => {
    const mode = useModeStore();
    mode.toggle();
    expect(mode.training).toBe(true);
    mode.toggle();
    expect(mode.training).toBe(false);
  });

  it('persists training across pinia recreation', async () => {
    const mode = useModeStore();
    mode.training = true;
    // Let the deep watcher inside persistRefs flush to localStorage.
    await nextTick();
    expect(localStorage.getItem('sedation-pro:mode:v1')).toContain('"training":true');

    // Fresh pinia, same localStorage — the new store should hydrate to true.
    setActivePinia(createPinia());
    const reborn = useModeStore();
    expect(reborn.training).toBe(true);
  });
});
