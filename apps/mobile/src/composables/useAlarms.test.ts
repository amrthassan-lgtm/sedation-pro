import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';

import { useIVStore } from '@/stores/iv';
import { useAudioStore } from '@/stores/audio';
import { useEventLogStore } from '@/stores/event-log';
import { useAlarms } from './useAlarms';

/**
 * The chime now plays through an HTMLAudioElement (jsdom has no media
 * implementation), so we mock `Audio` and count play() calls as "chime
 * fired". The composable lazily constructs one element and caches it at
 * module scope, so the mock and the play counter live for the whole file;
 * `playCount` is reset per test.
 */
let playCount = 0;

class MockAudio {
  preload = '';
  muted = false;
  currentTime = 0;
  constructor(public src = '') {}
  play = vi.fn(() => {
    playCount += 1;
    return Promise.resolve();
  });
  pause = vi.fn();
}

describe('useAlarms', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    playCount = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00Z'));
    localStorage.clear();
    (globalThis as unknown as { Audio?: unknown }).Audio = MockAudio;
  });

  it('chimes once when Versed transitions from cooling to ready', async () => {
    const iv = useIVStore();
    // Log a Versed dose 2 minutes ago — still inside the 3-min cooling wait.
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(2 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Cross the 3-min ready threshold (no ramping tier on the default
    // formulary — cooling goes straight to ready).
    vi.advanceTimersByTime(2 * 60_000);
    await nextTick();

    expect(playCount).toBeGreaterThanOrEqual(1);
    scope.stop();
  });

  it('chimes for Fentanyl on its ready transition', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'fentanyl', mcg: 50 });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Push well past either drug's longest cooling+ramping window.
    vi.advanceTimersByTime(10 * 60_000);
    await nextTick();

    expect(playCount).toBeGreaterThanOrEqual(1);
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

    expect(playCount).toBe(0);
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

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('chimes when the pre-med wait clears (ready for IV start)', async () => {
    const eventLog = useEventLogStore();
    eventLog.append('Preoperative Oral Dose', { Drug: 'Triazolam', Dose: '0.25 mg' });

    // Advance 25 min before mount so the parallel release-wait (which is
    // anchored to the same oral pre-med via lastSedativeAt) is already
    // cleared at setup — that way the watcher's prevs capture release as
    // true and the only transition during the test window is premed.
    vi.advanceTimersByTime(25 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Cross the 30-min pre-med threshold.
    vi.advanceTimersByTime(6 * 60_000);
    await nextTick();

    expect(playCount).toBeGreaterThanOrEqual(1);
    scope.stop();
  });

  it('chimes the resolution motif when the IV-out wait clears', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });

    // Advance past the 3-min Versed redose-ready window first; mounting
    // *then* captures prevVersed='ready' so the redose chime can't fire
    // during this test — only the 20-min release transition should chime.
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Cross the 20-min standard release-wait threshold.
    vi.advanceTimersByTime(17 * 60_000);
    await nextTick();

    expect(playCount).toBeGreaterThanOrEqual(1);
    scope.stop();
  });

  it('does not chime release-ready on a no-sedative-given case', async () => {
    // No dose, no pre-med — releaseEligibility starts eligible:true with
    // reason 'no-sedative-given'. The watcher must never fire on this branch.
    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(30 * 60_000);
    await nextTick();

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('does not chime when release-ready flips within the first tick of a cold mount', async () => {
    // Cold-start scenario the user hit: a stale-day session restores an
    // IV dose just under the 20-min release window. The deadline crosses
    // within the first useNow tick after `useAlarms()` setup. The three
    // existing freshness gates (time-delta, visibility, data-changed) all
    // pass on this tick — only the first-tick suppression keeps the stale
    // END chime from firing while the resume-gate modal is still showing.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    // Advance to ~500 ms before the 20-min release deadline so the next
    // 1-s setInterval tick will cross it. The 4-min head-start also pushes
    // Versed past its 3-min ready threshold so prevVersed captures as
    // 'ready' and the redose chime can't muddle this test.
    vi.advanceTimersByTime(19 * 60_000 + 59_500);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // First tick after mount crosses the 20-min release deadline.
    vi.advanceTimersByTime(1_000);
    await nextTick();

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('does not chime when an undo flips release-eligibility false → true', async () => {
    // Scenario: a single Versed dose past the 20-min release window
    // (clinician already heard the END chime). They tap a redose by
    // accident — eligibility flips back to false (silent, no chime). They
    // realise the mistake and Undo the redose — `lastIvMedAt` drops back
    // to the older dose, eligibility flips true again. The watcher must
    // recognise this as a data-driven flip (not a time-driven one) and
    // stay silent.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });

    // Advance past the Versed redose-ready window so we mount with
    // prevVersed='ready' — the redose chime can't fire during this test.
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Cross the 20-min release threshold — END chime should fire once.
    vi.advanceTimersByTime(17 * 60_000);
    await nextTick();
    expect(playCount).toBeGreaterThanOrEqual(1);
    const afterFirst = playCount;

    // Accidental redose: eligibility flips back to false (no chime on
    // true → false).
    iv.logDose({ drug: 'versed', mg: 1 });
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(playCount).toBe(afterFirst);

    // Undo the accidental redose. `lastIvMedAt` drops back to the original
    // t=0 dose, eligibility flips true again — but it's a data-driven flip,
    // not a time-driven one, so no chime.
    const lastDose = iv.doses[iv.doses.length - 1];
    if (lastDose) iv.removeDoseById(lastDose.id);
    vi.advanceTimersByTime(2_000);
    await nextTick();

    expect(playCount).toBe(afterFirst);
    scope.stop();
  });
});
