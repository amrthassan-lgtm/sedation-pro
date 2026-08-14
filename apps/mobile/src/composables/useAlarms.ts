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
 *  4. IV-out / release wait cleared — the observation window after the
 *     last IV *sedative* (Versed/Fentanyl) has elapsed (20 min standard /
 *     120 min after flumazenil). Oral pre-med, Zofran, and naloxone
 *     neither start nor reset this window.
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
 *  - Silent catch-up (owner decision): a chime only fires for a
 *    transition observed LIVE on a healthy foreground tick cadence.
 *    Deadlines that pass while the app is closed, backgrounded, or
 *    frozen surface visually only — never as audio on open/resume. Two
 *    orthogonal gates enforce this:
 *      * Stale tick: a watcher delta above `STALE_TICK_MS` (2× the tick
 *        interval) means at least one whole tick was skipped — the
 *        transition resolved during a freeze, so it is discarded.
 *      * Arming grace: chimes arm only after `GRACE_MS` of continuous
 *        healthy ticking since mount, since the last stale tick, and
 *        since the last hidden→visible flip. This outlasts the coalesced
 *        tick bursts iOS delivers on resume and covers the cold-start
 *        gap between store hydration and the first tick. Cost: a true
 *        transition landing inside the grace window is discarded (~4 s
 *        against a ≥3 min clinical window; the visual state still
 *        shows it).
 *    Suppressed transitions are discarded, not deferred — `prev*`
 *    snapshots update every tick regardless.
 *  - Per-chime data suppression: each chime is suppressed only when ITS
 *    OWN source timestamps changed that tick (a dose log or undo is a
 *    data edit, not time elapsing). Guards are per-chime so logging a
 *    Versed dose on the exact tick the Fentanyl timer goes ready cannot
 *    swallow the Fentanyl chime. The release chime's inputs are
 *    `lastIvSedativeAt` + `lastFlumazenilAt` only — Zofran/naloxone are
 *    not inputs to the release computation, so their logs and undos
 *    cannot flip it at all.
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
let readyUnlocked = false;
let endUnlocked = false;

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
 * Unlock both audio elements on a user gesture (App.vue's persistent
 * pointerdown listener). iOS only allows later programmatic `play()`
 * once an element has been played from within a gesture; a muted
 * play()/pause() satisfies that without an audible blip.
 *
 * The latch is per-element and set ONLY when priming provably succeeded
 * (`play()`'s promise resolved). A rejected priming — e.g. any call
 * outside a real gesture — leaves the latch clear so the next tap
 * retries; the old single boolean latched on failure too, which
 * permanently bricked audio and left a pending play() to sound on the
 * next touch ("phantom chime when I open the app"). An element that is
 * currently *playing* is already unlocked by definition and is never
 * paused — priming must not cut off a live chime.
 */
/**
 * One unlock entry per page load, not per element. Two elements prime on the
 * same gesture, and logging both would double the noise for no extra signal
 * — what matters is "the unlock ran at this time", not which slot won first.
 */
let unlockLogged = false;

function recordUnlock(kind: 'Unlock primed' | 'Unlock failed'): void {
  if (unlockLogged) return;
  unlockLogged = true;
  recordChime(kind);
}

export function unlockAudio(): void {
  if (readyUnlocked && endUnlocked) return;
  const a = ensure(READY_MOTIF, 'ready');
  const b = ensure(END_MOTIF, 'end');
  if (!a || !b) return;
  const prime = (el: HTMLAudioElement, onSuccess: () => void): void => {
    if (!el.paused) {
      onSuccess();
      return;
    }
    // `muted` alone was not enough in the field: launching the app played
    // the ready tone and then the end tone — the two elements primed here,
    // in this order — with nothing in the chime log to explain it. Setting
    // volume to 0 as well means the element is silent even where the muted
    // flag is applied late or ignored for a freshly constructed element.
    const silence = (): void => {
      el.muted = true;
      el.volume = 0;
    };
    const restore = (): void => {
      el.muted = false;
      el.volume = 1;
    };

    silence();
    const p = el.play();
    if (!p || typeof p.then !== 'function') {
      // Legacy sync play(): the element is playing now and there is no
      // promise to hang the stop on. Pause it before restoring — the old
      // code restored immediately and left it playing audibly to the end,
      // which is the likeliest source of the audible unlock.
      el.pause();
      el.currentTime = 0;
      restore();
      recordUnlock('Unlock primed');
      onSuccess();
      return;
    }
    p.then(() => {
      el.pause();
      el.currentTime = 0;
      restore();
      recordUnlock('Unlock primed');
      onSuccess();
    }).catch(() => {
      restore();
      recordUnlock('Unlock failed');
    });
  };
  if (!readyUnlocked) prime(a, () => (readyUnlocked = true));
  if (!endUnlocked) prime(b, () => (endUnlocked = true));
}

function play(slot: 'ready' | 'end', motif: Motif, muted: boolean): void {
  if (muted) return;
  const el = ensure(motif, slot);
  if (!el) return;
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

// `useNow` ticks every 1 s. A watcher delta above 2× the interval means
// at least one whole tick was skipped (throttle/freeze/background) —
// foreground jitter on a healthy interval is tens of ms, so 2 s cleanly
// separates jitter from suspension.
const TICK_MS = 1000;
const STALE_TICK_MS = 2_000;
// Chimes arm only after ~4 s of continuous healthy ticking (see header).
const GRACE_MS = 4_000;

const ORAL_PREMED_EVENT = 'Preoperative Oral Dose';

/**
 * Chime flight recorder — a small persisted ring of the last chimes fired,
 * with which transition fired them. Exists because "the app played a stale
 * chime, not sure where from" is undiagnosable after the fact without it;
 * the drawer surfaces the latest entry. Survives reloads and (via
 * useCaseReset's PRESERVED_KEYS) new-case resets.
 */
const CHIME_LOG_KEY = 'sedation-pro:chime-log:v1';
// Raised from 20 when unlock events joined the log: each page load can add
// one, and a run of reloads while debugging must not push the actual chimes
// out of the window that explains them.
const CHIME_LOG_MAX = 40;

export type ChimeKind = 'Versed ready' | 'Fentanyl ready' | 'Pre-med cleared' | 'Release cleared';

/**
 * Priming is not a chime, but it is the only other thing that can make the
 * chime elements emit sound, so it belongs in the same record. Without it an
 * empty log was ambiguous — it could mean "no chime fired" or "something
 * made a noise that this recorder cannot see", and the owner hit exactly
 * that: two tones on launch, nothing logged to explain them.
 */
export type AudioEventKind = ChimeKind | 'Unlock primed' | 'Unlock failed';

export interface ChimeLogEntry {
  readonly kind: AudioEventKind;
  readonly at: number;
}

export function readChimeLog(): ReadonlyArray<ChimeLogEntry> {
  if (typeof window === 'undefined' || !('localStorage' in window)) return [];
  try {
    const raw = window.localStorage.getItem(CHIME_LOG_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChimeLogEntry[]) : [];
  } catch {
    return [];
  }
}

function recordChime(kind: AudioEventKind): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    const next = [...readChimeLog(), { kind, at: Date.now() }].slice(-CHIME_LOG_MAX);
    window.localStorage.setItem(CHIME_LOG_KEY, JSON.stringify(next));
  } catch {
    // Diagnostics only — never let the recorder break the chime itself.
  }
}

// iOS resume can deliver a burst of coalesced ticks whose individual
// deltas look healthy, so time math alone can't spot "we just resumed".
// The visibility flip re-arms the grace window directly. Module-scoped
// so the listener is installed exactly once.
let lastVisibleAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastVisibleAt = Date.now();
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
  // Anchored on IV sedatives only (plus the flumazenil window inside the
  // engine). Until the first Versed/Fentanyl dose the gate reports
  // `no-iv-sedative` and we surface null — the countdown is never armed,
  // so a premed-only case can't fire a premature "case complete" chime.
  const releaseReady = computed<boolean | null>(() => {
    const r = releaseEligibility({
      lastIvSedativeAt: iv.lastIvSedativeAt,
      lastFlumazenilAt: iv.lastFlumazenilAt,
      now: now.value,
    });
    if (r.reason === 'no-iv-sedative') return null;
    return r.eligible;
  });

  function chimeReady(kind: ChimeKind): void {
    recordChime(kind);
    play('ready', READY_MOTIF, audio.muted);
    haptic('light');
  }
  function chimeEnd(kind: ChimeKind): void {
    recordChime(kind);
    play('end', END_MOTIF, audio.muted);
    // Heavier haptic for the case-complete event — weightier moment.
    haptic('medium');
  }

  let prevVersed = versedState.value;
  let prevFentanyl = fentanylState.value;
  let prevPremed = premedReady.value;
  let prevRelease = releaseReady.value;
  // Per-chime source timestamps. A change between ticks means the
  // transition was data-driven (dose log / undo), not time-driven — the
  // affected chime suppresses, the others stay live.
  let prevVersedAt = iv.lastVersedAt;
  let prevFentanylAt = iv.lastFentanylAt;
  let prevIvSedativeAt = iv.lastIvSedativeAt;
  let prevFlumazenilAt = iv.lastFlumazenilAt;
  let prevPremedAt = lastOralPremedAt.value;
  // Arming clock for the grace gate — reset at mount, on any stale tick,
  // and on hidden→visible. See "Silent catch-up" in the header.
  let armedSince = now.value;

  // `flush: 'sync'` so each 1 s tick is evaluated on its own — the default
  // batched flush would coalesce many ticks into a single huge delta and
  // the freshness gate could never tell a normal second from a freeze.
  // Sync also matches reality: a background→resume is one jumped tick.
  watch(
    now,
    (curr, prev) => {
      if (curr - prev > STALE_TICK_MS) armedSince = curr;
      if (lastVisibleAt > armedSince) armedSince = lastVisibleAt;
      const live = curr - armedSince >= GRACE_MS && curr - prev <= STALE_TICK_MS;

      const currVersedAt = iv.lastVersedAt;
      const currFentanylAt = iv.lastFentanylAt;
      const currIvSedativeAt = iv.lastIvSedativeAt;
      const currFlumazenilAt = iv.lastFlumazenilAt;
      const currPremedAt = lastOralPremedAt.value;
      const versedFresh = currVersedAt === prevVersedAt;
      const fentanylFresh = currFentanylAt === prevFentanylAt;
      const premedFresh = currPremedAt === prevPremedAt;
      const releaseFresh =
        currIvSedativeAt === prevIvSedativeAt && currFlumazenilAt === prevFlumazenilAt;

      const v = versedState.value;
      const f = fentanylState.value;
      const pm = premedReady.value;
      const rl = releaseReady.value;
      if (live && versedFresh && v === 'ready' && prevVersed !== 'ready')
        chimeReady('Versed ready');
      if (live && fentanylFresh && f === 'ready' && prevFentanyl !== 'ready')
        chimeReady('Fentanyl ready');
      if (live && premedFresh && pm === true && prevPremed !== true) chimeReady('Pre-med cleared');
      if (live && releaseFresh && rl === true && prevRelease !== true) chimeEnd('Release cleared');

      // Snapshots update on every tick, suppressed or not — a suppressed
      // transition is discarded, never deferred to a later tick.
      prevVersed = v;
      prevFentanyl = f;
      prevPremed = pm;
      prevRelease = rl;
      prevVersedAt = currVersedAt;
      prevFentanylAt = currFentanylAt;
      prevIvSedativeAt = currIvSedativeAt;
      prevFlumazenilAt = currFlumazenilAt;
      prevPremedAt = currPremedAt;
    },
    { flush: 'sync' },
  );
}
