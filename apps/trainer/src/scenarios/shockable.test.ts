import { describe, expect, it } from 'vitest';

import { findProtocol } from '@sedation-pro/clinical';

import { BREATH, CPR, Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';

import { AED_SAYS } from './shared';
import { shockable } from './shockable';
import { advance, drawAndGive, until, untilEnd } from './testing';

type Options = ConstructorParameters<typeof Simulation>[1];

function start(options: Options = {}): Simulation {
  return new Simulation(shockable, options);
}

function toArrest(sim: Simulation): void {
  expect(until(sim, 'arrest')).toBe(true);
}

/** The first acts of the page: stop, call, the pulse, compressions, the bag through an opened airway, the pads. */
function openTheCode(sim: Simulation): void {
  sim.act('stop');
  sim.act('call_911');
  sim.act('pulse_check');
  sim.act('cpr');
  sim.act('jaw_thrust');
  sim.act('bvm');
  sim.act('aed');
}

/** On until the AED advises a shock. False if it never does. */
function toAdvice(sim: Simulation, maxSeconds = 400): boolean {
  for (let i = 0; i < maxSeconds * 4 && !sim.ending && sim.prompt?.id !== 'shock'; i += 1) {
    sim.tick(0.25);
  }
  return sim.prompt?.id === 'shock';
}

/** The next shock, given the moment it is advised, with compressions back on at once unless told not to. */
function shock(sim: Simulation, restart = true): void {
  expect(toAdvice(sim)).toBe(true);
  sim.answer('shock');
  if (restart) sim.act('cpr');
}

/** The ampule as the callout writes it, and the flush behind it. */
function epinephrine(sim: Simulation): void {
  drawAndGive(sim, 'epinephrine', 1);
  sim.act('saline');
}

/** Two 3 ml syringes one after the other, and the flush behind them. */
function amiodarone(sim: Simulation): void {
  drawAndGive(sim, 'amiodarone', 3);
  drawAndGive(sim, 'amiodarone', 3);
  sim.act('saline');
}

/** The whole page, to the pulse and the hand that finds it. */
function byThePage(sim: Simulation): void {
  toArrest(sim);
  openTheCode(sim);
  shock(sim);
  drawAndGive(sim, 'naloxone', 1);
  shock(sim);
  epinephrine(sim);
  shock(sim);
  amiodarone(sim);
  expect(until(sim, 'rosc')).toBe(true);
  sim.act('pulse_check');
  expect(untilEnd(sim)).toBe(true);
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(shockable, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

function part(sim: Simulation, id: string, quote: string) {
  const found = row(sim, id).parts.find((p) => p.quote.includes(quote));
  if (!found) throw new Error(`Row "${id}" has no part "${quote}"`);
  return found.result;
}

const logged = (sim: Simulation): string[] => sim.log.map((l) => l.text);
const said = (sim: Simulation, who: string): string[] =>
  sim.voices.filter((v) => v.who === who).map((v) => v.line);
const PAGE = findProtocol('vfib_vtach')!;

describe('"Shockable", played by the page', () => {
  it('his pulse comes back in the round after the third shock, and every step that applied is done', () => {
    const sim = start();
    byThePage(sim);
    const debrief = gradeRun(shockable, sim);
    expect(sim.endingKey).toBe('pulse_ems');
    expect(sim.ending).toMatchObject({ outcome: 'recovered', title: 'A pulse again' });
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result !== 'done')).toEqual([
      expect.objectContaining({ id: 'until_ems', result: 'na' }),
    ]);
    expect(debrief).toMatchObject({ of: 10, done: 10, outside: [], clean: true });
    expect(sim.run.count('shock')).toBe(3);
    expect(logged(sim)).toEqual(
      expect.arrayContaining([
        'Unresponsive, not breathing',
        'CPR started',
        'Shock 1 delivered',
        'Shock 2 delivered',
        'Shock 3 delivered',
        'Organised rhythm, pulse wave back',
        'Pulse check: pulse felt',
      ]),
    );
  });

  it('prints the protocol’s own words, never a paraphrase', () => {
    const sim = start();
    byThePage(sim);
    const steps = PAGE.steps.map((s) => s.text);
    const rows = gradeRun(shockable, sim).rows;
    for (const r of rows) if (r.kind === 'step') expect(steps).toContain(r.text);
    expect(rows.filter((r) => r.kind === 'note').map((r) => r.text)).toEqual([
      'Epinephrine: push, then a 20 ml saline flush',
      'Epinephrine: label the syringe',
      'Amiodarone: IV PUSH, then a 20 ml saline flush',
      'Amiodarone: label the syringes',
    ]);
  });

  it('a few quiet seconds, then he stops answering, in the words the owner approved', () => {
    const sim = start();
    expect(sim.scene).toBe(
      'You are sectioning #19. He is drowsy and answers when you speak to him.',
    );
    advance(sim, 5.75);
    expect(sim.phase).toBe('working');
    toArrest(sim);
    expect(sim.t).toBeCloseTo(6, 1);
    expect(sim.scene).toBe(
      'He stops answering. His arm slides off the armrest, and his chest is still.',
    );
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Doc, he’s not answering.' });
    advance(sim, 0.5);
    expect(sim.look).toMatchObject({ color: 'grey', note: 'unresponsive, not breathing' });
  });

  it('the monitor is already on him: the rhythm is on the screen from that second, with no pulse under it', () => {
    const sim = start();
    expect(sim.monitor).toMatchObject({ rhythm: 'sinus', spo2: 97, etco2: 37, rr: 13 });
    expect(sim.monitor.perfusion).toBeGreaterThan(0);
    toArrest(sim);
    advance(sim, 0.5);
    expect(sim.monitor).toMatchObject({
      rhythm: 'vtach',
      perfusion: 0,
      etco2: null,
      capno: 'flat',
      rr: 0,
    });
    expect(sim.monitor.hr).toBeGreaterThan(90);
    // No reading to breach a limit; the lost CO₂ trace is what alarms, as in any room.
    advance(sim, 30);
    expect(sim.monitor.alarms).toEqual(['apnea']);
    expect(sim.monitor.hr).toBe(188);
  });

  it('compressions with breaths going in bring a low CO₂ trace back, and either alone brings none', () => {
    const compressions = start();
    toArrest(compressions);
    compressions.act('cpr');
    advance(compressions, 10);
    expect(compressions.monitor.etco2).toBeNull();

    const bag = start();
    toArrest(bag);
    bag.act('jaw_thrust');
    bag.act('bvm');
    advance(bag, 10);
    expect(bag.monitor.etco2).toBeNull();

    const both = start();
    toArrest(both);
    advance(both, 3);
    expect(both.monitor.etco2).toBeNull();
    both.act('cpr');
    both.act('jaw_thrust');
    both.act('bvm');
    advance(both, 1);
    expect(both.monitor).toMatchObject({ capno: 'normal', etco2: 13, perfusion: 0 });
    // And it is lost again the moment her hands come off.
    both.act('cpr');
    advance(both, 1);
    expect(both.monitor).toMatchObject({ capno: 'flat', etco2: null });
  });

  it('that is how the team sees the pulse come back: organised beats, a pulse wave, and the CO₂ jumps', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    epinephrine(sim);
    shock(sim);
    amiodarone(sim);
    advance(sim, 9);
    expect(sim.phase).toBe('arrest');
    expect(sim.monitor).toMatchObject({ rhythm: 'vtach', perfusion: 0, etco2: 13 });
    expect(until(sim, 'rosc')).toBe(true);
    expect(sim.scene).toBe(
      'The trace on the monitor has changed: narrow, regular beats, with a pulse wave under them.',
    );
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Doc, look at the monitor.' });
    advance(sim, 3);
    expect(sim.monitor).toMatchObject({ rhythm: 'sinus', etco2: 46, hr: 106 });
    expect(sim.monitor.perfusion).toBeGreaterThan(0);
    expect(sim.monitor.spo2).toBeGreaterThanOrEqual(90);
    // She is still compressing: nobody has felt for it yet.
    expect(sim.isOn('cpr')).toBe(true);
    sim.act('pulse_check');
    expect(sim.isOn('cpr')).toBe(false);
    advance(sim, 0.5);
    expect(sim.endingKey).toBe('pulse_ems');
  });

  it('a pulse check on him while he has none finds none, and his own pulse before that', () => {
    const sim = start();
    sim.act('pulse_check');
    expect(sim.scene).toBe('You feel a pulse at his neck.');
    toArrest(sim);
    sim.act('pulse_check');
    expect(sim.scene).toBe('You feel for a pulse at his neck. There is none.');
    expect(sim.log.at(-1)?.text).toBe('Pulse check: no pulse');
  });

  it('a pulse nobody feels for is not left waiting: he moves under her hands, and the run ends the same', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    drawAndGive(sim, 'naloxone', 1);
    shock(sim);
    epinephrine(sim);
    shock(sim);
    amiodarone(sim);
    expect(until(sim, 'rosc')).toBe(true);
    const back = sim.t;
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - back).toBeCloseTo(20, 0);
    expect(sim.endingKey).toBe('pulse_ems');
    expect(logged(sim)).toContain('He coughs and moves: compressions stopped');
    expect(gradeRun(shockable, sim).clean).toBe(true);
  });

  it('with nobody called, the same pulse comes back, and the ending says nobody is coming', () => {
    const sim = start();
    toArrest(sim);
    sim.act('cpr');
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('aed');
    shock(sim);
    shock(sim);
    epinephrine(sim);
    shock(sim);
    amiodarone(sim);
    expect(until(sim, 'rosc')).toBe(true);
    sim.act('pulse_check');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('pulse');
    expect(sim.ending?.text).toContain('Nobody has called 911.');
    expect(part(sim, 'help', '911')).toBe('missed');
    expect(gradeRun(shockable, sim).clean).toBe(false);
  });
});

describe('"Shockable": the assistant compresses and the player is on the bag', () => {
  /** Both breaths in a pause, squeezed by hand, each over the page's second. */
  function breathe(sim: Simulation): void {
    advance(sim, BREATH.overSec);
    sim.squeeze(BREATH.overSec);
    advance(sim, BREATH.overSec + 0.5);
    sim.squeeze(BREATH.overSec);
  }

  /** Real time, with the pauses answered or not, until `done` or the run ends. */
  function code(sim: Simulation, done: (sim: Simulation) => boolean, breaths = true): void {
    for (let i = 0; i < 4 * 900 && !sim.ending && !done(sim); i += 1) {
      sim.tick(0.25);
      const chest = sim.compressions;
      if (breaths && chest?.mode === 'cycle' && !chest.compressing && chest.breaths === 0) {
        breathe(sim);
      }
    }
  }

  const advised = (sim: Simulation): boolean => sim.prompt?.id === 'shock';

  /** The page by hand, a pause's breaths given each time it comes. */
  function byHand(sim: Simulation, breaths = true): void {
    toArrest(sim);
    openTheCode(sim);
    for (const drug of [
      () => drawAndGive(sim, 'naloxone', 1),
      () => epinephrine(sim),
      () => amiodarone(sim),
    ]) {
      code(sim, advised, breaths);
      sim.answer('shock');
      sim.act('cpr');
      drug();
    }
  }

  it('CPR is one button: she counts the page’s thirty and stops for the player’s two', () => {
    const sim = start({ pacedBag: true });
    toArrest(sim);
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('cpr');
    expect(sim.voices.at(-1)).toEqual({
      who: 'DA',
      line: 'Compressions going. One, two, three…',
    });
    expect(sim.compressions).toMatchObject({ mode: 'cycle', compressing: true });
    code(sim, (s) => s.pauses.length === 1, false);
    expect(sim.compressions?.compressing).toBe(false);
    expect(sim.pauses[0]!.t - sim.run.at('cpr')!).toBeCloseTo(
      (CPR.compressions * 60) / CPR.perMin,
      5,
    );
    breathe(sim);
    expect(sim.compressions?.compressing).toBe(true);
    expect(sim.pauses[0]).toMatchObject({ breaths: 2, wentIn: 2 });
    // The first air to go in is when the assistant speaks of the chest.
    expect(said(sim, 'DA')).toContain('Bagging. His chest is rising.');
  });

  it('the player is on the bag for the whole arrest: the assistant cannot take it', () => {
    const sim = start({ pacedBag: true });
    toArrest(sim);
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('cpr');
    expect(sim.handBag('da')).toBe(false);
    expect(sim.bagHeldBy).toBe('player');
  });

  it('played by hand, a pause’s breaths given each time, it is the same clean run', () => {
    const sim = start({ pacedBag: true });
    byHand(sim);
    code(sim, (s) => s.phase === 'rosc');
    expect(sim.phase).toBe('rosc');
    sim.act('pulse_check');
    expect(untilEnd(sim)).toBe(true);
    const debrief = gradeRun(shockable, sim);
    expect(sim.endingKey).toBe('pulse_ems');
    expect(debrief).toMatchObject({ of: 10, done: 10, clean: true });
    expect(part(sim, 'cpr', '30:2')).toBe('done');
    // Two rounds each long enough for one of her pauses; in the third his pulse is back before one comes.
    expect(sim.pauses.filter((p) => p.wentIn === 2).length).toBeGreaterThanOrEqual(2);
    expect(sim.breaths.length).toBeGreaterThanOrEqual(4);
    expect(sim.breaths.every((b) => b.cycle === 'pause' && b.onPace)).toBe(true);
  });

  it('with the pauses left empty no air goes in, and his pulse does not come back', () => {
    const sim = start({ pacedBag: true });
    byHand(sim, false);
    code(sim, advised, false);
    // A fourth shock is advised: the round after the third went by with no breath.
    expect(sim.run.count('aed:advised')).toBe(4);
    expect(sim.run.entered('rosc')).toBeNull();
    expect(sim.pauses.length).toBeGreaterThan(3);
    expect(sim.pauses.every((p) => p.breaths === 0)).toBe(true);
    expect(sim.monitor.etco2).toBeNull();
    untilEndRestarting(sim);
    expect(sim.endingKey).toBe('ems_cpr');
    expect(part(sim, 'cpr', '30:2')).toBe('missed');
    expect(part(sim, 'cause', 'Hypoxia (ventilate)')).toBe('missed');
  });

  it('breaths in at least half of her pauses are the page’s 30:2; fewer are not', () => {
    /** CPR and the bag with no AED, to the ambulance, answering only the pauses `wanted` picks. */
    const play = (wanted: (pause: number) => boolean): Simulation => {
      const sim = start({ pacedBag: true });
      toArrest(sim);
      sim.act('call_911');
      sim.act('cpr');
      sim.act('jaw_thrust');
      sim.act('bvm');
      for (let i = 0; i < 4 * 900 && !sim.ending; i += 1) {
        sim.tick(0.25);
        const chest = sim.compressions;
        const open = chest?.mode === 'cycle' && !chest.compressing && chest.breaths === 0;
        if (open && wanted(sim.pauses.length) && sim.t - sim.pauses.at(-1)!.t < 0.5) breathe(sim);
      }
      return sim;
    };
    const count = (sim: Simulation) => {
      const ended = sim.pauses.filter((p) => p.ended !== null);
      return { full: ended.filter((p) => p.wentIn === 2).length, all: ended.length };
    };

    const everyOther = play((pause) => pause % 2 === 1);
    expect(count(everyOther).all).toBeGreaterThanOrEqual(4);
    expect(count(everyOther).full * 2).toBeGreaterThanOrEqual(count(everyOther).all);
    expect(part(everyOther, 'cpr', '30:2')).toBe('done');

    const onlyTheFirst = play((pause) => pause === 1);
    expect(count(onlyTheFirst).full).toBe(1);
    expect(count(onlyTheFirst).all).toBeGreaterThanOrEqual(3);
    expect(part(onlyTheFirst, 'cpr', '30:2')).toBe('missed');
    // Air did go in while he had no pulse, all the same.
    expect(part(onlyTheFirst, 'cause', 'Hypoxia (ventilate)')).toBe('done');
  });

  it('a bag squeezed on an airway nobody opened moves no air: the chest is said not to rise', () => {
    const sim = start({ pacedBag: true });
    toArrest(sim);
    sim.act('cpr');
    sim.act('bvm');
    code(sim, (s) => s.pauses.length === 1, false);
    breathe(sim);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(sim.pauses[0]).toMatchObject({ breaths: 2, wentIn: 0 });
    expect(sim.monitor.etco2).toBeNull();
    // Opened, the next pause's breaths go in, and she says so.
    sim.act('jaw_thrust');
    code(sim, (s) => s.pauses.length === 2, false);
    breathe(sim);
    advance(sim, 0.5);
    expect(sim.pauses[1]).toMatchObject({ breaths: 2, wentIn: 2 });
    expect(said(sim, 'DA')).toContain('Bagging. His chest is rising.');
  });

  it('an LMA or a King goes in, is a way in for the bag, and ends her pauses', () => {
    for (const [id, name] of [
      ['lma', 'LMA'],
      ['king', 'King'],
    ] as const) {
      const sim = start({ pacedBag: true });
      toArrest(sim);
      sim.act('cpr');
      sim.act('bvm');
      sim.act(id);
      expect(sim.scene).toBe(`The ${name} is in.`);
      expect(sim.log.at(-1)?.text).toBe(`${name} in`);
      expect(sim.compressions).toMatchObject({ mode: 'continuous', compressing: true });
      for (let i = 0; i < 5; i += 1) {
        advance(sim, BREATH.everySec - BREATH.overSec);
        advance(sim, BREATH.overSec);
        sim.squeeze(BREATH.overSec);
      }
      expect(sim.pauses).toEqual([]);
      expect(sim.monitor).toMatchObject({ bagged: true, etco2: 13 });
      sim.act('call_911');
      untilEnd(sim, 900);
      expect(part(sim, 'cpr', '1 breath every 6 seconds')).toBe('done');
      // Never a pause to give two breaths in: the 30:2 was not reached.
      expect(part(sim, 'cpr', '30:2')).toBe('na');
      expect(part(sim, 'cause', 'Hypoxia (ventilate)')).toBe('done');
    }
  });

  it('a tube with nobody squeezing the bag through it is not the page’s breath every six seconds', () => {
    const sim = start({ pacedBag: true });
    toArrest(sim);
    sim.act('cpr');
    sim.act('bvm');
    sim.act('lma');
    sim.act('call_911');
    untilEnd(sim, 900);
    expect(part(sim, 'cpr', '1 breath every 6 seconds')).toBe('missed');
  });

  it('before he arrests he still has his reflexes: a tube comes straight out', () => {
    const sim = start();
    sim.act('lma');
    expect(sim.isOn('lma')).toBe(false);
    expect(sim.scene).toBe('He gags on the LMA and it comes straight out.');
  });
});

describe('"Shockable": the AED is one button and speaks for itself', () => {
  it('on means pads on: it analyses, her hands come off by themselves, and it advises a shock', () => {
    const sim = start();
    toArrest(sim);
    sim.act('cpr');
    sim.act('aed');
    expect(sim.log.at(-1)?.text).toBe('AED pads on');
    advance(sim, 4.75);
    expect(sim.isOn('cpr')).toBe(true);
    expect(sim.prompt).toBeNull();
    advance(sim, 0.5);
    expect(sim.voices.at(-1)).toEqual({ who: 'AED', line: 'Analyzing. Stand clear.' });
    expect(sim.isOn('cpr')).toBe(false);
    // Taken off by the AED, not stopped by a hand: nobody is told off for it.
    expect(logged(sim)).not.toContain('CPR stopped');
    advance(sim, 4);
    expect(sim.prompt).toEqual({
      id: 'shock',
      voice: { who: 'AED', line: 'Shock advised.' },
      options: [{ id: 'shock', label: 'Shock' }],
    });
    expect(sim.voices.at(-1)).toEqual({ who: 'AED', line: 'Shock advised.' });
  });

  it('after the shock nobody is on his chest until the player says so', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim, false);
    expect(sim.scene).toBe('His body jerks once under the pads.');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Shock 1 delivered', tone: 'good' });
    expect(sim.isOn('cpr')).toBe(false);
    advance(sim, 11.75);
    expect(said(sim, 'DA')).not.toContain('Nobody’s on his chest, Doc.');
    advance(sim, 0.5);
    // Said once the page's "right away" has passed, and only once.
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Nobody’s on his chest, Doc.' });
    advance(sim, 30);
    expect(said(sim, 'DA').filter((l) => l === 'Nobody’s on his chest, Doc.')).toHaveLength(1);
    expect(sim.isOn('cpr')).toBe(false);
    sim.act('cpr');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Back on his chest.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'CPR resumed', tone: 'neutral' });
  });

  it('compressions back on at once are the page’s "right away"; later ones are not', () => {
    const prompt = start();
    toArrest(prompt);
    openTheCode(prompt);
    shock(prompt, false);
    advance(prompt, 9);
    prompt.act('cpr');
    expect(prompt.log.at(-1)).toMatchObject({ text: 'CPR resumed', tone: 'good' });
    untilEndRestarting(prompt);
    expect(row(prompt, 'shock').result).toBe('done');

    const late = start();
    toArrest(late);
    openTheCode(late);
    shock(late, false);
    advance(late, 11);
    late.act('cpr');
    untilEndRestarting(late);
    expect(part(late, 'shock', 'shock when advised')).toBe('done');
    expect(part(late, 'shock', 'then CPR for 2 minutes right away')).toBe('missed');
    expect(row(late, 'shock').result).toBe('partial');
  });

  it('says three things and no others, however long the code runs', () => {
    const sim = start({ forgiving: true });
    toArrest(sim);
    openTheCode(sim);
    for (let i = 0; i < 3; i += 1) shock(sim);
    untilEnd(sim, 900);
    const lines = new Set(said(sim, 'AED'));
    expect([...lines].sort()).toEqual([AED_SAYS.analysing, AED_SAYS.shock].sort());
    expect(Object.values(AED_SAYS)).toEqual([
      'Analyzing. Stand clear.',
      'Shock advised.',
      'No shock advised.',
    ]);
  });

  it('with a pulse under the pads it advises no shock', () => {
    const before = start();
    before.act('aed');
    advance(before, 5.25);
    expect(before.voices.at(-1)).toEqual({ who: 'AED', line: 'Analyzing. Stand clear.' });
    // He arrests while it is still analysing: what it finds is the rhythm he is in by then.
    advance(before, 4.25);
    expect(before.prompt?.id).toBe('shock');

    const after = start();
    toArrest(after);
    after.act('cpr');
    after.act('jaw_thrust');
    after.act('bvm');
    after.act('call_911');
    after.act('aed');
    shock(after);
    shock(after);
    epinephrine(after);
    shock(after);
    amiodarone(after);
    expect(until(after, 'rosc')).toBe(true);
    // Pads lifted and put back: it looks again, and finds a rhythm it will not shock.
    after.act('aed');
    after.act('aed');
    advance(after, 9.5);
    expect(after.voices.at(-1)).toEqual({ who: 'AED', line: 'No shock advised.' });
    expect(after.prompt).toBeNull();
    expect(logged(after)).toContain('AED: no shock advised');
  });

  it('the pads taken off take its question down with them, and put back it analyses again', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    expect(toAdvice(sim)).toBe(true);
    sim.act('aed');
    expect(sim.prompt).toBeNull();
    expect(sim.log.at(-1)?.text).toBe('AED off');
    advance(sim, 20);
    expect(sim.prompt).toBeNull();
    sim.act('aed');
    expect(toAdvice(sim, 12)).toBe(true);
    expect(sim.run.count('aed:advised')).toBe(2);
    // Advised twice and given once: the first was never given.
    sim.answer('shock');
    sim.act('cpr');
    untilEnd(sim, 900);
    expect(part(sim, 'shock', 'shock when advised')).toBe('missed');
  });

  it('a shock left waiting is not "when advised"', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    expect(toAdvice(sim)).toBe(true);
    advance(sim, 16);
    sim.answer('shock');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Shock 1 delivered', tone: 'neutral' });
    sim.act('cpr');
    untilEnd(sim, 900);
    expect(part(sim, 'shock', 'shock when advised')).toBe('missed');
    expect(part(sim, 'shock', 'then CPR for 2 minutes right away')).toBe('done');
  });

  it('with nobody on his chest it does not wait for them: it analyses again two minutes after the shock', () => {
    const sim = start({ forgiving: true });
    toArrest(sim);
    sim.act('call_911');
    sim.act('aed');
    shock(sim, false);
    const first = sim.t;
    expect(toAdvice(sim)).toBe(true);
    expect(sim.t - first).toBeCloseTo(124, 0);
    expect(sim.cuts).toEqual([]);
  });
});

describe('"Shockable": a round is played, then its two minutes are skipped with a card', () => {
  it('after half a minute of CPR the story lands on the page’s two minutes, and the AED analyses', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    const shocked = sim.t;
    advance(sim, 29.75);
    expect(sim.cuts).toEqual([]);
    advance(sim, 0.5);
    expect(sim.cuts).toEqual([
      { at: expect.closeTo(shocked + 30, 0), seconds: 90, title: 'Two minutes of CPR' },
    ]);
    expect(sim.run.onFor('cpr', shocked)).toBeCloseTo(120, 0);
    advance(sim, 0.5);
    expect(sim.voices.at(-1)).toEqual({ who: 'AED', line: 'Analyzing. Stand clear.' });
    expect(sim.isOn('cpr')).toBe(false);
  });

  it('the card’s two minutes are the page’s own', () => {
    const step = PAGE.steps.find((s) => s.text.startsWith('AED: shock when advised'))!.text;
    expect(step).toContain('CPR for 2 minutes');
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    expect(toAdvice(sim)).toBe(true);
    expect(sim.cuts[0]?.title).toBe('Two minutes of CPR');
    expect(sim.cuts[0]!.seconds + 30).toBe(2 * 60);
  });

  it('CPR that was not back on at once is still given its two minutes before the next look', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim, false);
    const shocked = sim.t;
    advance(sim, 40);
    sim.act('cpr');
    expect(toAdvice(sim)).toBe(true);
    expect(sim.cuts).toHaveLength(1);
    // Two minutes of compressions since the shock, which began forty seconds after it.
    expect(sim.t - shocked).toBeCloseTo(40 + 120 + 4, 0);
  });

  it('the story does not skip while a syringe is in the hand, or before a push has had its flush', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    const shocked = sim.t;
    advance(sim, 28);
    const id = sim.pickUpSyringe(3);
    advance(sim, 4);
    sim.drawFromVial(id, 'epinephrine', 1);
    advance(sim, 4);
    sim.labelSyringe(id);
    advance(sim, 4);
    expect(sim.t - shocked).toBe(40);
    expect(sim.cuts).toHaveLength(1);
    sim.give(id, 1, 'IV');
    // Pushed, and the flush not yet behind it.
    advance(sim, 10);
    expect(sim.cuts).toHaveLength(1);
    sim.act('saline');
    advance(sim, 0.5);
    expect(sim.cuts).toHaveLength(2);
    untilEndRestarting(sim);
    expect(row(sim, 'epinephrine_flush').result).toBe('done');
  });

  it('a push nobody flushes holds the story only as long as a flush could still follow it', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    advance(sim, 25);
    drawAndGive(sim, 'epinephrine', 1);
    // Half a minute of the round has been played by now, and the push is still within a flush's reach.
    advance(sim, 19.5);
    expect(sim.cuts).toHaveLength(1);
    advance(sim, 1);
    expect(sim.cuts).toHaveLength(2);
    untilEndRestarting(sim);
    expect(row(sim, 'epinephrine_flush').result).toBe('missed');
  });

  it('a round whose drug has not been touched is played for a minute before it is skipped all the same', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    const second = sim.t;
    // The round after the second shock: the page's epinephrine is still to give.
    advance(sim, 59.75);
    expect(sim.cuts).toHaveLength(1);
    advance(sim, 0.5);
    expect(sim.cuts).toHaveLength(2);
    expect(sim.cuts[1]).toMatchObject({ seconds: 60, title: 'Two minutes of CPR' });
    expect(sim.run.onFor('cpr', second)).toBeCloseTo(120, 0);

    // The same round with the epinephrine in and flushed is skipped at the half minute.
    const given = start();
    toArrest(given);
    openTheCode(given);
    shock(given);
    shock(given);
    epinephrine(given);
    advance(given, 30.25);
    expect(given.cuts).toHaveLength(2);
    expect(given.cuts[1]?.seconds).toBe(90);

    // And so is the round after the third shock, until the amiodarone is in.
    shock(given);
    advance(given, 45);
    expect(given.cuts).toHaveLength(2);
    advance(given, 15.25);
    expect(given.cuts).toHaveLength(3);
  });

  it('with no AED on, rounds of CPR are still skipped two minutes at a time', () => {
    const sim = start();
    toArrest(sim);
    sim.act('call_911');
    sim.act('cpr');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 70);
    expect(sim.cuts.map((c) => c.title)).toEqual(['Two minutes of CPR', 'Two minutes of CPR']);
    expect(sim.cuts.map((c) => c.seconds)).toEqual([90, 90]);
    expect(untilEnd(sim, 600)).toBe(true);
    expect(sim.endingKey).toBe('ems_cpr');
    expect(sim.cuts.at(-1)?.title).toBe('EMS arrives');
  });
});

describe('"Shockable": the two drugs, each after its own shock', () => {
  it('the 1 mg ampule into the vein is the page’s dose here, and not the mistake it is in every other room', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    drawAndGive(sim, 'epinephrine', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Epinephrine’s in.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'Epinephrine 1.0 ml IV', tone: 'good' });
    advance(sim, 15);
    expect(sim.phase).toBe('arrest');
    expect(logged(sim)).not.toContain('Epinephrine pushed into the vein');
  });

  it('the same push once his pulse is back is the mistake again', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    drawAndGive(sim, 'naloxone', 1);
    shock(sim);
    epinephrine(sim);
    shock(sim);
    amiodarone(sim);
    expect(until(sim, 'rosc')).toBe(true);
    drawAndGive(sim, 'epinephrine', 1);
    advance(sim, 0.5);
    expect(sim.phase).toBe('overdose');
    expect(sim.scene).toBe(
      'His heart rate leaps, and the trace on the monitor turns wide and fast.',
    );
    expect(sim.log.at(-1)).toMatchObject({ text: 'Epinephrine pushed into the vein', tone: 'bad' });
    expect(sim.look.note).toBe('unresponsive, not breathing');
    expect(sim.monitor.perfusion).toBeGreaterThan(0);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending).toMatchObject({ outcome: 'harm', title: 'Ventricular tachycardia' });
    const debrief = gradeRun(shockable, sim);
    expect(debrief.clean).toBe(false);
    // The dose that was the page's is still the page's.
    expect(row(sim, 'epinephrine').result).toBe('done');
  });

  it('and before he arrests, with a pulse, it is that mistake too', () => {
    const sim = start();
    advance(sim, 2);
    drawAndGive(sim, 'epinephrine', 1);
    advance(sim, 0.5);
    expect(sim.phase).toBe('overdose');
    expect(sim.scene).toContain('clutching his chest');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
    // The arrest page was never reached: nothing on it is marked against the run.
    expect(gradeRun(shockable, sim).of).toBe(0);
  });

  it('epinephrine before the second shock is not the page’s, and his pulse does not come back', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    epinephrine(sim);
    expect(sim.log.at(-2)).toMatchObject({ text: 'Epinephrine 1.0 ml IV', tone: 'neutral' });
    shock(sim);
    shock(sim);
    amiodarone(sim);
    untilEndRestarting(sim);
    expect(sim.run.entered('rosc')).toBeNull();
    expect(sim.endingKey).toBe('ems_cpr');
    expect(row(sim, 'epinephrine').result).toBe('missed');
    expect(row(sim, 'amiodarone').result).toBe('done');
    expect(gradeRun(shockable, sim).clean).toBe(false);
  });

  it('epinephrine is graded from its callout: the whole ampule, into the vein', () => {
    const half = start();
    toArrest(half);
    openTheCode(half);
    shock(half);
    shock(half);
    drawAndGive(half, 'epinephrine', 0.5);
    untilEndRestarting(half);
    expect(row(half, 'epinephrine').result).toBe('missed');

    const muscle = start();
    toArrest(muscle);
    openTheCode(muscle);
    shock(muscle);
    shock(muscle);
    drawAndGive(muscle, 'epinephrine', 1, { route: 'IM' });
    untilEndRestarting(muscle);
    expect(row(muscle, 'epinephrine').result).toBe('missed');

    const none = start();
    toArrest(none);
    openTheCode(none);
    shock(none);
    untilEndRestarting(none);
    // The run went on to a second shock and beyond, and no epinephrine followed it.
    expect(none.run.count('shock')).toBeGreaterThanOrEqual(2);
    expect(row(none, 'epinephrine').result).toBe('missed');
    expect(row(none, 'epinephrine_label').result).toBe('na');
  });

  it('the pen into the thigh is not the page’s epinephrine, and is logged as the pen it is', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    sim.useDevice('auviq_adult');
    expect(sim.log.at(-1)?.text).toBe('Auvi-Q 0.3 mg');
    advance(sim, 15);
    expect(sim.phase).toBe('arrest');
    untilEndRestarting(sim);
    expect(row(sim, 'epinephrine').result).toBe('missed');
    expect(sim.run.entered('rosc')).toBeNull();
  });

  it('a repeat is the page’s q3-5min: sooner than three minutes is not', () => {
    const play = (gapSec: number): Simulation => {
      const sim = start({ forgiving: true });
      toArrest(sim);
      sim.act('cpr');
      sim.act('jaw_thrust');
      sim.act('bvm');
      sim.act('aed');
      shock(sim);
      shock(sim);
      epinephrine(sim);
      const first = sim.t;
      // No time skipped under the count: the AED's rounds go on, and are restarted each time.
      while (sim.t - first < gapSec && !sim.ending) {
        if (sim.prompt?.id === 'shock') {
          sim.answer('shock');
          sim.act('cpr');
        }
        sim.tick(0.25);
      }
      epinephrine(sim);
      sim.act('call_911');
      untilEnd(sim, 900);
      return sim;
    };
    expect(row(play(185), 'epinephrine').result).toBe('done');
    expect(row(play(130), 'epinephrine').result).toBe('missed');
  });

  it('amiodarone is the page’s 300 mg after the third shock: two syringes, not one, and not sooner', () => {
    const one = start();
    toArrest(one);
    openTheCode(one);
    shock(one);
    shock(one);
    epinephrine(one);
    shock(one);
    drawAndGive(one, 'amiodarone', 3);
    expect(one.log.at(-1)).toMatchObject({ text: 'Amiodarone 3.0 ml IV', tone: 'neutral' });
    untilEndRestarting(one);
    expect(row(one, 'amiodarone').result).toBe('missed');
    expect(one.run.entered('rosc')).toBeNull();

    const early = start();
    toArrest(early);
    openTheCode(early);
    shock(early);
    shock(early);
    epinephrine(early);
    amiodarone(early);
    shock(early);
    untilEndRestarting(early);
    expect(row(early, 'amiodarone').result).toBe('missed');
    expect(early.run.entered('rosc')).toBeNull();
  });

  it('the label and the flush are graded from each callout’s own note', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    drawAndGive(sim, 'naloxone', 1);
    shock(sim);
    drawAndGive(sim, 'epinephrine', 1, { label: false });
    shock(sim);
    drawAndGive(sim, 'amiodarone', 3);
    sim.act('saline');
    drawAndGive(sim, 'amiodarone', 3);
    expect(until(sim, 'rosc')).toBe(true);
    sim.act('pulse_check');
    untilEnd(sim);
    expect(row(sim, 'epinephrine').result).toBe('done');
    expect(row(sim, 'epinephrine_label').result).toBe('missed');
    expect(row(sim, 'epinephrine_flush').result).toBe('missed');
    expect(row(sim, 'amiodarone_label').result).toBe('done');
    // Flushed behind the first syringe and not behind the second.
    expect(row(sim, 'amiodarone_flush').result).toBe('missed');
    expect(gradeRun(shockable, sim)).toMatchObject({ of: 10, done: 7, clean: false });
  });

  it('saline is the flush only behind a push: tapped at any other time it is the bolus the button says', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    sim.act('saline');
    expect(sim.log.at(-1)?.text).toBe('Saline bolus');
    shock(sim);
    shock(sim);
    drawAndGive(sim, 'epinephrine', 1);
    advance(sim, 5);
    sim.act('saline');
    expect(sim.scene).toBe('Saline runs in behind the push.');
    expect(sim.log.at(-1)?.text).toBe('Saline flush');
  });
});

describe('"Shockable": the likely cause', () => {
  it('a reversal given while he has no pulse is the page’s; either one counts, as its own page writes it', () => {
    const naloxone = start();
    byThePage(naloxone);
    expect(part(naloxone, 'cause', 'reverse with Naloxone / Flumazenil')).toBe('done');

    const flumazenil = start();
    toArrest(flumazenil);
    openTheCode(flumazenil);
    shock(flumazenil);
    drawAndGive(flumazenil, 'flumazenil', 2);
    expect(flumazenil.voices.at(-1)).toEqual({ who: 'DA', line: 'Flumazenil’s in.' });
    untilEnd(flumazenil, 900);
    expect(part(flumazenil, 'cause', 'reverse with Naloxone / Flumazenil')).toBe('done');
    expect(gradeRun(shockable, flumazenil).outside).toEqual([]);
  });

  it('none given, or one given in a dose its page does not write, is not', () => {
    const none = start();
    toArrest(none);
    openTheCode(none);
    untilEnd(none, 900);
    expect(part(none, 'cause', 'reverse with Naloxone / Flumazenil')).toBe('missed');
    expect(part(none, 'cause', 'Hypoxia (ventilate)')).toBe('done');
    expect(row(none, 'cause').result).toBe('partial');

    const little = start();
    toArrest(little);
    openTheCode(little);
    drawAndGive(little, 'naloxone', 0.2);
    untilEnd(little, 900);
    expect(part(little, 'cause', 'reverse with Naloxone / Flumazenil')).toBe('missed');
  });

  it('given only once his pulse is back, it was not given for the arrest', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    shock(sim);
    epinephrine(sim);
    shock(sim);
    amiodarone(sim);
    expect(until(sim, 'rosc')).toBe(true);
    drawAndGive(sim, 'naloxone', 1);
    sim.act('pulse_check');
    untilEnd(sim);
    expect(part(sim, 'cause', 'reverse with Naloxone / Flumazenil')).toBe('missed');
    expect(gradeRun(shockable, sim)).toMatchObject({ of: 10, done: 9, clean: false });
  });

  it('more of what sedated him is in no part of this page, and is listed', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    drawAndGive(sim, 'midazolam', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'That’s more midazolam going in, Doc.' });
    untilEnd(sim, 900);
    expect(gradeRun(shockable, sim).outside.map((d) => d.drugKey)).toEqual(['midazolam']);
  });
});

describe('"Shockable": left alone, or left too long', () => {
  it('hands off, the front desk asks at two minutes, and at three the run is over', () => {
    const sim = start();
    toArrest(sim);
    advance(sim, 8);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'He’s not breathing, Doc!' });
    advance(sim, 111.75);
    expect(sim.prompt).toBeNull();
    advance(sim, 0.5);
    expect(sim.prompt?.voice).toEqual({ who: 'Front desk', line: 'Do you want me to call 911?' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t).toBeCloseTo(186, 0);
    expect(sim.endingKey).toBe('lost');
    expect(sim.ending).toEqual({
      outcome: 'arrest',
      title: 'Too long without CPR',
      text: 'Nobody was on his chest for three minutes. The run stops here.',
    });
    expect(sim.log.at(-1)).toMatchObject({
      text: 'Three minutes with nobody on his chest',
      tone: 'bad',
    });
    const debrief = gradeRun(shockable, sim);
    expect(debrief.done).toBe(0);
    expect(debrief.clean).toBe(false);
    expect(row(sim, 'until_ems').result).toBe('missed');
  });

  it('the three minutes are of one stretch: compressions started late and kept up do not end it', () => {
    const sim = start();
    toArrest(sim);
    advance(sim, 170);
    sim.act('cpr');
    advance(sim, 60);
    expect(sim.ending).toBeNull();
    sim.act('cpr');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Stopped? He has no pulse!' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'CPR stopped', tone: 'bad' });
    advance(sim, 179);
    expect(sim.ending).toBeNull();
    advance(sim, 1.5);
    expect(sim.endingKey).toBe('lost');
  });

  it('a shock with nobody back on his chest afterwards ends the same way', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim, false);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('lost');
    // Shocked twice more on the way, each two minutes after the last, and never compressed.
    expect(part(sim, 'shock', 'then CPR for 2 minutes right away')).toBe('missed');
  });

  it('never calling: she asks again every two minutes, never over the AED or in the seconds after a shock', () => {
    const sim = start({ forgiving: true });
    toArrest(sim);
    sim.act('cpr');
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('aed');
    shock(sim);
    // The first round's two minutes are skipped, and the story resumes past her two minutes.
    shock(sim);
    expect(sim.t - sim.run.entered('arrest')!).toBeGreaterThan(120);
    // The AED's question came first, and the chest after its shock. Then she asks.
    expect(sim.prompt).toBeNull();
    advance(sim, 11.75);
    expect(sim.prompt).toBeNull();
    advance(sim, 0.5);
    expect(sim.prompt?.voice).toEqual({ who: 'Front desk', line: 'Do you want me to call 911?' });
    const asked = sim.t;
    sim.answer('not_yet');
    expect(sim.run.at('call_911')).toBeNull();

    shock(sim);
    advance(sim, 12.25);
    expect(sim.prompt?.id).toBe('front_desk_911');
    expect(sim.t - asked).toBeGreaterThanOrEqual(120);
    // Left unanswered, her question gives way to the AED's and is asked again after it.
    expect(toAdvice(sim)).toBe(true);
    sim.answer('shock');
    sim.act('cpr');
    advance(sim, 12.25);
    expect(sim.prompt?.id).toBe('front_desk_911');
    sim.answer('call');
    expect(sim.voices.at(-1)).toEqual({
      who: 'Front desk',
      line: '911 is on the way. About eight minutes.',
    });
    const called = sim.run.at('call_911')!;
    untilEndRestarting(sim);
    expect(sim.t - called).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_cpr');
    expect(part(sim, 'help', '911')).toBe('done');
  });

  it('the call tapped while she is asking is her answer', () => {
    const sim = start({ forgiving: true });
    toArrest(sim);
    advance(sim, 121);
    expect(sim.prompt?.id).toBe('front_desk_911');
    sim.act('call_911');
    expect(sim.prompt).toBeNull();
    expect(logged(sim).filter((l) => l === '911 called')).toHaveLength(1);
  });
});

describe('"Shockable": EMS takes over', () => {
  it('mid-code with her on his chest, CPR is still going, and the last step is done', () => {
    const sim = start();
    toArrest(sim);
    openTheCode(sim);
    shock(sim);
    drawAndGive(sim, 'naloxone', 1);
    untilEndRestarting(sim);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_cpr');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. CPR is still going.',
    });
    expect(sim.scene).toBe('EMS is at the door with a stretcher. CPR is still going.');
    expect(row(sim, 'until_ems').result).toBe('done');
    expect(part(sim, 'until_ems', 'Continue CPR')).toBe('done');
    expect(part(sim, 'until_ems', 'AED')).toBe('done');
    // Nobody gave the drugs: the rhythm stayed shockable to the end.
    expect(sim.run.entered('rosc')).toBeNull();
    expect(row(sim, 'epinephrine').result).toBe('missed');
    expect(gradeRun(shockable, sim).clean).toBe(false);
  });

  /**
   * A code with every shock given the moment it is advised, played to the end.
   * `callAt`: when 911 is called. `restart`: whether she is put back on his
   * chest after the shock of that number.
   */
  function code(
    sim: Simulation,
    callAt: number | null,
    restart: (shock: number) => boolean = () => true,
  ): void {
    toArrest(sim);
    sim.act('cpr');
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('aed');
    for (let i = 0; i < 4 * 900 && !sim.ending; i += 1) {
      if (callAt !== null && sim.t >= callAt && sim.run.at('call_911') === null) {
        sim.act('call_911');
      }
      if (sim.prompt?.id === 'shock') {
        sim.answer('shock');
        if (restart(sim.run.count('shock'))) sim.act('cpr');
      }
      sim.tick(0.25);
    }
  }

  it('with her hands off for the AED when they walk in, it is still a code being run', () => {
    // Played once with nobody called, to learn when the AED takes its fifth look.
    const dry = start({ forgiving: true });
    code(dry, null);
    const looks = dry.log.filter((l) => l.text === 'AED: analyzing').map((l) => l.t);
    const fifth = looks[4]!;
    expect(fifth).toBeGreaterThan(480 + 6);

    // The same code, called so that they walk in two seconds into that look.
    const sim = start();
    code(sim, fifth + 2 - 480);
    expect(sim.t).toBeCloseTo(fifth + 2, 0);
    expect(sim.isOn('cpr')).toBe(false);
    expect(sim.endingKey).toBe('ems_cpr');
    expect(part(sim, 'until_ems', 'Continue CPR')).toBe('done');
  });

  it('but a chest nobody went back to after a shock is what it is', () => {
    const dry = start({ forgiving: true });
    code(dry, null);
    const fifthShock = dry.log.find((l) => l.text === 'Shock 5 delivered')!.t;

    // Called so that they walk in twelve seconds after the fifth shock, with nobody back on him.
    const sim = start();
    code(sim, fifthShock + 12 - 480, (shock) => shock < 5);
    expect(sim.t).toBeCloseTo(fifthShock + 12, 0);
    expect(sim.endingKey).toBe('ems_no_cpr');
    expect(part(sim, 'until_ems', 'Continue CPR')).toBe('missed');
    expect(part(sim, 'shock', 'then CPR for 2 minutes right away')).toBe('missed');
  });

  it('with nobody on his chest, that is what they find, and the last step was not done', () => {
    const sim = start({ forgiving: true });
    toArrest(sim);
    sim.act('call_911');
    sim.act('aed');
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.endingKey).toBe('ems_no_cpr');
    expect(sim.ending?.text).toBe(
      'He leaves with EMS. He has no pulse, and nobody is on his chest.',
    );
    expect(part(sim, 'until_ems', 'Continue CPR')).toBe('missed');
    expect(part(sim, 'until_ems', 'AED')).toBe('done');
    expect(row(sim, 'until_ems').result).toBe('partial');
  });

  it('with his pulse back and nobody having felt for it, he is taken as he is', () => {
    /** The page, with the first two shocks left waiting so that the code runs long. */
    const play = (callAt: number | null): Simulation => {
      const sim = start();
      const tick = (): void => {
        if (callAt !== null && sim.t >= callAt && sim.run.at('call_911') === null) {
          sim.act('call_911');
        }
        sim.tick(0.25);
      };
      const until = (done: () => boolean): void => {
        for (let i = 0; i < 4 * 900 && !sim.ending && !done(); i += 1) tick();
      };
      const wait = (seconds: number): void => {
        const from = sim.t;
        until(() => sim.t - from >= seconds);
      };
      const advised = (): boolean => sim.prompt?.id === 'shock';
      until(() => sim.phase === 'arrest');
      sim.act('cpr');
      sim.act('jaw_thrust');
      sim.act('bvm');
      sim.act('aed');
      until(advised);
      wait(110);
      sim.answer('shock');
      sim.act('cpr');
      until(advised);
      wait(110);
      sim.answer('shock');
      sim.act('cpr');
      epinephrine(sim);
      until(advised);
      sim.answer('shock');
      sim.act('cpr');
      amiodarone(sim);
      until(() => sim.phase === 'rosc');
      return sim;
    };
    // Played once with nobody called, to learn when his pulse comes back.
    const back = play(null).t;
    expect(back).toBeGreaterThan(480 + 6);

    // The same code, called so that they walk in five seconds after it does.
    const sim = play(back + 5 - 480);
    expect(sim.phase).toBe('rosc');
    expect(sim.t).toBe(back);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t).toBeCloseTo(back + 5, 0);
    expect(sim.endingKey).toBe('ems_pulse');
    expect(sim.ending?.text).toBe('He leaves with EMS. He has a pulse again.');
    // His pulse came back: the page's last step was never reached.
    expect(row(sim, 'until_ems').result).toBe('na');
    // The two shocks that were left waiting were not "when advised".
    expect(part(sim, 'shock', 'shock when advised')).toBe('missed');
  });
});

describe('"Shockable": the facts a debrief states', () => {
  it('a run that had CPR: when it started, when the first shock went in, and what was left of his chest and her pauses', () => {
    const sim = start();
    advance(sim, 6);
    expect(sim.phase).toBe('arrest');
    advance(sim, 14);
    openTheCode(sim);
    shock(sim, false);
    advance(sim, 20);
    sim.act('cpr');
    untilEnd(sim, 900);
    const facts = gradeRun(shockable, sim).facts;
    expect(facts.map((f) => f.label)).toEqual([
      'CPR started',
      'First shock',
      'Nobody on his chest, in all',
      'Pauses with both breaths',
    ]);
    expect(facts[0]?.value).toBe('0:20');
    expect(facts[1]?.value).toBe('0:29');
    // Fourteen seconds before she started, four for each look the AED took, and twenty after the first shock.
    const off = facts[2]!.value;
    expect(off).toMatch(/^\d:\d\d$/);
    const [m, s] = off.split(':').map(Number);
    expect(m! * 60 + s!).toBeGreaterThanOrEqual(14 + 4 + 20);
    expect(facts[3]?.value).toMatch(/^(\d+) of \1$/);
    for (const fact of facts) {
      expect(`${fact.label} ${fact.value}`).not.toMatch(/should|too |late|slow|good|poor|only/i);
    }
  });

  it('a run with no shock says so, and a run with no CPR states nothing', () => {
    const noShock = start();
    toArrest(noShock);
    noShock.act('call_911');
    noShock.act('cpr');
    untilEnd(noShock, 900);
    expect(gradeRun(shockable, noShock).facts[1]).toEqual({ label: 'First shock', value: 'None' });

    const noCpr = start();
    untilEnd(noCpr);
    expect(gradeRun(shockable, noCpr).facts).toEqual([]);
  });
});

describe('"Shockable": a practice run is coached through the page', () => {
  it('the assistant and the front desk offer each next thing, and only when coached', () => {
    const lines = (coached: boolean): string[] => {
      const sim = start({ coached, forgiving: true });
      toArrest(sim);
      advance(sim, 31);
      sim.act('call_911');
      sim.act('cpr');
      sim.act('jaw_thrust');
      sim.act('aed');
      advance(sim, 31);
      shock(sim);
      shock(sim);
      advance(sim, 9);
      shock(sim);
      advance(sim, 9);
      return sim.voices.map((v) => `${v.who}: ${v.line}`);
    };
    const coached = lines(true);
    const plain = lines(false);
    const hints = [
      'DA: Do you want me on his chest?',
      'Front desk: Do you want the AED?',
      'DA: Is anyone breathing for him?',
      'DA: That was the second shock. Do you want the epinephrine?',
      'DA: That was the third shock. Do you want the amiodarone?',
    ];
    for (const hint of hints) {
      expect(coached, hint).toContain(hint);
      expect(plain, hint).not.toContain(hint);
    }
  });
});

/** On to the end, putting her back on his chest after every shock the AED advises on the way. */
function untilEndRestarting(sim: Simulation): void {
  for (let i = 0; i < 4 * 900 && !sim.ending; i += 1) {
    if (sim.prompt?.id === 'shock') {
      sim.answer('shock');
      sim.act('cpr');
    }
    sim.tick(0.25);
  }
}
