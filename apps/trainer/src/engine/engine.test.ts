import { describe, expect, it } from 'vitest';

import { BAG_RATE, Simulation } from './engine';
import { gradeRun } from './grade';
import type { Drive, Scenario } from './types';

const STEADY: Drive = {
  spo2Rate: 0,
  hr: { to: 70, rate: 1 },
  sbp: { to: 120, rate: 1 },
  dbp: { to: 80, rate: 1 },
  rr: 14,
  etco2: { to: 38, rate: 1 },
  capno: 'normal',
  airway: 'open',
};

/** A scenario with no clinical content: it exists to exercise the engine's own rules. */
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'bench-test',
    title: 'Test',
    tagline: 'Engine test',
    protocols: ['laryngospasm'],
    floridaTopics: [],
    patient: { name: 'Nobody', summary: 'invented' },
    setup: [],
    startsAtMin: 600,
    initial: {
      phase: 'a',
      vitals: { hr: 70, spo2: 98, sbp: 120, dbp: 80, etco2: 38, rr: 14 },
      capno: 'normal',
      look: { color: 'pink', eyes: 'open' },
      scene: 'Start',
    },
    phases: {
      a: {
        drive: () => STEADY,
        transitions: [
          {
            when: (ctx) => ctx.phaseT >= 10 && !ctx.has('said'),
            to: 'stay',
            beat: { voice: { who: 'DA', line: 'Ten seconds.' }, flags: ['said'] },
          },
          {
            when: (ctx) => ctx.at('call_911') !== null,
            to: 'b',
            beat: {
              log: 'Help came',
              cut: { seconds: 300, title: 'Five minutes later', vitals: { spo2: 91, sbp: 100 } },
              prompt: {
                id: 'ask',
                voice: { who: 'EMS', line: 'Well?' },
                options: [
                  { id: 'yes', label: 'Yes' },
                  { id: 'no', label: 'No' },
                ],
              },
            },
          },
        ],
        nudges: [
          { after: 2, when: () => true, voice: { who: 'DA', line: 'Always.' } },
          { after: 2, when: () => true, voice: { who: 'DA', line: 'Coached.' }, coachedOnly: true },
        ],
      },
      b: {
        drive: (ctx) => ({
          ...STEADY,
          spo2Rate: -1,
          etco2: ctx.on('bvm') ? { to: 40, rate: 5 } : null,
          airway: ctx.on('cpap') ? 'closed' : 'open',
        }),
        transitions: [
          { when: (ctx) => ctx.answer('ask') === 'yes', to: 'end:good' },
          { when: (ctx) => ctx.vitals.spo2 < 60, to: 'end:bad' },
        ],
      },
    },
    reactions: {
      suction: () => ({ log: 'Suctioned', tone: 'good' }),
      'answer:ask': () => ({ log: 'Answered', counts: ['stop'] }),
      'draw:naloxone': () => ({ voice: { who: 'DA', line: 'Drawing.' } }),
    },
    endings: {
      good: { outcome: 'recovered', title: 'Good', text: '' },
      bad: { outcome: 'arrest', title: 'Bad', text: '' },
    },
    rubric: [
      {
        id: 'call',
        ref: { protocol: 'laryngospasm', step: 'Call 911' },
        tier: 'core',
        check: (run) => run.at('call_911') !== null,
        when: (run) => run.at('call_911'),
      },
    ],
    ...overrides,
  };
}

describe('the engine', () => {
  it('refuses a scenario that starts in a phase it does not have', () => {
    const bad = scenario();
    expect(() => new Simulation({ ...bad, initial: { ...bad.initial, phase: 'nope' } })).toThrow();
  });

  it('never skips a transition, however long the step', () => {
    const sim = new Simulation(scenario());
    sim.tick(30);
    expect(sim.voices.map((v) => v.line)).toContain('Ten seconds.');
  });

  it('plays a nudge once, and coaching nudges only when coached', () => {
    const plain = new Simulation(scenario());
    plain.tick(8);
    expect(plain.voices.map((v) => v.line)).toEqual(['Always.']);
    const coached = new Simulation(scenario(), { coached: true });
    coached.tick(8);
    expect(coached.voices.map((v) => v.line).sort()).toEqual(['Always.', 'Coached.']);
  });

  it('a time cut jumps the clock, resets the vitals it names and takes a fresh pressure', () => {
    const sim = new Simulation(scenario());
    sim.tick(4);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.cuts).toEqual([{ at: 4.25, seconds: 300, title: 'Five minutes later' }]);
    expect(sim.t).toBeCloseTo(304.25, 5);
    expect(sim.monitor.spo2).toBe(91);
    expect(sim.monitor.nibp).toEqual({ sbp: 100, dbp: 80, at: 304.25 });
    // What the beat logs is stamped after the jump, when the story resumes.
    expect(sim.log.at(-1)).toMatchObject({ text: 'Help came', t: 304.25 });
    expect(sim.run.entered('b')).toBeCloseTo(304.25, 5);
  });

  it('the minutes a time cut skips are not a gap between two of the player’s breaths', () => {
    const sim = new Simulation(scenario(), { pacedBag: true });
    sim.act('bvm');
    sim.squeeze(1);
    sim.tick(4);
    expect(sim.sinceBreath).toBe(5);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.sinceBreath).toBeNull();
    sim.squeeze(1);
    expect(sim.breaths.at(-1)).toMatchObject({ gap: null, onPace: true });
  });

  it('a prompt stays open until answered, and the answer reaches the scenario', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.prompt?.id).toBe('ask');
    expect(() => sim.answer('maybe')).toThrow();
    sim.answer('yes');
    expect(sim.prompt).toBeNull();
    expect(sim.run.answer('ask')).toBe('yes');
    expect(sim.run.at('stop')).not.toBeNull();
    sim.tick(0.25);
    expect(sim.ending?.title).toBe('Good');
  });

  it('stops for good once it has ended', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25);
    sim.answer('yes');
    sim.tick(0.25);
    const t = sim.t;
    sim.tick(60);
    sim.act('suction');
    expect(sim.t).toBe(t);
    expect(sim.run.at('suction')).toBeNull();
    expect(gradeRun(sim.scenario, sim).done).toBe(1);
  });

  it('positions exclude each other', () => {
    const sim = new Simulation(scenario());
    sim.act('pos_flat_legs_up');
    sim.act('pos_sit_up');
    expect(sim.isOn('pos_flat_legs_up')).toBe(false);
    expect(sim.isOn('pos_sit_up')).toBe(true);
  });

  it('a toggle tapped twice is off again, and remembered as having been on', () => {
    const sim = new Simulation(scenario());
    sim.act('jaw_thrust');
    sim.act('jaw_thrust');
    expect(sim.isOn('jaw_thrust')).toBe(false);
    expect(sim.run.onDuring('jaw_thrust', 'a')).toBe(true);
    expect(sim.run.count('jaw_thrust')).toBe(1);
  });

  it('a question is said out loud as well as shown, so a team with a drawer open hears it', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.prompt?.id).toBe('ask');
    expect(sim.voices.at(-1)).toEqual({ who: 'EMS', line: 'Well?' });
    expect(sim.lastVoiceAt).toBe(sim.t);
  });

  it('a beat can settle a question that is still open, and only the one it names', () => {
    const base = scenario();
    const sim = new Simulation({
      ...base,
      reactions: {
        ...base.reactions,
        suction: () => ({ settles: 'another' }),
        stop: () => ({ settles: 'ask' }),
      },
    });
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.prompt?.id).toBe('ask');
    sim.act('suction');
    expect(sim.prompt?.id).toBe('ask');
    sim.act('stop');
    expect(sim.prompt).toBeNull();
    // Taken down, not answered for anyone.
    expect(sim.run.answer('ask')).toBeNull();
  });

  it('marks the patient as bagged only while air is moving', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25);
    sim.act('bvm');
    sim.tick(1);
    expect(sim.monitor).toMatchObject({ bagged: true, capno: 'normal' });
    sim.act('cpap'); // this test scenario shuts the airway on cpap
    sim.tick(1);
    expect(sim.monitor.bagged).toBe(false);
  });

  it('the bag sets the rate for a patient breathing slower than it, never for one breathing faster', () => {
    const breathing = (rr: number): Scenario => {
      const base = scenario();
      return {
        ...base,
        phases: { ...base.phases, a: { transitions: [], drive: () => ({ ...STEADY, rr }) } },
      };
    };
    const slow = new Simulation(breathing(4));
    slow.tick(1);
    expect(slow.monitor.rr).toBe(4);
    slow.act('bvm');
    slow.tick(1);
    expect(slow.monitor).toMatchObject({ bagged: true, rr: BAG_RATE });

    const fast = new Simulation(breathing(24));
    fast.act('bvm');
    fast.tick(1);
    expect(fast.monitor).toMatchObject({ bagged: true, rr: 24 });
  });

  it('a toggle the story switches straight back off is not on, and was never held', () => {
    const base = scenario();
    const sim = new Simulation({
      ...base,
      reactions: {
        ...base.reactions,
        bvm: (_ctx, e) =>
          e.kind === 'action' && e.on ? { scene: 'Pushed away.', off: ['bvm'] } : undefined,
      },
    });
    sim.act('bvm');
    expect(sim.isOn('bvm')).toBe(false);
    expect(sim.run.onDuring('bvm', 'a')).toBe(false);
    expect(sim.run.count('bvm')).toBe(1);
    sim.tick(1);
    expect(sim.monitor.bagged).toBe(false);
  });

  it('raises the saturation alarm below 90 and the apnea alarm after 20 s with no waveform', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25); // spo2 91 after the cut, falling 1 a second, no waveform
    expect(sim.monitor.alarms).toEqual([]);
    sim.tick(3);
    expect(sim.monitor.alarms).toEqual(['spo2_low']);
    expect(sim.monitor.capno).toBe('flat');
    sim.tick(18);
    expect(sim.monitor.alarms).toEqual(['spo2_low', 'apnea']);
  });

  it('take-your-time mode holds the saturation above the arrest line', () => {
    const sim = new Simulation(scenario(), { forgiving: true });
    sim.act('call_911');
    sim.tick(200);
    expect(sim.ending).toBeNull();
    expect(sim.monitor.spo2).toBe(70);
  });

  it('the cuff takes time, and cycles by itself now and then', () => {
    const sim = new Simulation(
      scenario({
        phases: { a: { drive: () => ({ ...STEADY, sbp: { to: 90, rate: 5 } }), transitions: [] } },
      }),
    );
    sim.tick(10);
    expect(sim.monitor.nibp?.sbp).toBe(120);
    sim.cycleCuff();
    sim.tick(19);
    expect(sim.monitor.cuffCycling).toBe(true);
    sim.tick(2);
    expect(sim.monitor.nibp?.sbp).toBe(90);
    const at = sim.monitor.nibp!.at;
    sim.tick(400);
    expect(sim.monitor.nibp!.at).toBeGreaterThan(at);
  });

  it('a scenario can open with a pressure that is already old', () => {
    const base = scenario();
    const sim = new Simulation({ ...base, initial: { ...base.initial, nibpAgeSec: 180 } });
    expect(sim.monitor.nibp).toEqual({ sbp: 120, dbp: 80, at: -180 });
    // Due two minutes in (five minutes after that reading), then the cuff's own twenty seconds.
    sim.tick(119);
    expect(sim.monitor.cuffCycling).toBe(false);
    sim.tick(2);
    expect(sim.monitor.cuffCycling).toBe(true);
    sim.tick(20);
    expect(sim.monitor.nibp!.at).toBeGreaterThan(0);
  });

  it('an opening line counts as spoken, so it is captioned', () => {
    const base = scenario();
    const sim = new Simulation({
      ...base,
      initial: { ...base.initial, voice: { who: 'DA', line: 'Ready when you are.' } },
    });
    expect(sim.lastVoiceAt).toBe(0);
    expect(sim.voiceCount).toBe(1);
  });

  it('in take-your-time mode no arrest ending is taken, whatever the scenario measures', () => {
    const lethal = scenario({
      always: [{ when: (ctx) => ctx.vitals.sbp < 100, to: 'end:bad' }],
      phases: {
        a: { drive: () => ({ ...STEADY, sbp: { to: 60, rate: 5 } }), transitions: [] },
      },
    });
    const real = new Simulation(lethal);
    real.tick(30);
    expect(real.ending?.outcome).toBe('arrest');
    const practice = new Simulation(lethal, { forgiving: true });
    practice.tick(1_800);
    expect(practice.ending).toBeNull();
  });

  it('the alarm follows the number on the screen, not the fraction behind it', () => {
    const sim = new Simulation(
      scenario({
        phases: { a: { drive: () => ({ ...STEADY, spo2Rate: -0.1 }), transitions: [] } },
      }),
    );
    for (let i = 0; i < 400 && sim.monitor.spo2 >= 90; i += 1) {
      expect(sim.monitor.alarms).toEqual([]);
      sim.tick(0.25);
    }
    expect(sim.monitor.spo2).toBe(89);
    expect(sim.monitor.alarms).toEqual(['spo2_low']);
  });

  it('keeps counting spoken lines after the log of them is trimmed', () => {
    const sim = new Simulation(
      scenario({ reactions: { suction: () => ({ voice: { who: 'DA', line: 'Suction.' } }) } }),
    );
    for (let i = 0; i < 45; i += 1) sim.act('suction');
    expect(sim.voices).toHaveLength(40);
    expect(sim.voiceCount).toBe(45);
  });

  it('an apnea alarm that was sounding is still sounding after a time cut', () => {
    const sim = new Simulation(
      scenario({
        phases: {
          a: {
            drive: () => ({ ...STEADY, etco2: null }),
            transitions: [
              {
                when: (ctx) => ctx.phaseT >= 30 && !ctx.has('cut'),
                to: 'stay',
                beat: { flags: ['cut'], cut: { seconds: 60, title: 'A minute later' } },
              },
            ],
          },
        },
      }),
    );
    sim.tick(29);
    expect(sim.monitor.alarms).toContain('apnea');
    sim.tick(2);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.monitor.alarms).toContain('apnea');
  });

  it('a pen is one dose however many are asked for, and puffs stay within the inhaler', () => {
    const sim = new Simulation(scenario());
    sim.useDevice('auviq_adult', 3);
    expect(sim.run.given('epinephrine').map((d) => d.mcg)).toEqual([300]);
    sim.useDevice('albuterol', 100);
    sim.useDevice('albuterol', Number.NaN);
    expect(sim.run.given('albuterol').map((d) => d.mcg)).toEqual([720, 90]);
  });

  it('a single-use device runs out; an uncounted one does not', () => {
    const sim = new Simulation(scenario());
    expect(sim.useDevice('auviq_adult')).toBe(true);
    expect(sim.useDevice('auviq_adult')).toBe(false);
    expect(sim.remaining('albuterol')).toBeNull();
    expect(sim.useDevice('albuterol', 4)).toBe(true);
    expect(sim.run.given('albuterol')[0]?.mcg).toBe(360);
  });

  it('a syringe leaves the tray when it is empty and stays when it is not', () => {
    const sim = new Simulation(scenario());
    const id = sim.pickUpSyringe(3);
    sim.drawFromVial(id, 'naloxone', 2);
    expect(sim.voices.at(-1)?.line).toBe('Drawing.');
    sim.drawFromVial(id, 'naloxone', 0.5);
    expect(sim.voices.filter((v) => v.line === 'Drawing.')).toHaveLength(1);
    const dose = sim.give(id, 1, 'IV');
    expect(dose).toMatchObject({ ml: 1, mcg: 400, mcgPerMl: 400, syringeMl: 3, labeled: false });
    expect(sim.tray).toHaveLength(1);
    sim.give(id, 1.5, 'IV');
    expect(sim.tray).toHaveLength(0);
    expect(sim.give(id, 1, 'IV')).toBeNull();
  });

  it('rejects ids the cart does not have', () => {
    const sim = new Simulation(scenario());
    expect(() => sim.act('defibrillate')).toThrow();
    expect(() => sim.useDevice('epipen')).toThrow();
    expect(() => sim.drawFromVial(sim.pickUpSyringe(3), 'ketamine', 1)).toThrow();
  });

  it('records the saturation for the flight recorder, with a point at every cut', () => {
    const sim = new Simulation(scenario());
    sim.tick(10);
    sim.act('call_911');
    sim.tick(0.25);
    const history = sim.history;
    expect(history.length).toBeGreaterThanOrEqual(6);
    expect(history.at(-1)).toMatchObject({ spo2: 91 });
    expect(sim.lowestSpo2).toBe(91);
  });

  it('the recorder has a point at the lowest saturation and at the end', () => {
    const sim = new Simulation(scenario());
    sim.act('call_911');
    sim.tick(0.25);
    sim.tick(60); // falls a point a second to the arrest line
    expect(sim.ending?.outcome).toBe('arrest');
    const lowestDrawn = Math.min(...sim.history.map((p) => p.spo2));
    expect(lowestDrawn).toBe(Math.round(sim.lowestSpo2));
    expect(sim.history.at(-1)?.t).toBe(sim.t);
  });

  it('refuses to grade a run that has not ended', () => {
    const sim = new Simulation(scenario());
    expect(() => gradeRun(sim.scenario, sim)).toThrow();
  });
});
