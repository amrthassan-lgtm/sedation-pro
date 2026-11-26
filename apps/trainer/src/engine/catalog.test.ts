import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORMULARY,
  EMERGENCY_PROTOCOLS,
  emergencySyringeTint,
} from '@sedation-pro/clinical';

import {
  CART_ACTIONS,
  CART_DEVICES,
  CART_VIALS,
  drawerSections,
  findVial,
  GROUP_LABELS,
  penControls,
  searchCart,
  spokenInstruction,
  vialForCallout,
  type ActionGroup,
} from './catalog';
import { formatMass, parseConcentrationMcgPerMl } from './dose';
import { resolveRef } from './grade';

const DRAWN_ROUTES = new Set(['IV', 'IM', 'IA']);

describe('the cart only offers what the protocols say', () => {
  it('every action and device points at protocol text that still exists', () => {
    for (const entry of [...CART_ACTIONS, ...CART_DEVICES]) {
      for (const ref of entry.from) {
        expect(resolveRef(ref), `${entry.id} → ${JSON.stringify(ref)}`).not.toBeNull();
      }
    }
  });

  it('every action is named in a phrase taken from a protocol step', () => {
    for (const action of CART_ACTIONS) {
      const label = action.label.toLowerCase();
      const quoted = action.from.some((ref) =>
        (resolveRef(ref)?.text ?? '').toLowerCase().includes(label),
      );
      expect(quoted, `"${action.label}" is not a phrase from its cited steps`).toBe(true);
    }
  });

  it('no cart label carries a dose, a rate or a number of anything', () => {
    for (const action of CART_ACTIONS) {
      const words = `${action.label} ${action.detail ?? ''}`
        .replace('100% O₂', '')
        .replace('911', '');
      expect(words, action.id).not.toMatch(/\d/);
    }
  });

  it('every action has at least one protocol behind it', () => {
    for (const action of CART_ACTIONS) {
      expect(action.from.length, action.id).toBeGreaterThan(0);
    }
  });

  it('every drawn-up drug in the protocols has a vial on the cart', () => {
    // D50W is a prefilled syringe: nothing is drawn, so it is not a vial.
    const PREFILLED = new Set(['D50W']);
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        const d = step.drug;
        if (!d || !DRAWN_ROUTES.has(d.route) || d.device !== undefined || PREFILLED.has(d.name)) {
          continue;
        }
        expect(vialForCallout(d.name), `${p.id}: ${d.name}`).toBeDefined();
      }
    }
  });

  it('a vial is as strong as the protocol says it is', () => {
    // Straight draws: the callout's concentration is the stock concentration.
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        const d = step.drug;
        if (!d || d.mixFirst !== undefined || d.device !== undefined) continue;
        const vial = vialForCallout(d.name);
        const stated = parseConcentrationMcgPerMl(d.concentration);
        if (!vial || stated === null) continue;
        expect(vial.mcgPerMl, `${p.id}: ${d.name}`).toBe(stated);
      }
    }
  });

  it('a mixed drug starts from the stock strength its recipe names', () => {
    let recipes = 0;
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        const d = step.drug;
        if (!d?.mixFirst) continue;
        const vial = vialForCallout(d.name);
        expect(vial, `${p.id}: ${d.name}`).toBeDefined();
        const stock = `${vial!.name.toLowerCase()} ${formatMass(vial!.mcgPerMl)}/ml`;
        expect(d.mixFirst.toLowerCase(), `${p.id}: ${d.name}`).toContain(stock);
        recipes += 1;
      }
    }
    expect(recipes).toBeGreaterThanOrEqual(4);
  });

  it('the auto-injectors deliver what is printed on them', () => {
    const adult = CART_DEVICES.find((d) => d.id === 'auviq_adult')!;
    expect(formatMass(adult.mcg)).toBe('300 mcg');
    expect(adult.label).toContain('0.3 mg');
    expect(adult.stock).toBe(1);
  });

  it('ids are unique across the whole cart', () => {
    const ids = [
      ...CART_ACTIONS.map((a) => a.id),
      ...CART_DEVICES.map((d) => d.id),
      ...CART_VIALS.map((v) => v.key),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the cart is laid out one way, in every room (owner, Nov 2026)', () => {
  const GROUPS = Object.keys(GROUP_LABELS) as ActionGroup[];
  const drawer = (group: ActionGroup) =>
    drawerSections(group).map((s) => [s.heading, s.actions.map((a) => a.label)]);

  it('each drawer reads in its own fixed order, under its headings', () => {
    expect(drawer('team')).toEqual([[null, ['Stop the procedure', 'Call 911']]]);
    expect(drawer('position')).toEqual([
      [null, ['Lie flat, legs up', 'Sit up', 'Turn to the side, head down']],
    ]);
    expect(drawer('airway')).toEqual([
      ['Open the airway', ['Jaw thrust', 'Suction', 'Pressure at the laryngospasm notch']],
      ['Airway devices', ['NPA', 'LMA', 'King']],
      [
        'Something in the throat',
        ['Encourage coughing', 'Back blows', 'Abdominal thrusts', 'Magill forceps', 'Finger sweep'],
      ],
    ]);
    expect(drawer('breathing')).toEqual([
      [null, ['N₂O off, 100% O₂', 'BVM', 'Tight mask seal', 'Stimulate']],
    ]);
    expect(drawer('circulation')).toEqual([
      [null, ['Check the pulse', 'CPR', 'AED', 'Saline bolus']],
    ]);
  });

  it('the cardiac arrest drill added five buttons and no more (owner, Nov 2026)', () => {
    expect(CART_ACTIONS).toHaveLength(24);
    const added = ['pulse_check', 'cpr', 'aed', 'lma', 'king'].map(
      (id) => CART_ACTIONS.find((a) => a.id === id)!,
    );
    expect(added.map((a) => [a.label, a.kind, a.kit])).toEqual([
      ['Check the pulse', 'instant', undefined],
      ['CPR', 'toggle', 'CPR board'],
      ['AED', 'toggle', 'Defibtech'],
      ['LMA', 'toggle', 'LarySeal'],
      ['King', 'toggle', 'King LTS-D'],
    ]);
    // Each is named in the arrest page's own words, or the BVM page's for the pulse.
    const arrest = EMERGENCY_PROTOCOLS.find((p) => p.id === 'vfib_vtach')!.steps.map((s) => s.text);
    for (const label of ['CPR', 'AED', 'LMA', 'King']) {
      expect(
        arrest.some((text) => text.includes(label)),
        label,
      ).toBe(true);
    }
    const bvm = EMERGENCY_PROTOCOLS.find((p) => p.id === 'bvm')!.steps.map((s) => s.text);
    expect(bvm.some((text) => text.startsWith('Check the pulse'))).toBe(true);
    // Nothing the page does not have a button for was slipped in beside them.
    const labels = CART_ACTIONS.map((a) => a.label.toLowerCase());
    for (const absent of ['oral airway', 'cricothyrotomy', 'head tilt', 'et tube']) {
      expect(
        labels.some((label) => label.includes(absent)),
        absent,
      ).toBe(false);
    }
  });

  it('one tube at a time: an LMA put in takes a King out, and the other way round', () => {
    const lma = CART_ACTIONS.find((a) => a.id === 'lma')!;
    const king = CART_ACTIONS.find((a) => a.id === 'king')!;
    expect(lma.excludes).toEqual(['king']);
    expect(king.excludes).toEqual(['lma']);
  });

  it('Encourage coughing is in the Airway drawer, with the rest of what is done for a throat', () => {
    const cough = CART_ACTIONS.find((a) => a.id === 'encourage_cough')!;
    expect(cough.group).toBe('airway');
    expect(cough.section).toBe('Something in the throat');
    expect(drawer('breathing').flat(2)).not.toContain('Encourage coughing');
    expect(searchCart('cough')[0]).toMatchObject({ kind: 'action', id: 'encourage_cough' });
  });

  it('every action is in one drawer, once, and no heading is split in two', () => {
    const laid = GROUPS.flatMap((g) => drawerSections(g).flatMap((s) => s.actions));
    expect(laid.map((a) => a.id).sort()).toEqual(CART_ACTIONS.map((a) => a.id).sort());
    for (const group of GROUPS) {
      const headings = drawerSections(group).map((s) => s.heading);
      expect(new Set(headings).size, group).toBe(headings.length);
    }
  });

  it('the list itself runs in the order of the drawers', () => {
    const order = CART_ACTIONS.map((a) => a.group).filter((g, i, all) => all[i - 1] !== g);
    expect(order).toEqual(['team', 'position', 'airway', 'breathing', 'circulation']);
  });

  it('the second line on a button is the practice’s own equipment, and nothing else has one', () => {
    const kits = Object.fromEntries(
      CART_ACTIONS.filter((a) => a.kit !== undefined).map((a) => [a.id, a.kit]),
    );
    expect(kits).toEqual({
      suction: 'Yankauer',
      npa: 'NasoSafe',
      lma: 'LarySeal',
      king: 'King LTS-D',
      o2: 'Porter flowmeter',
      bvm: 'Ambu bag',
      cpap: 'Ambu bag and mask',
      cpr: 'CPR board',
      aed: 'Defibtech',
      saline: 'NS bag',
    });
  });

  it('every brand is on the practice’s inventory, and no kit line carries a number of anything', () => {
    // Read as text: the trainer may not import from the clinical app.
    const inventory = readFileSync(
      resolve(process.cwd(), '../mobile/src/data/emergency-inventory.ts'),
      'utf8',
    );
    const brands = new Set<string>();
    for (const action of CART_ACTIONS) {
      if (action.kit === undefined) continue;
      expect(action.kit, action.id).not.toMatch(/\d/);
      const brand = action.kit.split(' ')[0]!;
      brands.add(brand);
      expect(inventory, `${action.id}: ${brand}`).toMatch(new RegExp(`\\b${brand}\\b`));
    }
    expect([...brands].sort()).toEqual([
      'Ambu',
      'CPR',
      'Defibtech',
      'King',
      'LarySeal',
      'NS',
      'NasoSafe',
      'Porter',
      'Yankauer',
    ]);
  });
});

describe('the call-out box', () => {
  const ids = (q: string) => searchCart(q).map((e) => e.id);

  it('finds an action by what the team says', () => {
    expect(ids('bag')[0]).toBe('bvm');
    expect(ids('jaw')[0]).toBe('jaw_thrust');
    expect(ids('nitrous off')[0]).toBe('o2');
    expect(ids('911')[0]).toBe('call_911');
    expect(ids('legs up')).toContain('pos_flat_legs_up');
  });

  it('finds the acts of an arrest by what the team says', () => {
    expect(ids('cpr')[0]).toBe('cpr');
    expect(ids('compressions')[0]).toBe('cpr');
    expect(ids('aed')[0]).toBe('aed');
    expect(ids('defib')[0]).toBe('aed');
    expect(ids('pads')[0]).toBe('aed');
    expect(ids('pulse')[0]).toBe('pulse_check');
    expect(ids('lma')[0]).toBe('lma');
    expect(ids('king')[0]).toBe('king');
    // The flush the arrest page writes after a push is the saline on the cart.
    expect(ids('flush')).toEqual(['saline']);
  });

  it('finds a drug by generic or brand name', () => {
    expect(ids('nal')[0]).toBe('naloxone');
    expect(ids('narcan')[0]).toBe('naloxone');
    expect(ids('sux')[0]).toBe('succinylcholine');
    expect(ids('benadryl')[0]).toBe('diphenhydramine');
  });

  it('"epi" offers the pens and the ampule, never ephedrine', () => {
    const hits = ids('epi');
    expect(hits).toContain('epinephrine');
    expect(hits).toContain('auviq_adult');
    expect(hits).not.toContain('ephedrine');
  });

  it('finds a hyphenated name typed as one word', () => {
    expect(ids('auviq')).toEqual(['auviq_adult']);
    expect(ids('auvi')).toEqual(['auviq_adult']);
    expect(ids('solumedrol')[0]).toBe('solumedrol');
    expect(ids('solu')[0]).toBe('solumedrol');
    expect(ids('autoinjector')).toContain('pen_peds');
  });

  it('names the pediatric pen as the cart does, not as an Auvi-Q', () => {
    const peds = CART_DEVICES.find((d) => d.id === 'pen_peds')!;
    expect(peds.label).not.toContain('Auvi');
    expect(formatMass(peds.mcg)).toBe('150 mcg');
  });

  it('returns nothing for nothing', () => {
    expect(searchCart('')).toEqual([]);
    expect(searchCart('   ')).toEqual([]);
    expect(searchCart('zzzz')).toEqual([]);
  });
});

describe('the cart is coloured like the clinical app', () => {
  const trayColours = new Set(DEFAULT_FORMULARY.iv.map((d) => d.color));

  it('every vial takes its colour from the formulary or from its family, for every callout it serves', () => {
    for (const v of CART_VIALS) {
      const family = v.callouts.map((name) => emergencySyringeTint(name));
      if (family.every((c) => c === undefined)) {
        expect(trayColours.has(v.tint), v.key).toBe(true);
        continue;
      }
      for (const c of family) expect(c, v.key).toBe(v.tint);
    }
  });

  it('the paralytic is red, atropine is green and the pressors are purple', () => {
    expect(findVial('succinylcholine')?.tint).toBe('var(--color-red)');
    expect(findVial('atropine')?.tint).toBe('var(--color-green)');
    for (const key of ['epinephrine', 'ephedrine', 'phenylephrine']) {
      expect(findVial(key)?.tint, key).toBe('var(--color-purple)');
    }
    for (const pen of CART_DEVICES.filter((d) => d.drugKey === 'epinephrine')) {
      expect(pen.tint, pen.id).toBe('var(--color-purple)');
    }
  });
});

describe('the pen that talks (owner, Nov 2026)', () => {
  it("the Auvi-Q says the protocol's own steps, read from its note", () => {
    expect(spokenInstruction('auviq_adult')).toBe(
      'Pull off the red guard, press firmly into the outer thigh, hold 2 seconds.',
    );
  });

  it('nothing else on the cart speaks', () => {
    expect(spokenInstruction('pen_peds')).toBeNull();
    expect(spokenInstruction('albuterol')).toBeNull();
    expect(spokenInstruction('no-such-device')).toBeNull();
  });

  it("the Auvi-Q's buttons and its hold are the note's own steps", () => {
    const notes = EMERGENCY_PROTOCOLS.find((p) => p.id === 'anaphylaxis')!.steps.find((s) =>
      s.text.includes('Auvi-Q 0.3 first'),
    )!.drug!.notes!;
    const pen = penControls('auviq_adult');
    expect(pen).toEqual({
      pull: 'Pull off the red guard',
      off: 'Red guard off',
      press: 'Press firmly into the outer thigh, hold 2 seconds',
      holdSeconds: 2,
    });
    expect(notes).toContain(pen.pull.toLowerCase());
    expect(notes).toContain(pen.press.toLowerCase());
  });

  it('the pediatric pen is in no protocol, so its sheet names no site, grip or count', () => {
    const pen = penControls('pen_peds');
    expect(pen.press).toBe('Press and hold to give');
    expect(`${pen.pull} ${pen.off} ${pen.press}`).not.toMatch(/thigh|firmly|second|red guard|\d/i);
  });
});
