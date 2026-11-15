import { findProtocol, type EmergencyDrugCallout } from '@sedation-pro/clinical';

import { parseDoseRange, type DoseRange } from './dose';
import type { DoseEvent } from './types';

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
