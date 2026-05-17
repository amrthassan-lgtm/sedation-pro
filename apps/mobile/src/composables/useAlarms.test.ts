import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';

import { useIVStore } from '@/stores/iv';
import { useAudioStore } from '@/stores/audio';
import { useAlarms } from './useAlarms';

/**
 * Minimal AudioContext mock — counts oscillator starts as "tick fired".
 * Vitest's jsdom does not provide a Web Audio implementation, so we install
 * just enough surface for `tick()` to run without throwing.
 */
let oscillatorStarts = 0;

class MockOscillator {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn(() => this as unknown as MockGain);
  start = vi.fn(() => {
    oscillatorStarts += 1;
  });
  stop = vi.fn();
}

class MockGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn(() => ({}) as unknown);
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {} as unknown;
  createOscillator(): MockOscillator {
    return new MockOscillator();
  }
  createGain(): MockGain {
    return new MockGain();
  }
  resume = vi.fn();
}

describe('useAlarms', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    oscillatorStarts = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00Z'));
    localStorage.clear();
    // Reset the cached singleton inside useAlarms by deleting the global
    // AudioContext, then re-installing the mock — ensures each test gets a
    // fresh context. `globalThis` is the cross-environment shim.
    (globalThis as unknown as { AudioContext?: unknown }).AudioContext = MockAudioContext;
  });

  it('chimes once when Versed transitions from cooling to ready', async () => {
    const iv = useIVStore();
    // Log a Versed dose 2 minutes ago — still inside the 3-min cooling wait.
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(2 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(oscillatorStarts).toBe(0);

    // Cross the 3-min ready threshold (no ramping tier on the default
    // formulary — cooling goes straight to ready).
    vi.advanceTimersByTime(2 * 60_000);
    await nextTick();

    expect(oscillatorStarts).toBeGreaterThanOrEqual(1);
    scope.stop();
  });

  it('chimes for Fentanyl on its ready transition', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'fentanyl', mcg: 50 });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(oscillatorStarts).toBe(0);

    // Push well past either drug's longest cooling+ramping window.
    vi.advanceTimersByTime(10 * 60_000);
    await nextTick();

    expect(oscillatorStarts).toBeGreaterThanOrEqual(1);
    scope.stop();
  });

  it('does not chime on hydration (state already ready at mount)', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    // Advance time first so the timer is already in `ready` state...
    vi.advanceTimersByTime(10 * 60_000);

    // ...then mount the composable. The watcher subscribes with state
    // already at `ready` and should NOT fire — Vue's `watch` without
    // `immediate: true` only fires on subsequent changes.
    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    vi.advanceTimersByTime(5_000);
    await nextTick();

    expect(oscillatorStarts).toBe(0);
    scope.stop();
  });

  it('suppresses audio when muted but still fires the watcher', async () => {
    const iv = useIVStore();
    const audio = useAudioStore();
    audio.muted = true;

    iv.logDose({ drug: 'versed', mg: 2 });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(10 * 60_000);
    await nextTick();

    expect(oscillatorStarts).toBe(0);
    scope.stop();
  });
});
