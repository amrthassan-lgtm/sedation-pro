import type { Voice } from '@/engine/types';

/**
 * The people in the room, spoken aloud. Captions carry every line on their
 * own; the voice is extra, and absent wherever the browser has none.
 */

/** Scene text and the player's own lines are read, not heard. */
const SPOKEN = new Set<Voice['who']>(['DA', 'Front desk', 'EMS', 'Patient', 'Pen']);

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export function voiceAvailable(): boolean {
  return synth() !== null;
}

/** Written units and symbols, said the way a person in the room says them. */
export function spokenForm(line: string): string {
  return line
    .replace(/…/g, ', ')
    .replace(/SpO₂/g, 'sats')
    .replace(/N₂O/g, 'nitrous')
    .replace(/O₂/g, 'oxygen')
    .replace(/\b911\b/g, 'nine one one')
    .replace(/(\d+(?:\.\d+)?) ?ml\b/g, '$1 mils')
    .replace(/mg\/ml/g, 'milligrams per mil')
    .replace(/\bIV\b/g, 'I V')
    .replace(/\bIM\b/g, 'I M')
    .replace(/\bEMS\b/g, 'E M S')
    .replace(/\bDoc\b/g, 'Doc');
}

/** One line at a time: a newer line replaces an older one instead of queueing behind it. */
export function say(voice: Voice): void {
  const s = synth();
  if (!s || !SPOKEN.has(voice.who)) return;
  try {
    s.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenForm(voice.line));
    // The pen speaks slower and evenly, as the real one does.
    utterance.rate = voice.who === 'Pen' ? 0.95 : 1.08;
    // A second pitch so the front desk and EMS do not sound like the assistant.
    utterance.pitch =
      voice.who === 'DA' ? 1.1 : voice.who === 'Patient' ? 0.8 : voice.who === 'Pen' ? 1 : 0.9;
    s.speak(utterance);
  } catch {
    // No usable voice: the caption already says it.
  }
}

export function hush(): void {
  try {
    synth()?.cancel();
  } catch {
    // Nothing to stop.
  }
}
