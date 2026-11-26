import { findProtocol } from '@sedation-pro/clinical';

import { findVial } from './catalog';
import type { Ctx, DoseEvent, Ending, Fact, ProtocolRef, RubricItem, Scenario } from './types';
import type { Simulation } from './engine';

/**
 * Turns a finished run into the debrief.
 *
 * Every line the debrief prints about what should have happened is the
 * protocol's own text, looked up through the rubric's reference. The trainer
 * holds no clinical wording of its own, so it cannot teach a step the
 * clinical app does not show.
 */

export interface ResolvedRef {
  readonly protocolId: string;
  readonly protocolName: string;
  /** The protocol's words, verbatim. */
  readonly text: string;
  /** Position of the step in its protocol, so the debrief can keep protocol order. */
  readonly stepIndex: number;
  /** `note` rows grade a line of a drug callout's notes, shown under their step. */
  readonly kind: 'step' | 'note';
}

/** `null` when the protocol no longer says what the rubric points at. */
export function resolveRef(ref: ProtocolRef): ResolvedRef | null {
  const protocol = findProtocol(ref.protocol);
  if (!protocol) return null;
  const base = { protocolId: protocol.id, protocolName: protocol.name };
  if ('step' in ref) {
    const stepIndex = protocol.steps.findIndex((s) => s.text.includes(ref.step));
    const step = protocol.steps[stepIndex];
    return step ? { ...base, text: step.text, stepIndex, kind: 'step' } : null;
  }
  const stepIndex = protocol.steps.findIndex(
    (s) => s.drug?.name === ref.drug && (s.drug.notes ?? '').includes(ref.note),
  );
  return stepIndex >= 0
    ? { ...base, text: `${ref.drug}: ${ref.note}`, stepIndex, kind: 'note' }
    : null;
}

/** `wrong`: an add-on drug that was given, but not as the page writes it. */
export type RowResult = 'done' | 'partial' | 'missed' | 'wrong' | 'na';

export interface DebriefPart {
  readonly quote: string;
  readonly result: 'done' | 'missed' | 'na';
}

export interface DebriefRow {
  readonly id: string;
  readonly tier: RubricItem['tier'];
  readonly result: RowResult;
  /** Scenario seconds when it was done, when the rubric can tell. */
  readonly at: number | null;
  readonly protocolId: string;
  readonly protocolName: string;
  readonly text: string;
  readonly stepIndex: number;
  readonly kind: 'step' | 'note';
  /** Present when the step is graded act by act. */
  readonly parts: ReadonlyArray<DebriefPart>;
}

export interface Debrief {
  readonly scenarioId: string;
  readonly ending: Ending;
  readonly endingKey: string;
  readonly rows: ReadonlyArray<DebriefRow>;
  /** Core steps done, out of core steps that applied in this run. */
  readonly done: number;
  readonly of: number;
  readonly lowestSpo2: number;
  readonly seconds: number;
  readonly doses: ReadonlyArray<DoseEvent>;
  /** Doses of drugs these protocols never mention. Listed as a fact, without a verdict. */
  readonly outside: ReadonlyArray<DoseEvent>;
  /**
   * Every core step done, nobody harmed, nothing given that the protocols do
   * not mention, and no add-on given other than as its page writes it.
   */
  readonly clean: boolean;
  /** Up to three core steps missed or only partly done, in rubric order: what to drill next. */
  readonly takeaways: ReadonlyArray<DebriefRow>;
  /** The scenario's own facts about the run, stated and not graded. Empty for most runs. */
  readonly facts: ReadonlyArray<Fact>;
}

/**
 * Doses of drugs the run's protocols never mention, in a step or in a
 * callout's notes ("have atropine ready"). Nothing here judges them: the
 * debrief only states that these protocols do not call for them.
 */
export function outsideProtocols(
  scenario: Scenario,
  doses: ReadonlyArray<DoseEvent>,
): ReadonlyArray<DoseEvent> {
  const steps = scenario.protocols.flatMap((id) => findProtocol(id)?.steps ?? []);
  const callouts = new Set(steps.flatMap((s) => (s.drug ? [s.drug.name] : [])));
  const text = steps.map((s) => `${s.text}\n${s.drug?.notes ?? ''}`.toLowerCase()).join('\n');
  const mentioned = (dose: DoseEvent): boolean => {
    if (dose.drugKey === 'saline') return true;
    if (text.includes(dose.drugName.toLowerCase())) return true;
    return findVial(dose.drugKey)?.callouts.some((name) => callouts.has(name)) ?? false;
  };
  return doses.filter((d) => !mentioned(d));
}

function verdictOf(value: boolean | null): 'done' | 'missed' | 'na' {
  return value === null ? 'na' : value ? 'done' : 'missed';
}

/** Was any dose of the drug this step calls for given at all, by any route and in any amount? */
function stepDrugGiven(resolved: ResolvedRef, doses: ReadonlyArray<DoseEvent>): boolean {
  if (resolved.kind !== 'step') return false;
  const callout = findProtocol(resolved.protocolId)?.steps[resolved.stepIndex]?.drug?.name;
  if (!callout) return false;
  return doses.some(
    (d) =>
      (findVial(d.drugKey)?.callouts.includes(callout) ?? false) ||
      callout.toLowerCase().includes(d.drugName.toLowerCase()),
  );
}

function gradeItem(item: RubricItem, run: Ctx, doses: ReadonlyArray<DoseEvent>): DebriefRow {
  const resolved = resolveRef(item.ref);
  if (!resolved) {
    throw new Error(`Rubric item "${item.id}" points at protocol text that no longer exists`);
  }
  let result: RowResult;
  let parts: DebriefPart[] = [];
  if (item.parts) {
    parts = item.parts.map((p) => ({ quote: p.quote, result: verdictOf(p.check(run)) }));
    const applied = parts.filter((p) => p.result !== 'na');
    const done = applied.filter((p) => p.result === 'done').length;
    result =
      applied.length === 0
        ? 'na'
        : done === applied.length
          ? 'done'
          : done === 0
            ? 'missed'
            : 'partial';
  } else {
    result = verdictOf(item.check(run));
    // An add-on left out and an add-on overdosed must not read the same: the
    // first is nothing, the second is a drug in the patient the page did not write.
    if (item.tier === 'extra' && result === 'missed' && stepDrugGiven(resolved, doses)) {
      result = 'wrong';
    }
  }
  return {
    id: item.id,
    tier: item.tier,
    result,
    at: result === 'done' || result === 'partial' ? (item.when?.(run) ?? null) : null,
    parts,
    ...resolved,
  };
}

export function gradeRun(scenario: Scenario, sim: Simulation): Debrief {
  const ending = sim.ending;
  const endingKey = sim.endingKey;
  if (!ending || endingKey === null) throw new Error('The run has not ended');
  const rows = scenario.rubric.map((item) => gradeItem(item, sim.run, sim.doses));
  const core = rows.filter((r) => r.tier === 'core' && r.result !== 'na');
  const done = core.filter((r) => r.result === 'done').length;
  const outside = outsideProtocols(scenario, sim.doses);
  return {
    scenarioId: scenario.id,
    ending,
    endingKey,
    rows,
    done,
    of: core.length,
    lowestSpo2: Math.round(sim.lowestSpo2),
    seconds: Math.round(sim.t),
    doses: sim.doses,
    outside,
    clean:
      core.length > 0 &&
      done === core.length &&
      outside.length === 0 &&
      rows.every((r) => r.result !== 'wrong') &&
      ending.outcome !== 'arrest' &&
      ending.outcome !== 'harm',
    takeaways: core.filter((r) => r.result === 'missed' || r.result === 'partial').slice(0, 3),
    facts: scenario.facts?.(sim.run) ?? [],
  };
}
