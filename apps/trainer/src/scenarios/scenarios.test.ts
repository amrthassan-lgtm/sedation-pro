import { describe, expect, it } from 'vitest';
import { EMERGENCY_PROTOCOLS, findProtocol } from '@sedation-pro/clinical';

import { CART_ACTIONS, CART_DEVICES, CART_VIALS } from '@/engine/catalog';
import { Simulation } from '@/engine/engine';
import { gradeRun, resolveRef } from '@/engine/grade';

import { SCENARIOS, findScenario } from './index';
import { untilEnd } from './testing';

const ACTION_IDS = new Set(CART_ACTIONS.map((a) => a.id));
const DEVICE_IDS = new Set(CART_DEVICES.map((d) => d.id));
const VIAL_KEYS = new Set(CART_VIALS.map((v) => v.key));

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
      for (const phase of Object.values(scenario.phases)) {
        for (const t of phase.transitions) {
          collect(typeof t.beat === 'function' ? t.beat(sim.run) : t.beat);
        }
      }
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
    '%s: the title and tagline never name the emergency',
    (_id, scenario) => {
      const spoilers = scenario.protocols.flatMap((id) => {
        const p = findProtocol(id)!;
        return [p.name, ...p.signs]
          .flatMap((w) => w.toLowerCase().split(/[^a-z]+/))
          .filter((w) => w.length > 5);
      });
      const shown = `${scenario.title} ${scenario.tagline}`.toLowerCase();
      for (const word of spoilers) expect(shown, word).not.toContain(word);
    },
  );

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

  it('the library still has every protocol a scenario cites', () => {
    const ids = new Set(EMERGENCY_PROTOCOLS.map((p) => p.id));
    for (const s of SCENARIOS) for (const id of s.protocols) expect(ids).toContain(id);
  });
});
