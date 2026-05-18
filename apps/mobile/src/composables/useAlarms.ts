import { computed, watch } from 'vue';

import { useAudioStore } from '@/stores/audio';
import { useIVStore } from '@/stores/iv';
import { useNow } from '@/composables/useNow';
import { haptic } from '@/composables/useHaptics';

/**
 * Audio alerts — synthesized "tick" chimes that fire when the Versed or
 * Fentanyl half-life timer transitions into the `ready` state (i.e. the
 * cooling + ramping windows have elapsed and the clinician can safely
 * redose if the case calls for it).
 *
 * Scope is deliberately narrow: only these two transitions. Phase 1 lock,
 * IV-out countdown, and crisis-vital alerts use the existing visual
 * channels (banner, sticky-bar pill, stat-card severity tint) — adding
 * audio for everything dilutes attention.
 *
 * Design:
 *  - Web Audio API, synthesized. No bundled audio files, no Capacitor
 *    plugin. Works in WKWebView (iOS) and Android WebView.
 *  - iOS AudioContext starts `suspended` until a user gesture; the app
 *    shell installs a one-time pointerdown listener that calls
 *    `unlockAudio()` (exported below).
 *  - Audio + haptic pair on every alert — both fire together. Mute flag
 *    silences audio only; haptics are a separate sensory channel.
 *  - First-run guard: `watch` without `immediate: true` only fires on
 *    value changes, so a hydrated store starting in the `ready` state
 *    after page reload does not beep on mount.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/**
 * Resume the AudioContext on first user gesture. Safe to call repeatedly —
 * a no-op once the context is already running. Wired from App.vue's
 * one-time pointerdown listener.
 */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

/**
 * Play the "ready to redose" alert: a rising four-note motif
 * (E5→A5→D6→G6 triangle, ~1.9 s total) at a volume that carries across
 * an operatory. The *ascending* shape reads as "cleared / you may
 * proceed" rather than an alarm, and it's long enough to recognise
 * mid-task without being a crisis klaxon. No-op if the AudioContext
 * isn't available, is still suspended (no user gesture yet), or audio is
 * muted.
 *
 * Still fully synthesized — no bundled audio file, identical behaviour in
 * iOS WKWebView and Android WebView. To audition a different character,
 * change PULSES / PULSE_SEC / GAP_SEC / PEAK_GAIN below.
 */
const PULSES: ReadonlyArray<number> = [659, 880, 1175, 1568];
const PULSE_SEC = 0.38;
const GAP_SEC = 0.1;
const PEAK_GAIN = 0.6;

function tick(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const t0 = ctx.currentTime;
  PULSES.forEach((freq, i) => {
    const start = t0 + i * (PULSE_SEC + GAP_SEC);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.02);
    gain.gain.setValueAtTime(PEAK_GAIN, start + PULSE_SEC - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + PULSE_SEC);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + PULSE_SEC + 0.02);
  });
}

/**
 * Install watchers on Versed + Fentanyl timer state. Call once from the
 * app shell (`App.vue`) so the watchers live for the app lifetime.
 */
export function useAlarms(): void {
  const iv = useIVStore();
  const audio = useAudioStore();
  const now = useNow(1000);

  const versedState = computed(() => iv.versedTimerAt(now.value)?.state ?? null);
  const fentanylState = computed(() => iv.fentanylTimerAt(now.value)?.state ?? null);

  function chime(): void {
    tick(audio.muted);
    haptic('light');
  }

  watch(versedState, (curr, prev) => {
    if (curr === 'ready' && prev !== 'ready') chime();
  });

  watch(fentanylState, (curr, prev) => {
    if (curr === 'ready' && prev !== 'ready') chime();
  });
}
