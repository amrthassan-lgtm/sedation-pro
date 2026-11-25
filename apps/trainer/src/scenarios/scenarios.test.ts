import { describe, expect, it } from 'vitest';
import { EMERGENCY_PROTOCOLS, findProtocol } from '@sedation-pro/clinical';

import { CART_ACTIONS, CART_DEVICES, CART_VIALS } from '@/engine/catalog';
import { Simulation } from '@/engine/engine';
import { gradeRun, resolveRef } from '@/engine/grade';

import { SCENARIOS, findScenario } from './index';
import { drawAndGive, untilEnd } from './testing';

const ACTION_IDS = new Set(CART_ACTIONS.map((a) => a.id));
const DEVICE_IDS = new Set(CART_DEVICES.map((d) => d.id));
const VIAL_KEYS = new Set(CART_VIALS.map((v) => v.key));

/**
 * Protocol steps a scenario deliberately leaves ungraded, each with its
 * reason. The debrief prints these as "Not part of this run". A step added
 * to a protocol a scenario grades has to be graded or listed here: without
 * this, a new step would quietly read as outside the run.
 */
const LEFT_OUT: Readonly<Record<string, ReadonlyArray<readonly [string, string, string]>>> = {
  crown: [
    ['choking', 'Becomes unresponsive', 'the run stops at the arrest'],
    ['choking', 'Cannot ventilate and cannot remove it', 'the run stops at the arrest'],
    ['choking', 'Object lost and not found', 'the crown is recovered in this run'],
    ['emesis_aspiration', 'Signs of aspiration', 'he breathes easily once his airway is clear'],
    ['emesis_aspiration', 'Laryngospasm or bronchospasm after vomiting', 'neither follows here'],
  ],
  quiet: [
    ['hypoventilation', 'No pulse: start CPR', 'the run stops at the arrest'],
    ['oversedation_opioid', 'No pulse: start CPR', 'the run stops at the arrest'],
    ['oversedation_opioid', 'Naloxone can wear off before fentanyl', 'after the run ends'],
    ['laryngospasm', 'Cannot ventilate: LMA or King', 'succinylcholine breaks the spasm'],
  ],
  stridor: [
    [
      'laryngospasm',
      'Cannot ventilate: LMA or King',
      'the mask or succinylcholine breaks the spasm',
    ],
  ],
  tight: [['bronchospasm', 'Cannot ventilate', 'he keeps breathing on his own in this run']],
  wheeze: [
    ['anaphylaxis', 'Throat or tongue swelling', 'his airway stays open in this run'],
    ['anaphylaxis', 'No pulse: CPR + AED', 'the run stops at the arrest'],
    ['anaphylaxis', 'Monitor vitals continuously', 'not an act the cart offers'],
  ],
};

function wordsOf(texts: ReadonlyArray<string>, longerThan: number): string[] {
  return texts
    .flatMap((text) => text.toLowerCase().split(/[^a-z]+/))
    .filter((word) => word.length > longerThan);
}

/** "wheezing" and "wheeze", "hives" and "hive": one word for this purpose. */
function stem(word: string): string {
  return word.replace(/(ing|es|ed|s|e)$/, '');
}

/**
 * A drill is titled with a sign the team would see, so it can be found by it,
 * but not the first one on the page (owner, Nov 2026): the name hints at the
 * emergency without handing it over. The emergency's own name is barred too.
 */
function titleGivesAway(title: string, protocolIds: ReadonlyArray<string>): boolean {
  const protocols = protocolIds.map((id) => findProtocol(id)!);
  const barred = wordsOf(
    protocols.flatMap((p) => [p.name, p.signs[0] ?? '']),
    3,
  ).map(stem);
  return wordsOf([title], 3).some((word) => barred.includes(stem(word)));
}

describe('every scenario', () => {
  it('has a unique id and can be found by it', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(findScenario(id)?.id).toBe(id);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: every rubric item points at protocol text that exists, in a protocol it cites',
    (_id, scenario) => {
      for (const item of scenario.rubric) {
        const resolved = resolveRef(item.ref);
        expect(resolved, `${item.id} → ${JSON.stringify(item.ref)}`).not.toBeNull();
        expect(scenario.protocols, item.id).toContain(item.ref.protocol);
      }
      for (const id of scenario.protocols) expect(findProtocol(id), id).toBeDefined();
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: a step reference matches exactly one step, so the debrief cannot print the wrong one',
    (_id, scenario) => {
      for (const item of scenario.rubric) {
        if (!('step' in item.ref)) continue;
        const { protocol, step } = item.ref;
        const matches = findProtocol(protocol)!.steps.filter((s) => s.text.includes(step));
        expect(matches.length, `${item.id}: "${step}"`).toBe(1);
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: a step graded act by act quotes its own words for each act',
    (_id, scenario) => {
      for (const item of scenario.rubric) {
        if (!item.parts) continue;
        const text = resolveRef(item.ref)!.text;
        expect(item.parts.length, item.id).toBeGreaterThan(1);
        for (const part of item.parts)
          expect(text, `${item.id}: "${part.quote}"`).toContain(part.quote);
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: no two rubric items grade the same protocol line',
    (_id, scenario) => {
      const texts = scenario.rubric.map((r) => resolveRef(r.ref)!.text);
      expect(new Set(texts).size).toBe(texts.length);
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: every step of a protocol it grades is graded or deliberately left out',
    (id, scenario) => {
      const graded = new Set(
        scenario.rubric.map((item) => {
          const r = resolveRef(item.ref)!;
          return `${r.protocolId}:${r.stepIndex}`;
        }),
      );
      const leftOut = LEFT_OUT[id] ?? [];
      for (const [protocol, text] of leftOut) {
        const matches = findProtocol(protocol)!.steps.filter((s) => s.text.includes(text));
        expect(matches.length, `${id}: left-out "${text}"`).toBe(1);
      }
      for (const pid of scenario.protocols) {
        findProtocol(pid)!.steps.forEach((step, i) => {
          const listed = leftOut.some(([p, text]) => p === pid && step.text.includes(text));
          expect(
            graded.has(`${pid}:${i}`) !== listed,
            `${id}: "${step.text}" (${pid}) must be either graded or listed as left out`,
          ).toBe(true);
        });
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: reactions are keyed by things the cart really has',
    (_id, scenario) => {
      const prompts = new Set<string>();
      const collect = (beat: unknown) => {
        if (beat && typeof beat === 'object' && 'prompt' in beat) {
          const p = (beat as { prompt?: { id: string } }).prompt;
          if (p) prompts.add(p.id);
        }
      };
      const sim = new Simulation(scenario);
      const all = [
        ...(scenario.always ?? []),
        ...Object.values(scenario.phases).flatMap((p) => p.transitions),
      ];
      for (const t of all) collect(typeof t.beat === 'function' ? t.beat(sim.run) : t.beat);
      for (const key of Object.keys(scenario.reactions ?? {})) {
        const [kind, rest] = key.includes(':') ? key.split(':') : ['plain', key];
        if (kind === 'give' || kind === 'draw') expect(VIAL_KEYS, key).toContain(rest);
        else if (kind === 'answer') expect(prompts, key).toContain(rest);
        else expect(ACTION_IDS.has(key) || DEVICE_IDS.has(key), key).toBe(true);
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: every transition leads to a phase or an ending that exists',
    (_id, scenario) => {
      const all = [
        ...(scenario.always ?? []),
        ...Object.values(scenario.phases).flatMap((p) => p.transitions),
      ];
      for (const t of all) {
        if (t.to === 'stay') continue;
        if (t.to.startsWith('end:')) expect(scenario.endings[t.to.slice(4)], t.to).toBeDefined();
        else expect(scenario.phases[t.to], t.to).toBeDefined();
      }
      expect(scenario.phases[scenario.initial.phase]).toBeDefined();
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: the title is neither the name of the emergency nor its classic sign, and the tagline gives no sign away',
    (_id, scenario) => {
      expect(titleGivesAway(scenario.title, scenario.protocols)).toBe(false);
      const protocols = scenario.protocols.map((id) => findProtocol(id)!);
      const spoilers = wordsOf(
        [...protocols.map((p) => p.name), ...protocols.flatMap((p) => p.signs)],
        5,
      );
      const tagline = scenario.tagline.toLowerCase();
      for (const word of spoilers) expect(tagline, word).not.toContain(word);
    },
  );

  it('the title rule would catch a classic sign or a diagnosis, and lets a later sign through', () => {
    expect(titleGivesAway('Crowing', ['laryngospasm'])).toBe(true);
    expect(titleGivesAway('Stridor', ['laryngospasm'])).toBe(false);
    expect(titleGivesAway('Wheeze', ['bronchospasm'])).toBe(true);
    expect(titleGivesAway('Cough', ['bronchospasm'])).toBe(false);
    expect(titleGivesAway('Hives', ['anaphylaxis'])).toBe(true);
    expect(titleGivesAway('Wheeze', ['anaphylaxis'])).toBe(false);
    expect(titleGivesAway('Slow', ['hypoventilation'])).toBe(true);
    expect(titleGivesAway('Shallow', ['hypoventilation'])).toBe(false);
    expect(titleGivesAway('Asthma', ['bronchospasm'])).toBe(true);
    expect(titleGivesAway('Laryngospasm', ['hypoventilation', 'laryngospasm'])).toBe(true);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: hands off, the patient is lost; the run always ends',
    (_id, scenario) => {
      const sim = new Simulation(scenario);
      expect(untilEnd(sim, 1800)).toBe(true);
      expect(sim.ending?.outcome).toBe('arrest');
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: in take-your-time mode the patient cannot be lost, however long the team thinks',
    (_id, scenario) => {
      const sim = new Simulation(scenario, { forgiving: true });
      for (let i = 0; i < 4 * 1800 && !sim.ending; i += 1) sim.tick(0.25);
      expect(sim.ending).toBeNull();
      expect(sim.monitor.spo2).toBeGreaterThanOrEqual(70);
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: no order of taps, doses and answers breaks the run or the debrief',
    (_id, scenario) => {
      const actions = CART_ACTIONS.map((a) => a.id);
      const devices = CART_DEVICES.map((d) => d.id);
      const vials = CART_VIALS.map((v) => v.key);
      for (let seed = 1; seed <= 60; seed += 1) {
        // A small fixed generator: the same sixty plays every time the suite runs.
        let state = seed * 2_654_435_761;
        const next = (n: number): number => {
          state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
          return state % n;
        };
        const pick = <T>(list: ReadonlyArray<T>): T => list[next(list.length)]!;
        const sim = new Simulation(scenario, { forgiving: seed % 5 === 0 });
        for (let step = 0; step < 150 && !sim.ending; step += 1) {
          const roll = next(10);
          if (sim.prompt && roll < 4) sim.answer(pick(sim.prompt.options).id);
          else if (roll < 6) sim.act(pick(actions));
          else if (roll === 6) sim.useDevice(pick(devices), 1 + next(8));
          else if (roll === 7) {
            const id = sim.pickUpSyringe(pick([1, 3, 10] as const));
            sim.drawFromVial(id, pick(vials), (1 + next(30)) / 10);
            if (next(2) === 0) sim.labelSyringe(id);
            sim.give(id, (1 + next(30)) / 10, next(2) === 0 ? 'IV' : 'IM');
          }
          sim.tick(1 + next(8));
          expect(Number.isFinite(sim.monitor.spo2) && Number.isFinite(sim.monitor.hr)).toBe(true);
        }
        if (sim.ending) {
          const debrief = gradeRun(scenario, sim);
          expect(debrief.of, `seed ${seed}`).toBeGreaterThanOrEqual(debrief.done);
          if (sim.forgiving) expect(sim.ending.outcome, `seed ${seed}`).not.toBe('arrest');
        }
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: an ambulance that was called ends the run eight minutes after the call, even when nothing else can',
    (_id, scenario) => {
      // Take-your-time mode: he cannot be lost, so only the ambulance can end a run left alone.
      const sim = new Simulation(scenario, { forgiving: true });
      sim.tick(1);
      sim.act('call_911');
      expect(untilEnd(sim, 600)).toBe(true);
      expect(sim.t).toBeCloseTo(481, 0);
      expect(sim.ending).toMatchObject({ outcome: 'handover', title: 'Handed over to EMS' });
      expect(sim.ending?.text).toMatch(/^He leaves with EMS\. /);
      expect(sim.scene).toMatch(/^EMS is at the door with a stretcher\. /);
      expect(sim.log.at(-1)?.text).toBe('EMS on scene');
      // Handed over untreated is never a clean run.
      expect(gradeRun(scenario, sim).clean).toBe(false);
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: whatever the team does, nobody is still waiting for the ambulance once its eight minutes are up',
    (_id, scenario) => {
      // EMS is already in the room, or a run-ending consequence is seconds from closing.
      const afterTheDoor = new Set(['handover', 'overdose', 'paralysed']);
      const actions = CART_ACTIONS.map((a) => a.id);
      const devices = CART_DEVICES.map((d) => d.id);
      const vials = CART_VIALS.map((v) => v.key);
      for (let seed = 1; seed <= 80; seed += 1) {
        let state = seed * 2_654_435_761;
        const next = (n: number): number => {
          state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
          return state % n;
        };
        const pick = <T>(list: ReadonlyArray<T>): T => list[next(list.length)]!;
        const sim = new Simulation(scenario, { forgiving: seed % 2 === 0 });
        sim.tick(1 + next(60));
        if (!sim.ending) sim.act('call_911');
        for (let step = 0; step < 220 && !sim.ending; step += 1) {
          const roll = next(10);
          if (sim.prompt && roll < 4) sim.answer(pick(sim.prompt.options).id);
          else if (roll < 5) sim.act(pick(actions));
          else if (roll === 5) sim.useDevice(pick(devices), 1 + next(8));
          else if (roll === 6) {
            const id = sim.pickUpSyringe(pick([1, 3, 10] as const));
            sim.drawFromVial(id, pick(vials), (1 + next(30)) / 10);
            sim.give(id, (1 + next(30)) / 10, next(2) === 0 ? 'IV' : 'IM');
          }
          sim.tick(1 + next(6));
          const called = sim.run.at('call_911');
          if (!sim.ending && called !== null && sim.t > called + 8 * 60 + 1) {
            expect(afterTheDoor, `seed ${seed}: in "${sim.phase}" at ${sim.t}`).toContain(
              sim.phase,
            );
          }
        }
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: more sedative after the scene opens slows his breathing and costs him saturation',
    (_id, scenario) => {
      const plain = new Simulation(scenario);
      const sim = new Simulation(scenario);
      drawAndGive(sim, 'fentanyl', 2);
      drawAndGive(sim, 'midazolam', 1);
      for (let i = 0; i < 80; i += 1) {
        plain.tick(0.25);
        sim.tick(0.25);
      }
      expect(sim.phase).toBe(plain.phase);
      expect(sim.monitor.rr).toBeLessThan(plain.monitor.rr);
      expect(sim.run.vitals.spo2).toBeLessThan(plain.run.vitals.spo2);
    },
  );

  it('the library still has every protocol a scenario cites', () => {
    const ids = new Set(EMERGENCY_PROTOCOLS.map((p) => p.id));
    for (const s of SCENARIOS) for (const id of s.protocols) expect(ids).toContain(id);
  });
});
