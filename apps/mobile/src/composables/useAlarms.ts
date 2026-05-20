import { computed, watch } from 'vue';

import { useAudioStore } from '@/stores/audio';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useNow } from '@/composables/useNow';
import { haptic } from '@/composables/useHaptics';
import { premedWait, releaseEligibility } from '@sedation-pro/clinical';

/**
 * Audio alerts — synthesized chimes that fire at the four "you may now…"
 * transitions of a sedation case:
 *
 *  1. Pre-med wait cleared (oral pre-med given → 30 min elapsed) — patient
 *     is ready for IV start.
 *  2. Versed redose ready (cooling + ramping windows elapsed).
 *  3. Fentanyl redose ready (cooling window elapsed).
 *  4. IV-out / release wait cleared — the post-last-IV-med observation
 *     window has elapsed (20 min standard / 120 min after flumazenil).
 *
 * Two distinct sounds, deliberately:
 *  - Transitions 1–3 share the **ascending** "you may proceed" motif
 *    (E5 → A5 → D6 → G6). They are all mid-case go-ahead cues — a single
 *    motif means less to learn.
 *  - Transition 4 uses a distinct **descending** resolution motif
 *    (G5 → E5 → C5, a settled C-major cadence). The supervised window is
 *    *done* — a qualitatively different "released / case complete" sound so
 *    the clinician hears the end-of-case event without looking at the
 *    screen. The visual IV-out chip is the always-on truth; the chime is
 *    the audible cue.
 *
 * Why HTMLAudioElement and not the Web Audio API:
 *  - The chime *was* synthesized live with oscillators. That works on
 *    Android and desktop Chrome but never sounded on iOS at all — Safari
 *    tab *and* Home-Screen app alike. iOS gates audio hard on a real user
 *    gesture and an `AudioContext.resume()`-based unlock did not reliably
 *    take, so the timer-driven chime produced silence on every iPhone.
 *  - An `HTMLAudioElement` unlocked with a gesture-initiated muted
 *    play()/pause() is the proven cross-iOS path (Safari tab + standalone)
 *    and works on Android/desktop too, so it is the single portable path.
 *  - Still fully synthesized / no bundled asset: each motif is rendered to
 *    an in-memory PCM WAV data-URI once, lazily, with plain math (no
 *    AudioContext at all — removes every Web Audio quirk).
 *  - Audio + haptic pair on every alert. The mute flag silences audio
 *    only; haptics are a separate sensory channel.
 *  - First-run guard: initial transition state is captured at setup, so a
 *    hydrated store already in "ready" after reload does not beep on mount.
 *  - Stale-resume guard (three layers, belt-and-suspenders):
 *      * Time delta: when the `now` jump exceeds the tick interval by a
 *        lot, the transition resolved during a background freeze and is
 *        stale.
 *      * Visibility flag: when the page just transitioned from `hidden`
 *        to `visible`, the *next* tick is treated as stale regardless of
 *        the delta — iOS standalone occasionally produces coalesced ticks
 *        on resume that the time delta alone doesn't catch.
 *      * First-tick suppression: the very first watcher invocation after
 *        mount never fires a chime, regardless of state. Cold-starts with
 *        a stale-day session can carry a state transition that the other
 *        two gates miss (e.g. a `releaseReady` that flips false→true
 *        within the first second because the deadline crossed in the gap
 *        between store-hydration and the first tick). Cost: a true
 *        transition that lands exactly on the first tick after mount is
 *        missed by ~1 s — acceptable because active cases mount long
 *        before any redose-ready / release-ready transition is due.
 *  - Data-driven suppression: if any source timestamp (`lastVersedAt`,
 *    `lastFentanylAt`, `lastFlumazenilAt`, `lastOralPremedAt`) changed
 *    between ticks, the transition was caused by a dose log or an undo —
 *    not by time elapsing — so no chime fires that tick. Without this,
 *    undoing a recent IV dose could drop `lastIvMedAt` back far enough
 *    that release-eligibility flips false → true and fires a false
 *    "case complete" ding.
 *
 * Note: this does not defeat the iPhone hardware Ring/Silent switch (iOS
 * routes web audio through the ringer channel; only a native AVAudioSession
 * can override that). With the ringer on, the chime now sounds.
 */

const SAMPLE_RATE = 22050;

interface Motif {
  /** Pulse frequencies in Hz, played in order. */
  readonly pulses: ReadonlyArray<number>;
  readonly pulseSec: number;
  readonly gapSec: number;
  readonly peak: number;
  readonly attackSec: number;
  readonly releaseSec: number;
}

/** Ascending E5 → G6 — "you may proceed" (pre-med clear, redose ready). */
const READY_MOTIF: Motif = {
  pulses: [659, 880, 1175, 1568],
  pulseSec: 0.38,
  gapSec: 0.1,
  peak: 0.6,
  attackSec: 0.02,
  releaseSec: 0.06,
};

/** Descending G5 → E5 → C5 — settled C-major cadence: "case complete". */
const END_MOTIF: Motif = {
  pulses: [784, 659, 523],
  pulseSec: 0.5,
  gapSec: 0.08,
  peak: 0.55,
  attackSec: 0.025,
  releaseSec: 0.1,
};

/** Render a motif to 16-bit mono PCM samples (pure math, no Web Audio). */
function renderMotif(m: Motif): Int16Array {
  const slot = m.pulseSec + m.gapSec;
  const total = Math.ceil(m.pulses.length * slot * SAMPLE_RATE);
  const pcm = new Int16Array(total);
  m.pulses.forEach((freq, i) => {
    const startSample = Math.floor(i * slot * SAMPLE_RATE);
    const len = Math.floor(m.pulseSec * SAMPLE_RATE);
    for (let s = 0; s < len; s += 1) {
      const t = s / SAMPLE_RATE;
      const phase = (freq * t) % 1;
      const tri = 4 * Math.abs(phase - 0.5) - 1;
      let env = 1;
      if (t < m.attackSec) env = t / m.attackSec;
      else if (t > m.pulseSec - m.releaseSec) env = Math.max(0, (m.pulseSec - t) / m.releaseSec);
      const idx = startSample + s;
      if (idx < total) pcm[idx] = Math.round(tri * env * m.peak * 0x7fff);
    }
  });
  return pcm;
}

/** Wrap PCM samples in a 44-byte WAV header and base64 into a data URI. */
function pcmToWavDataUri(pcm: Int16Array): string {
  const dataLen = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ascii = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i += 1) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, SAMPLE_RATE, true);
  dv.setUint32(28, SAMPLE_RATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i += 1) dv.setInt16(44 + i * 2, pcm[i]!, true);

  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

let readyEl: HTMLAudioElement | null = null;
let endEl: HTMLAudioElement | null = null;
let unlocked = false;

function ensure(motif: Motif, slot: 'ready' | 'end'): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (slot === 'ready' && readyEl) return readyEl;
  if (slot === 'end' && endEl) return endEl;
  const el = new Audio(pcmToWavDataUri(renderMotif(motif)));
  el.preload = 'auto';
  if (slot === 'ready') readyEl = el;
  else endEl = el;
  return el;
}

/**
 * Unlock both audio elements on a user gesture (App.vue's pointerdown +
 * visibilitychange). iOS only allows later programmatic `play()` once an
 * element has been played from within a gesture; a muted play()/pause()
 * satisfies that without an audible blip. Both elements are primed from
 * the same gesture so either chime can fire later. Runs at most once —
 * re-running on every pointerdown would cut off a chime that is playing
 * when the clinician taps.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const a = ensure(READY_MOTIF, 'ready');
  const b = ensure(END_MOTIF, 'end');
  if (!a || !b) return;
  const prime = (el: HTMLAudioElement): Promise<void> => {
    el.muted = true;
    const p = el.play();
    if (!p || typeof p.then !== 'function') return Promise.resolve();
    return p
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        el.muted = false;
      });
  };
  Promise.all([prime(a), prime(b)]).then(() => {
    unlocked = true;
  });
}

function play(slot: 'ready' | 'end', motif: Motif, muted: boolean): void {
  if (muted) return;
  const el = ensure(motif, slot);
  if (!el) return;
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

// `useNow` ticks every 1 s. A jump materially larger than that means real
// time skipped while the interval was frozen (app backgrounded), so any
// transition surfacing on this tick happened during the freeze and is
// stale. 5 s gives generous headroom over foreground timer jitter while
// being far below any real inactivity gap.
const TICK_MS = 1000;
const FRESH_WINDOW_MS = 5_000;

const ORAL_PREMED_EVENT = 'Preoperative Oral Dose';

// Belt-and-suspenders for the freshness gate: when the page just came back
// from `hidden`, the *next* tick is treated as stale regardless of the
// elapsed-time delta. iOS standalone PWAs occasionally produce coalesced
// or oddly-timed ticks on resume; the visibility signal is more direct
// than inferring "we just resumed" from time math alone. Module-scoped
// so the listener is installed exactly once.
let pendingResume = false;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pendingResume = true;
  });
}

/**
 * Install the four-transition alarm watcher. Call once from the app shell
 * (`App.vue`) so it lives for the app lifetime.
 *
 * A single `now` watcher owns the logic: it has the real elapsed time
 * (`curr - prev`) to gate staleness, and it tracks the previous transition
 * states itself, so there is no watcher-ordering dependency.
 */
export function useAlarms(): void {
  const iv = useIVStore();
  const audio = useAudioStore();
  const eventLog = useEventLogStore();
  const now = useNow(TICK_MS);

  // ---- Versed / Fentanyl redose ready (existing) ----
  const versedState = computed(() => iv.versedTimerAt(now.value)?.state ?? null);
  const fentanylState = computed(() => iv.fentanylTimerAt(now.value)?.state ?? null);

  // ---- Pre-med wait cleared (ready for IV start) ----
  // Only meaningful if an oral pre-med was actually given; otherwise the
  // engine returns `eligible: true` from the start (no-op transition, no
  // chime). We surface null in that case so the prev/curr comparison can
  // never fire.
  const lastOralPremedAt = computed<number | null>(() => {
    let latest: number | null = null;
    for (const e of eventLog.events) {
      if (e.event === ORAL_PREMED_EVENT && (latest === null || e.timestamp > latest)) {
        latest = e.timestamp;
      }
    }
    return latest;
  });
  const premedReady = computed<boolean | null>(() => {
    const at = lastOralPremedAt.value;
    if (at === null) return null;
    return premedWait({ lastPremedAt: at, now: now.value }).eligible;
  });

  // ---- IV-out / release wait cleared (end of supervised window) ----
  // Skip the `no-sedative-given` case — that branch is `eligible: true`
  // from t=0 (no wait to clear), so it must never chime.
  const lastSedativeAt = computed<number | null>(() => {
    const oral = lastOralPremedAt.value;
    const ivMed = iv.lastIvMedAt;
    if (oral === null) return ivMed;
    if (ivMed === null) return oral;
    return Math.max(oral, ivMed);
  });
  const releaseReady = computed<boolean | null>(() => {
    const r = releaseEligibility({
      lastSedativeAt: lastSedativeAt.value,
      lastFlumazenilAt: iv.lastFlumazenilAt,
      now: now.value,
    });
    if (r.reason === 'no-sedative-given') return null;
    return r.eligible;
  });

  function chimeReady(): void {
    play('ready', READY_MOTIF, audio.muted);
    haptic('light');
  }
  function chimeEnd(): void {
    play('end', END_MOTIF, audio.muted);
    // Heavier haptic for the case-complete event — weightier moment.
    haptic('medium');
  }

  let prevVersed = versedState.value;
  let prevFentanyl = fentanylState.value;
  let prevPremed = premedReady.value;
  let prevRelease = releaseReady.value;
  // First-tick suppression flag — see the "Stale-resume guard" notes at
  // the top of this file. The very first watcher invocation is always
  // treated as stale so a cold-start can't fire a chime even if a
  // transition slips through the time-delta + visibility gates.
  let firstTick = true;
  // Source timestamps that drive the four `*Ready` computeds. If any
  // changed between ticks, the transition was data-driven (a dose was
  // logged or undone) rather than time-driven — chimes should suppress.
  // Without this, undoing a recent IV dose can drop `lastIvMedAt` back
  // far enough that releaseReady flips false → true and fires a false
  // "case complete" ding.
  let prevVersedAt = iv.lastVersedAt;
  let prevFentanylAt = iv.lastFentanylAt;
  let prevFlumazenilAt = iv.lastFlumazenilAt;
  let prevPremedAt = lastOralPremedAt.value;

  // `flush: 'sync'` so each 1 s tick is evaluated on its own — the default
  // batched flush would coalesce many ticks into a single huge delta and
  // the freshness gate could never tell a normal second from a freeze.
  // Sync also matches reality: a background→resume is one jumped tick.
  watch(
    now,
    (curr, prev) => {
      const currVersedAt = iv.lastVersedAt;
      const currFentanylAt = iv.lastFentanylAt;
      const currFlumazenilAt = iv.lastFlumazenilAt;
      const currPremedAt = lastOralPremedAt.value;
      const dataChanged =
        currVersedAt !== prevVersedAt ||
        currFentanylAt !== prevFentanylAt ||
        currFlumazenilAt !== prevFlumazenilAt ||
        currPremedAt !== prevPremedAt;
      const fresh = !firstTick && !pendingResume && curr - prev <= FRESH_WINDOW_MS && !dataChanged;
      const v = versedState.value;
      const f = fentanylState.value;
      const pm = premedReady.value;
      const rl = releaseReady.value;
      if (fresh && v === 'ready' && prevVersed !== 'ready') chimeReady();
      if (fresh && f === 'ready' && prevFentanyl !== 'ready') chimeReady();
      if (fresh && pm === true && prevPremed !== true) chimeReady();
      if (fresh && rl === true && prevRelease !== true) chimeEnd();
      prevVersed = v;
      prevFentanyl = f;
      prevPremed = pm;
      prevRelease = rl;
      prevVersedAt = currVersedAt;
      prevFentanylAt = currFentanylAt;
      prevFlumazenilAt = currFlumazenilAt;
      prevPremedAt = currPremedAt;
      pendingResume = false;
      firstTick = false;
    },
    { flush: 'sync' },
  );
}
