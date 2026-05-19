import { computed, watch } from 'vue';

import { useAudioStore } from '@/stores/audio';
import { useIVStore } from '@/stores/iv';
import { useNow } from '@/composables/useNow';
import { haptic } from '@/composables/useHaptics';

/**
 * Audio alerts — a synthesized "ready to redose" chime that fires when the
 * Versed or Fentanyl half-life timer transitions into the `ready` state
 * (cooling + ramping windows elapsed; the clinician may safely redose).
 *
 * Scope is deliberately narrow: only these two transitions. Phase 1 lock,
 * IV-out countdown, and crisis-vital alerts use the existing visual
 * channels (banner, sticky-bar pill, stat-card severity tint) — adding
 * audio for everything dilutes attention.
 *
 * Why HTMLAudioElement and not the Web Audio API:
 *  - The chime *was* synthesized live with oscillators. That works on
 *    Android and desktop Chrome but never sounded on iOS at all — Safari
 *    tab *and* Home-Screen app alike. iOS gates audio hard on a real user
 *    gesture and the prior `AudioContext.resume()`-based unlock did not
 *    reliably take, so the timer-driven `tick()` produced silence on every
 *    iPhone (the "works on Samsung, dead on iPhone" symptom).
 *  - An `HTMLAudioElement` unlocked with a gesture-initiated muted
 *    play()/pause() is the proven cross-iOS path (Safari tab + standalone)
 *    and works on Android/desktop too, so it is the single portable path.
 *  - Still fully synthesized / no bundled asset: the same rising motif is
 *    rendered to an in-memory PCM WAV data-URI once, lazily, with plain
 *    math (no AudioContext at all — removes every Web Audio quirk).
 *  - iOS still gates playback on a user gesture, so the element is
 *    "unlocked" with a muted play()/pause() inside App.vue's pointerdown
 *    (see `unlockAudio`). After that, the timer-driven `tick()` may play it
 *    programmatically.
 *  - Audio + haptic pair on every alert. The mute flag silences audio
 *    only; haptics are a separate sensory channel.
 *  - First-run guard: initial timer state is captured at setup, so a
 *    hydrated store already in `ready` after reload does not beep on mount.
 *  - Stale-resume guard: `useNow`'s interval is frozen while the app is
 *    backgrounded (screen locked, app switched away — especially an iOS
 *    home-screen app). On return `now` jumps by the whole absence. A
 *    cooling→ready transition that resolved *during* that freeze is stale,
 *    so the chime is suppressed when the `now` jump is far larger than the
 *    tick interval — returning to the app must not replay a minutes-old
 *    ding. The visual timer pill (already correct on return) carries it.
 *
 * Note: this does not defeat the iPhone hardware Ring/Silent switch (iOS
 * routes web audio through the ringer channel; only a native AVAudioSession
 * can override that). With the ringer on, the chime now sounds.
 */

// Rising four-note motif (E5→A5→D6→G6), triangle timbre, ~1.9 s total. The
// ascending shape reads as "cleared / you may proceed", long enough to
// recognise mid-task without being a crisis klaxon. Tune here.
const SAMPLE_RATE = 22050;
const PULSES: ReadonlyArray<number> = [659, 880, 1175, 1568];
const PULSE_SEC = 0.38;
const GAP_SEC = 0.1;
const PEAK = 0.6;
const ATTACK_SEC = 0.02;
const RELEASE_SEC = 0.06;

/** Render the motif to 16-bit mono PCM samples (pure math, no Web Audio). */
function renderPcm(): Int16Array {
  const slot = PULSE_SEC + GAP_SEC;
  const total = Math.ceil(PULSES.length * slot * SAMPLE_RATE);
  const pcm = new Int16Array(total);
  PULSES.forEach((freq, i) => {
    const startSample = Math.floor(i * slot * SAMPLE_RATE);
    const len = Math.floor(PULSE_SEC * SAMPLE_RATE);
    for (let s = 0; s < len; s += 1) {
      const t = s / SAMPLE_RATE;
      // Triangle wave in [-1, 1] from the fractional phase.
      const phase = (freq * t) % 1;
      const tri = 4 * Math.abs(phase - 0.5) - 1;
      let env = 1;
      if (t < ATTACK_SEC) env = t / ATTACK_SEC;
      else if (t > PULSE_SEC - RELEASE_SEC) env = Math.max(0, (PULSE_SEC - t) / RELEASE_SEC);
      const idx = startSample + s;
      if (idx < total) pcm[idx] = Math.round(tri * env * PEAK * 0x7fff);
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
  dv.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits/sample
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

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

function getAudioEl(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (audioEl) return audioEl;
  audioEl = new Audio(pcmToWavDataUri(renderPcm()));
  audioEl.preload = 'auto';
  return audioEl;
}

/**
 * Unlock the audio element on a user gesture (App.vue's pointerdown +
 * visibilitychange). iOS only allows later programmatic `play()` once the
 * element has been played from within a gesture; a muted play()/pause()
 * satisfies that without an audible blip. Runs at most once successfully —
 * re-running on every pointerdown would cut off a chime that is playing
 * when the clinician taps.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const el = getAudioEl();
  if (!el) return;
  el.muted = true;
  const p = el.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      el.pause();
      el.currentTime = 0;
      el.muted = false;
      unlocked = true;
    }).catch(() => {
      // No gesture yet / blocked — leave `unlocked` false so the next
      // gesture retries.
      el.muted = false;
    });
  }
}

/** Play the chime from the start. No-op when muted or unavailable. */
function tick(muted: boolean): void {
  if (muted) return;
  const el = getAudioEl();
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

/**
 * Install the Versed + Fentanyl "ready" chime. Call once from the app shell
 * (`App.vue`) so it lives for the app lifetime.
 *
 * A single `now` watcher owns the logic: it has the real elapsed time
 * (`curr - prev`) to gate staleness, and it tracks the previous timer
 * states itself, so there is no watcher-ordering dependency.
 */
export function useAlarms(): void {
  const iv = useIVStore();
  const audio = useAudioStore();
  const now = useNow(TICK_MS);

  const versedState = computed(() => iv.versedTimerAt(now.value)?.state ?? null);
  const fentanylState = computed(() => iv.fentanylTimerAt(now.value)?.state ?? null);

  function chime(): void {
    tick(audio.muted);
    haptic('light');
  }

  let prevVersed = versedState.value;
  let prevFentanyl = fentanylState.value;

  // `flush: 'sync'` so each 1 s tick is evaluated on its own — the default
  // batched flush would coalesce many ticks into a single huge delta and
  // the freshness gate could never tell a normal second from a freeze.
  // Sync also matches reality: a background→resume is one jumped tick.
  watch(
    now,
    (curr, prev) => {
      const fresh = curr - prev <= FRESH_WINDOW_MS;
      const v = versedState.value;
      const f = fentanylState.value;
      if (fresh && v === 'ready' && prevVersed !== 'ready') chime();
      if (fresh && f === 'ready' && prevFentanyl !== 'ready') chime();
      prevVersed = v;
      prevFentanyl = f;
    },
    { flush: 'sync' },
  );
}
