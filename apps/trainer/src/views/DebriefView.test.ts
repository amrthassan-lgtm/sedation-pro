import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import { gradeRun, type Debrief } from '@/engine/grade';
import { pageShortName } from '@/engine/protocol';
import { SCENARIOS } from '@/scenarios';
import { quiet } from '@/scenarios/quiet';
import { untilEnd } from '@/scenarios/testing';
import { setLastRun, type RunRecord } from '@/session';

import DebriefView from './DebriefView.vue';

/** "Shallow" with nothing done: an arrest, and more than three steps missed. */
function untreated(): { sim: Simulation; debrief: Debrief } {
  const sim = new Simulation(quiet);
  untilEnd(sim);
  return { sim, debrief: gradeRun(quiet, sim) };
}

function show(change: Partial<Debrief> = {}, previous: RunRecord | null = null) {
  const { sim, debrief } = untreated();
  setLastRun({
    debrief: { ...debrief, ...change },
    history: sim.history,
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
