import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';

import { useIVStore } from '@/stores/iv';
import { useAudioStore } from '@/stores/audio';
import { useEventLogStore } from '@/stores/event-log';
import { useAlarms } from './useAlarms';

/**
 * The chime plays through an HTMLAudioElement (happy-dom has no media
 * implementation), so we mock `Audio` and count play() calls as "chime
 * fired". The composable lazily constructs the elements and caches them
 * at module scope, so the mock and the play counter live for the whole
 * file; `playCount` is reset per test.
 *
 * Fake-timer note: `vi.advanceTimersByTime` executes each 1 s interval
 * callback with `Date.now()` advancing in lockstep, so every simulated
 * tick has a healthy 1000 ms delta — the arming grace (GRACE_MS) expires
 * ~4 s after mount and all multi-minute advances run fully armed.
 */
let playCount = 0;

class MockAudio {
  preload = '';
  muted = false;
  currentTime = 0;
  paused = true;
  constructor(public src = '') {}
  play = vi.fn(() => {
    playCount += 1;
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

describe('useAlarms', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    playCount = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00Z'));
    localStorage.clear();
    (globalThis as unknown as { Audio?: unknown }).Audio = MockAudio;
    // Module-scope `lastVisibleAt` survives across tests, and fake timers
    // rewind the clock each test — a visibility flip from a previous test
    // would otherwise sit "in the future" and pin the grace gate shut.
    // Re-dispatching at the fresh epoch normalizes it.
    document.dispatchEvent(new Event('visibilitychange'));
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
    // No workaround needed anymore: the release clock ignores the oral
    // pre-med entirely (releaseReady stays null all case), so the only
    // possible transition here is the 30-min premed clear.
    const eventLog = useEventLogStore();
    eventLog.append('Preoperative Oral Dose', { Drug: 'Triazolam', Dose: '0.25 mg' });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    // Cross the 30-min pre-med threshold.
    vi.advanceTimersByTime(30 * 60_000 + 2_000);
    await nextTick();

    expect(playCount).toBe(1);
    scope.stop();
  });

  it('a premed-only case never fires the release (END) chime', async () => {
    // THE reported phantom: with the old max(oral, IV) anchor, the
    // descending "case complete" motif fired at premed + 20 min — ten
    // minutes before the "start IV" chime. With IV-sedative-only
    // anchoring the release gate never arms, so three hours of premed-only
    // waiting produces exactly one chime (the 30-min premed clear).
    const eventLog = useEventLogStore();
    eventLog.append('Preoperative Oral Dose', { Drug: 'Triazolam', Dose: '0.25 mg' });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(180 * 60_000);
    await nextTick();

    expect(playCount).toBe(1);
    scope.stop();
  });

  it('records every fired chime in the persisted flight recorder', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000); // mount past redose-ready

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(17 * 60_000); // release clears at t+20
    await nextTick();
    expect(playCount).toBe(1);

    const log = JSON.parse(localStorage.getItem('sedation-pro:chime-log:v1') ?? '[]');
    expect(log.length).toBe(1);
    expect(log[0].kind).toBe('Release cleared');
    expect(typeof log[0].at).toBe('number');
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

  it('does not chime release-ready on a no-iv-sedative case', async () => {
    // No dose, no pre-med — releaseEligibility reports 'no-iv-sedative'
    // and the watcher surfaces null. Nothing to chime, ever.
    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(30 * 60_000);
    await nextTick();

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('a completely empty case stays silent through hours, resumes, and freezes', async () => {
    // Field report 2026-08: "opened the app, it played a stale chime, no
    // drug pushes at all." With empty stores every transition source is
    // null — this fuzz locks that no tick pattern (long healthy runs,
    // visibility flips, frozen jumps) can produce audio from nothing.
    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    for (let hour = 0; hour < 3; hour += 1) {
      vi.advanceTimersByTime(45 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(5 * 60_000);
      vi.setSystemTime(Date.now() + 10 * 60_000); // frozen jump
      vi.advanceTimersByTime(10 * 60_000);
      await nextTick();
    }

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('a restored premed already past its wait does not chime on open', async () => {
    // Resume-yesterday's-chart scenario: the premed event hydrates with
    // its 30-min wait long since cleared. premedReady is true at mount —
    // prev captures true, no transition, no chime.
    const eventLog = useEventLogStore();
    eventLog.append('Preoperative Oral Dose', { Drug: 'Triazolam', Dose: '0.25 mg' });
    vi.advanceTimersByTime(3 * 60 * 60_000); // logged 3 hours ago

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    vi.advanceTimersByTime(10 * 60_000);
    await nextTick();

    expect(playCount).toBe(0);
    scope.stop();
  });

  it('Zofran neither extends the release wait nor chimes on its own', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000); // mount with Versed already 'ready'

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    // Zofran at t+15 min. Under the old any-IV-med anchor this pushed the
    // release deadline to t+35; the sedative-only anchor keeps it at t+20.
    vi.advanceTimersByTime(11 * 60_000);
    iv.logDose({ drug: 'zofran', mg: 4 });
    vi.advanceTimersByTime(5 * 60_000 + 2_000);
    await nextTick();

    expect(playCount).toBe(1);
    scope.stop();
  });

  it('logging and undoing Zofran after release stays silent', async () => {
    // The reported undo phantom: END chime heard, Zofran mis-tapped, then
    // undone. Under the old anchor the undo dropped lastIvMedAt back and
    // re-flipped eligibility → instant false END chime (and Zofran was
    // missing from the data guard). Now Zofran is simply not an input.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(17 * 60_000); // END fires at t+20
    await nextTick();
    expect(playCount).toBe(1);

    const zofran = iv.logDose({ drug: 'zofran', mg: 4 });
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(playCount).toBe(1);

    iv.removeDoseById(zofran.id);
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(playCount).toBe(1);
    scope.stop();
  });

  it('naloxone does not defer the release chime', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(6 * 60_000); // t+10: naloxone given
    iv.logDose({ drug: 'naloxone', mg: 0.4 });
    vi.advanceTimersByTime(10 * 60_000 + 2_000); // crosses t+20
    await nextTick();

    // END fired on the Versed-anchored deadline, not deferred to t+30.
    expect(playCount).toBe(1);
    scope.stop();
  });

  it('flumazenil defers the END chime to 120 min after the reversal', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(60_000); // t+5: reversal
    iv.logDose({ drug: 'flumazenil', mg: 0.2 });

    // Standard t+20 crossing must stay silent — the reversal owns the clock.
    vi.advanceTimersByTime(20 * 60_000);
    await nextTick();
    expect(playCount).toBe(0);

    // Reversal + 120 min = t+125 → the single END chime.
    vi.advanceTimersByTime(100 * 60_000 + 2_000);
    await nextTick();
    expect(playCount).toBe(1);
    scope.stop();
  });

  it('discards (not defers) a release crossing inside the mount grace window', async () => {
    // Cold-start: a restored session's release deadline crosses ~2 s
    // after mount — inside GRACE_MS. Silent catch-up means the chime is
    // discarded entirely, not replayed once the grace expires.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(19 * 60_000 + 59_500);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(1_000); // crossing, 1 s after mount
    await nextTick();
    expect(playCount).toBe(0);

    vi.advanceTimersByTime(10_000); // grace expired — still nothing
    await nextTick();
    expect(playCount).toBe(0);
    scope.stop();
  });

  it('a hidden→visible flip re-arms the grace window and discards the crossing', async () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    // Run armed to 19:57, then the app comes back to the foreground.
    vi.advanceTimersByTime(15 * 60_000 + 57_000);
    document.dispatchEvent(new Event('visibilitychange')); // visibilityState is 'visible' in happy-dom

    // Deadline crosses 3 s later — inside the re-armed grace → discarded.
    vi.advanceTimersByTime(3_000);
    await nextTick();
    expect(playCount).toBe(0);

    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(playCount).toBe(0);
    scope.stop();
  });

  it('a frozen tick that jumps past the deadline stays silent', async () => {
    // Background freeze: the interval stops firing, then one tick lands
    // with a huge delta that crossed the deadline. Stale tick → discard.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(6 * 60_000); // healthy to t+10
    vi.setSystemTime(Date.now() + 15 * 60_000); // freeze jump past t+20
    vi.advanceTimersByTime(1_000); // single stale tick
    await nextTick();
    expect(playCount).toBe(0);

    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(playCount).toBe(0);
    scope.stop();
  });

  it('logging Versed on the tick Fentanyl goes ready does not swallow the Fentanyl chime', async () => {
    // Regression for the old single dataChanged boolean, which suppressed
    // ALL chimes whenever ANY tracked timestamp moved.
    const iv = useIVStore();
    iv.logDose({ drug: 'fentanyl', mcg: 50 });

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();

    vi.advanceTimersByTime(4 * 60_000 + 59_000);
    iv.logDose({ drug: 'versed', mg: 1 }); // data edit on the crossing tick
    vi.advanceTimersByTime(2_000); // Fentanyl's 5-min ready threshold crosses
    await nextTick();

    expect(playCount).toBe(1);
    scope.stop();
  });

  it('does not chime when an undo flips release-eligibility false → true', async () => {
    // Accidental Versed redose after the END chime, then Undo: the anchor
    // (lastIvSedativeAt) drops back and eligibility re-flips true. The
    // release guard sees its own input changed → data-driven → silent.
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    vi.advanceTimersByTime(4 * 60_000);

    const scope = effectScope();
    scope.run(() => useAlarms());
    await nextTick();
    expect(playCount).toBe(0);

    vi.advanceTimersByTime(17 * 60_000);
    await nextTick();
    expect(playCount).toBeGreaterThanOrEqual(1);
    const afterFirst = playCount;

    iv.logDose({ drug: 'versed', mg: 1 });
    vi.advanceTimersByTime(2_000);
    await nextTick();
    expect(playCount).toBe(afterFirst);

    const lastDose = iv.doses[iv.doses.length - 1];
    if (lastDose) iv.removeDoseById(lastDose.id);
    vi.advanceTimersByTime(2_000);
    await nextTick();

    expect(playCount).toBe(afterFirst);
    scope.stop();
  });
});

describe('unlockAudio', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  interface UnlockMockControls {
    instances: Array<{ play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }>;
  }

  function installAudioMock(opts: { reject: boolean; startPlaying?: boolean }): UnlockMockControls {
    const controls: UnlockMockControls = { instances: [] };
    class UnlockMockAudio {
      preload = '';
      muted = false;
      currentTime = 0;
      paused = !opts.startPlaying;
      constructor(public src = '') {
        controls.instances.push(this as unknown as UnlockMockControls['instances'][number]);
      }
      play = vi.fn(() =>
        opts.reject ? Promise.reject(new Error('gesture required')) : Promise.resolve(),
      );
      pause = vi.fn();
    }
    (globalThis as unknown as { Audio?: unknown }).Audio = UnlockMockAudio;
    return controls;
  }

  it('does not latch unlocked when priming is rejected — the next gesture retries', async () => {
    const controls = installAudioMock({ reject: true });
    const mod = await import('./useAlarms');

    mod.unlockAudio();
    await Promise.resolve();
    await Promise.resolve();
    const callsAfterFirst = controls.instances.map((el) => el.play.mock.calls.length);
    expect(callsAfterFirst.every((n) => n === 1)).toBe(true);

    // Old bug: a failed priming latched `unlocked = true` and this second
    // call would early-return, leaving audio permanently broken.
    mod.unlockAudio();
    await Promise.resolve();
    const callsAfterSecond = controls.instances.map((el) => el.play.mock.calls.length);
    expect(callsAfterSecond.every((n) => n === 2)).toBe(true);
  });

  it('latches unlocked on successful priming — later calls are no-ops', async () => {
    const controls = installAudioMock({ reject: false });
    const mod = await import('./useAlarms');

    mod.unlockAudio();
    await Promise.resolve();
    await Promise.resolve();

    mod.unlockAudio();
    await Promise.resolve();
    const calls = controls.instances.map((el) => el.play.mock.calls.length);
    expect(calls.every((n) => n === 1)).toBe(true);
  });

  it('never pauses an element that is currently playing', async () => {
    const controls = installAudioMock({ reject: false, startPlaying: true });
    const mod = await import('./useAlarms');

    mod.unlockAudio();
    await Promise.resolve();
    await Promise.resolve();

    // A playing element is already unlocked by definition: no priming
    // play(), and crucially no pause() cutting off the live chime.
    for (const el of controls.instances) {
      expect(el.play).not.toHaveBeenCalled();
      expect(el.pause).not.toHaveBeenCalled();
    }
  });
});
