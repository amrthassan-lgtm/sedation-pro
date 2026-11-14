import { describe, expect, it } from 'vitest';
import { EMERGENCY_PROTOCOLS } from '@sedation-pro/clinical';

import { CART_ACTIONS, CART_DEVICES, CART_VIALS, searchCart, vialForCallout } from './catalog';
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

describe('the call-out box', () => {
  const ids = (q: string) => searchCart(q).map((e) => e.id);

  it('finds an action by what the team says', () => {
    expect(ids('bag')[0]).toBe('bvm');
    expect(ids('jaw')[0]).toBe('jaw_thrust');
    expect(ids('nitrous off')[0]).toBe('o2');
    expect(ids('911')[0]).toBe('call_911');
    expect(ids('legs up')).toContain('pos_flat_legs_up');
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
