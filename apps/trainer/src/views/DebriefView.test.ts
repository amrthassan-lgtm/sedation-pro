import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import type { Sample } from '@/engine/types';
import { gradeRun, type Debrief } from '@/engine/grade';
import { pageShortName } from '@/engine/protocol';
import { SCENARIOS } from '@/scenarios';
import { quiet } from '@/scenarios/quiet';
import { shockable } from '@/scenarios/shockable';
import { until, untilEnd } from '@/scenarios/testing';
import { setLastRun, type RunRecord } from '@/session';

import DebriefView from './DebriefView.vue';

/** "Shallow" with nothing done: an arrest, and more than three steps missed. */
function untreated(): { sim: Simulation; debrief: Debrief } {
  const sim = new Simulation(quiet);
  untilEnd(sim);
  return { sim, debrief: gradeRun(quiet, sim) };
}

function show(
  change: Partial<Debrief> = {},
  previous: RunRecord | null = null,
  history?: ReadonlyArray<Sample>,
) {
  const { sim, debrief } = untreated();
  setLastRun({
    debrief: { ...debrief, ...change },
    history: history ?? sim.history,
    cuts: sim.cuts,
    log: sim.log,
    previous,
    practice: false,
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  return mount(DebriefView, { global: { plugins: [router] } });
}

describe('the debrief heading counts what it lists', () => {
  it.each([
    [1, 'One thing for the team'],
    [2, 'Two things for the team'],
    [3, 'Three things for the team'],
  ])('%i to drill reads "%s"', (count, heading) => {
    const { debrief } = untreated();
    expect(debrief.takeaways.length).toBe(3);
    const page = show({ takeaways: debrief.takeaways.slice(0, count) });
    expect(page.text()).toContain(heading);
    expect(page.findAll('.take')).toHaveLength(count);
  });

  it('a clean run has no such section', () => {
    expect(show({ takeaways: [] }).text()).not.toContain('for the team');
  });
});

describe('the run before is stated, not subtracted', () => {
  const before: RunRecord = {
    at: 0,
    done: 3,
    of: 4,
    lowestSpo2: 88,
    seconds: 200,
    outcome: 'recovered',
  };

  it('prints the last run as it was, because runs reach different numbers of steps', () => {
    const text = show({}, before).text();
    expect(text).toContain('Last run 3 of 4');
    expect(text).toContain('Last run 88%');
    expect(text).not.toContain('on last run');
  });

  it('says nothing on a first run', () => {
    expect(show().text()).not.toContain('Last run');
  });
});

describe('the debrief links into the clinical app', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/views/DebriefView.vue'), 'utf8');
  const clinicalRouter = readFileSync(
    resolve(process.cwd(), '../mobile/src/router/index.ts'),
    'utf8',
  );

  it('uses the route the clinical app serves a protocol page on', () => {
    expect(clinicalRouter).toContain("path: '/quick-reference/:id'");
    expect(view.match(/`\.\.\/quick-reference\/\$\{/g)).toHaveLength(2);
  });

  it('a step that points to another page links to it, named as the clinical app names it', () => {
    const links = show()
      .findAll('a.go')
      .map((a) => ({ href: a.attributes('href'), text: a.text() }));
    expect(links).toContainEqual({
      href: '../quick-reference/bvm',
      text: 'Go to BVM ›',
    });
    expect(links.map((l) => l.text)).toContain('Go to Oversedation (Opioid) ›');
    expect(pageShortName('lma')).toBe('LMA');
    expect(pageShortName('no_such_page')).toBe('no_such_page');
    const linked = quiet.protocols.flatMap((id) =>
      findProtocol(id)!.steps.flatMap((s) => s.goTo ?? []),
    );
    expect(links.map((l) => l.href)).toEqual(linked.map((to) => `../quick-reference/${to}`));
  });

  it('every page a graded protocol points to exists, so no link opens nothing', () => {
    for (const scenario of SCENARIOS) {
      for (const id of scenario.protocols) {
        for (const step of findProtocol(id)!.steps) {
          for (const to of step.goTo ?? []) expect(findProtocol(to), `${id} → ${to}`).toBeDefined();
        }
      }
    }
  });
});

describe('an add-on given, but not as the page writes it', () => {
  it('says so in the row, in red, and is not greyed like one left out', () => {
    const { debrief } = untreated();
    const rows = debrief.rows.map((r, i) =>
      i === 0 ? { ...r, tier: 'extra' as const, result: 'wrong' as const } : r,
    );
    const row = show({ rows }).find('.row.step.is-wrong');
    expect(row.exists()).toBe(true);
    expect(row.find('.step-state').text()).toContain('Given, not as written');
    expect(row.find('.step-state').text()).toContain('add-on');
  });
});

describe('the pressure in a debrief', () => {
  const at = (t: number, sbp: number): Sample => ({ t, spo2: 96, hr: 90, sbp });

  it('is drawn, with its lowest value, in a run where it fell', () => {
    const page = show({}, null, [at(0, 124), at(60, 96), at(120, 62)]);
    expect(page.text()).toContain('Lowest systolic');
    expect(page.find('svg.pressure').exists()).toBe(true);
    expect(page.find('svg.pressure .low').text()).toBe('62');
    expect(page.text()).toContain('whether or not the cuff was cycled');
  });

  it('is left out of a run where it never came into it', () => {
    const page = show({}, null, [at(0, 120), at(60, 118), at(120, 112)]);
    expect(page.text()).not.toContain('Lowest systolic');
    expect(page.find('svg.pressure').exists()).toBe(false);
  });
});

describe('the facts of a run that had CPR (owner, Nov 2026)', () => {
  /** "Shockable" with CPR, the bag and the AED, every shock given and nothing else, to the ambulance. */
  function coded(): Simulation {
    const sim = new Simulation(shockable);
    until(sim, 'arrest');
    for (let i = 0; i < 4 * 8; i += 1) sim.tick(0.25);
    for (const id of ['call_911', 'cpr', 'jaw_thrust', 'bvm', 'aed']) sim.act(id);
    for (let i = 0; i < 4 * 900 && !sim.ending; i += 1) {
      if (sim.prompt?.id === 'shock') {
        sim.answer('shock');
        sim.act('cpr');
      }
      sim.tick(0.25);
    }
    return sim;
  }

  function showRun(sim: Simulation, change: (debrief: Debrief) => Debrief = (d) => d) {
    setLastRun({
      debrief: change(gradeRun(sim.scenario, sim)),
      history: sim.history,
      cuts: sim.cuts,
      log: sim.log,
      previous: null,
      practice: false,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    return mount(DebriefView, { global: { plugins: [router] } });
  }

  it('are stated in a row of their own, under the numbers and above the chart', () => {
    const page = showRun(coded());
    const facts = page
      .findAll('.facts .fact')
      .map((f) => [f.find('dt').text(), f.find('dd').text()]);
    expect(facts.map(([label]) => label)).toEqual([
      'CPR started',
      'First shock',
      'Nobody on his chest, in all',
      'Pauses with both breaths',
    ]);
    expect(facts[0]?.[1]).toBe('0:14');
    expect(facts[1]?.[1]).toBe('0:23');
    for (const [, value] of facts) expect(value).toMatch(/^(\d+:\d\d|\d+ of \d+)$/);
    const html = page.html();
    expect(html.indexOf('class="stats"')).toBeLessThan(html.indexOf('class="facts"'));
    expect(html.indexOf('class="facts"')).toBeLessThan(html.indexOf('class="recorder"'));
  });

  it('are facts and nothing else: no verdict, no advice', () => {
    const text = showRun(coded()).find('.facts').text();
    expect(text).not.toMatch(/should|too |late|slow|fast|good|poor|well|only|try/i);
  });

  it('the chart beside them draws no saturation for the time he had no pulse', () => {
    const page = showRun(coded());
    expect(page.find('.recorder .unread').exists()).toBe(true);
    expect(page.find('.recorder .legend').text()).toContain('No pulse: no reading');
    // The lowest saturation printed is the lowest that was read: before he lost his pulse.
    // And the number says so, so that it is not read as how he was through the arrest.
    const tile = page.find('.stat');
    expect(tile.find('.stat-val').text()).toBe('97%');
    expect(tile.find('.stat-sub').text()).toBe('No pulse: no reading');
    expect(show().find('.stat').text()).not.toContain('No pulse');
  });

  it('with a run before it, the tile says both: what the last run read, and that some of this one went unread', () => {
    const sim = coded();
    setLastRun({
      debrief: gradeRun(sim.scenario, sim),
      history: sim.history,
      cuts: sim.cuts,
      log: sim.log,
      previous: { at: 0, done: 3, of: 7, lowestSpo2: 91, seconds: 500, outcome: 'handover' },
      practice: false,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    const page = mount(DebriefView, { global: { plugins: [router] } });
    expect(page.find('.stat .stat-sub').text()).toBe('Last run 91% · No pulse: no reading');
  });

  it('a run with no CPR has no such row, and neither has any other drill', () => {
    const untouched = new Simulation(shockable);
    untilEnd(untouched);
    expect(showRun(untouched).find('.facts').exists()).toBe(false);
    expect(show().find('.facts').exists()).toBe(false);
  });

  it('a run saved before there were facts still opens', () => {
    const page = showRun(coded(), (debrief) => {
      const { facts: _facts, ...old } = debrief;
      return old as Debrief;
    });
    expect(page.find('.hero-title').text()).toBe('Handed over to EMS');
    expect(page.find('.facts').exists()).toBe(false);
  });
});
