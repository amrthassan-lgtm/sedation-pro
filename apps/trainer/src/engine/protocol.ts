import {
  EMERGENCY_PROTOCOLS,
  findProtocol,
  type EmergencyDrugCallout,
} from '@sedation-pro/clinical';

import { parseDoseRange, type DoseRange } from './dose';
import type { DoseEvent } from './types';

function shortOf(name: string): string {
  return name.split(/ \(| - /)[0] ?? name;
}

/** Short names more than one page would share ("Oversedation"). */
const SHARED_SHORT_NAMES = new Set(
  EMERGENCY_PROTOCOLS.map((p) => shortOf(p.name)).filter((s, i, all) => all.indexOf(s) !== i),
);

/**
 * A page's name as a link says it: the part before any "(…)" or " - …",
 * unless that would not tell it from another page. The same rule the
 * clinical app uses for its own "Go to" links, so a link reads the same in
 * both.
 */
export function pageShortName(protocolId: string): string {
  const name = findProtocol(protocolId)?.name ?? protocolId;
  const short = shortOf(name);
  return SHARED_SHORT_NAMES.has(short) ? name : short;
}

/**
 * Looks a drug callout up by the protocol step it sits on. Throws when the
 * protocol no longer has that step, so a scenario that depends on it fails
 * loudly at load (and in tests) instead of grading against nothing.
 */
export function calloutAt(protocolId: string, stepIncludes: string): EmergencyDrugCallout {
  const protocol = findProtocol(protocolId);
  const step = protocol?.steps.find((s) => s.text.includes(stepIncludes));
  if (!step?.drug) {
    throw new Error(`No drug callout at "${stepIncludes}" in protocol "${protocolId}"`);
  }
  return step.drug;
}

export function doseRangeOf(callout: EmergencyDrugCallout): DoseRange {
  const range = parseDoseRange(callout.dose);
  if (!range) throw new Error(`Cannot read the dose "${callout.dose}" of ${callout.name}`);
  return range;
}

/**
 * A number a protocol step states, read from the step's own words
 * (`/SpO₂ under (\d+)%/`). Throws when the step no longer says it, so a
 * scenario never keeps acting on a figure the protocol has changed.
 */
export function numberInStep(protocolId: string, stepIncludes: string, pattern: RegExp): number {
  const step = findProtocol(protocolId)?.steps.find((s) => s.text.includes(stepIncludes));
  const value = Number(step ? pattern.exec(step.text)?.[1] : undefined);
  if (!Number.isFinite(value)) {
    throw new Error(`Step "${stepIncludes}" in "${protocolId}" no longer states ${pattern}`);
  }
  return value;
}

/** A wait a protocol step states, in minutes (`/(\d+) min, not better/`). */
export function minutesInStep(protocolId: string, stepIncludes: string, pattern: RegExp): number {
  return numberInStep(protocolId, stepIncludes, pattern);
}

/**
 * Words a story line borrows from a protocol step, checked against the step.
 * Throws when the step no longer says them, so a scene never keeps a phrase
 * the protocol has dropped.
 */
export function phraseInStep(protocolId: string, stepIncludes: string, phrase: string): string {
  const step = findProtocol(protocolId)?.steps.find((s) => s.text.includes(stepIncludes));
  if (!step?.text.includes(phrase)) {
    throw new Error(`Step "${stepIncludes}" in "${protocolId}" no longer says "${phrase}"`);
  }
  return phrase;
}

/** Float noise from repeated draws must not turn a correct 0.3 ml into a low dose. */
const TOLERANCE = 0.01;
/**
 * Pushes this close together are one administration: two half-draws given
 * back to back. A grading convenience, not a clinical interval.
 */
const SAME_ADMINISTRATION_SEC = 60;

export interface Administration {
  /** When its first push went in. */
  readonly t: number;
  readonly mcg: number;
}

/** Doses grouped into administrations, oldest first. */
export function administrations(doses: ReadonlyArray<DoseEvent>): ReadonlyArray<Administration> {
  const out: Array<{ t: number; mcg: number; last: number }> = [];
  for (const dose of [...doses].sort((a, b) => a.t - b.t)) {
    const open = out.at(-1);
    if (open && dose.t - open.last <= SAME_ADMINISTRATION_SEC) {
      open.mcg += dose.mcg;
      open.last = dose.t;
    } else {
      out.push({ t: dose.t, mcg: dose.mcg, last: dose.t });
    }
  }
  return out.map(({ t, mcg }) => ({ t, mcg }));
}

export function overProtocolDose(callout: EmergencyDrugCallout, mcg: number): boolean {
  return mcg > doseRangeOf(callout).maxMcg * (1 + TOLERANCE);
}

/**
 * Did the doses given by the protocol's route reach the protocol's dose,
 * without any one administration going over it?
 *
 * The total is what has to reach the minimum, because two half-draws are the
 * same drug in the patient as one full one. The maximum is held per
 * administration, because a repeat the protocol allows five minutes later is
 * not an overdose.
 */
export function gaveProtocolDose(
  callout: EmergencyDrugCallout,
  doses: ReadonlyArray<DoseEvent>,
): boolean {
  const range = doseRangeOf(callout);
  const given = administrations(doses.filter((d) => d.route === callout.route));
  const total = given.reduce((sum, a) => sum + a.mcg, 0);
  return (
    given.length > 0 &&
    total >= range.minMcg * (1 - TOLERANCE) &&
    given.every((a) => !overProtocolDose(callout, a.mcg))
  );
}
