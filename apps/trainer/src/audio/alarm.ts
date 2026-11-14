/**
 * The monitor's sound: alarms and nothing else.
 *
 * There is no pulse tone, on purpose. The practice's monitor runs with
 * minimal alerts and no heart-rate beep, and a trainer that beeped would be
 * rehearsing a room the team does not work in.
 *
 * Tones are rendered to an in-memory WAV and played through an
 * HTMLAudioElement, the path the clinical app settled on after live Web
 * Audio oscillators proved silent on iOS.
 */

const SAMPLE_RATE = 22_050;
/**
 * Silence at the head of each tone, so the muted priming play() that unlocks
 * the element lands in silence even where "muted" is only advisory.
 */
export const LEAD_SILENCE_SEC = 0.4;

export interface Burst {
  /** One frequency per pulse, in Hz. */
  readonly pulses: ReadonlyArray<number>;
  readonly pulseSec: number;
  readonly gapSec: number;
  readonly peak: number;
}

/** A limit breached: three even pulses. */
export const LIMIT_BURST: Burst = {
  pulses: [880, 880, 880],
  pulseSec: 0.16,
  gapSec: 0.1,
  peak: 0.4,
};
/** No breath, or a deep desaturation: faster, higher, five pulses. */
export const URGENT_BURST: Burst = {
  pulses: [988, 988, 988, 1175, 1175],
  pulseSec: 0.13,
  gapSec: 0.07,
  peak: 0.5,
};

/** 16-bit mono PCM for a burst. Plain arithmetic: no audio API involved. */
export function renderBurst(burst: Burst): Int16Array {
  const slot = burst.pulseSec + burst.gapSec;
  const lead = Math.floor(LEAD_SILENCE_SEC * SAMPLE_RATE);
  const pcm = new Int16Array(lead + Math.ceil(burst.pulses.length * slot * SAMPLE_RATE));
  const ramp = 0.012;
  burst.pulses.forEach((freq, i) => {
    const start = lead + Math.floor(i * slot * SAMPLE_RATE);
    const len = Math.floor(burst.pulseSec * SAMPLE_RATE);
    for (let n = 0; n < len; n += 1) {
      const t = n / SAMPLE_RATE;
      const env = Math.min(1, t / ramp, (burst.pulseSec - t) / ramp);
      const idx = start + n;
      if (idx < pcm.length) {
        pcm[idx] = Math.round(Math.sin(2 * Math.PI * freq * t) * env * burst.peak * 0x7fff);
      }
    }
  });
  return pcm;
}

function toWavDataUri(pcm: Int16Array): string {
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
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, SAMPLE_RATE, true);
  dv.setUint32(28, SAMPLE_RATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i += 1) dv.setInt16(44 + i * 2, pcm[i] ?? 0, true);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export type AlarmLevel = 'limit' | 'urgent';

const elements: Partial<Record<AlarmLevel, HTMLAudioElement>> = {};

function element(level: AlarmLevel): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const existing = elements[level];
  if (existing) return existing;
  const el = new Audio(toWavDataUri(renderBurst(level === 'urgent' ? URGENT_BURST : LIMIT_BURST)));
  el.preload = 'auto';
  elements[level] = el;
  return el;
}

/**
 * Call from a tap (the Start button). Browsers only let a page make sound
 * later if each element has first been played inside a user gesture.
 */
export function unlockAlarms(): void {
  for (const level of ['limit', 'urgent'] as const) {
    const el = element(level);
    if (!el) continue;
    el.muted = true;
    void el
      .play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        el.muted = false;
      });
  }
}

export function playAlarm(level: AlarmLevel, volume = 1): void {
  const el = element(level);
  if (!el) return;
  el.muted = false;
  el.volume = Math.max(0, Math.min(1, volume));
  el.currentTime = 0;
  void el.play().catch(() => undefined);
}

export function stopAlarms(): void {
  for (const el of Object.values(elements)) {
    el.pause();
    el.currentTime = 0;
  }
}
