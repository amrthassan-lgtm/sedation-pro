import { describe, expect, it } from 'vitest';

import {
  classifyInventory,
  equipmentFor,
  inventorySubLine,
  protocolCalloutNames,
  protocolCourseCoverage,
  protocolGapList,
  protocolStockStatus,
  protocolsUsing,
  summarizeInventory,
  useInventoryStatus,
} from './useInventoryStatus';
import { EMERGENCY_PROTOCOLS } from '@sedation-pro/clinical';

import {
  EMERGENCY_INVENTORY,
  PROTOCOL_COURSES,
  type InventoryItem,
} from '@/data/emergency-inventory';

const NOW = Date.UTC(2026, 7, 6); // 2026-08-06

function item(overrides: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    drug: overrides.id,
    description: '',
    lot: 'L1',
    ndc: '0000-0000-00',
    quantity: 1,
    expiresOn: '2028-01',
    ...overrides,
  };
}

describe('summarizeInventory', () => {
  it('buckets expired, blank-date, expiring, and safe items', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'expired', expiresOn: '2026-05' }),
      item({ id: 'blank', expiresOn: '' }),
      item({ id: 'soon', expiresOn: '2026-09' }),
      item({ id: 'fine', expiresOn: '2028-05' }),
    ]);
    const s = summarizeInventory(classified);
    expect(s.expired).toBe(2); // truly expired + unreadable both count
    expect(s.expiringSoon).toBe(1);
    expect(s.ok).toBe(1);
    expect(s.total).toBe(4);
  });

  it('picks the unknown-expiry item as soonest (least-trusted stock first)', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'expired', drug: 'Old drug', expiresOn: '2026-01' }),
      item({ id: 'blank', drug: 'Mystery vial', expiresOn: '' }),
    ]);
    expect(summarizeInventory(classified).soonest?.drug).toBe('Mystery vial');
  });

  it('reports null soonest when everything is safe', () => {
    const classified = classifyInventory(NOW, [item({ id: 'fine' })]);
    expect(summarizeInventory(classified).soonest).toBeNull();
  });

  it('counts on-order only among non-safe items', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'expired-handled', expiresOn: '2026-05', onOrder: { sku: 'X1' } }),
      item({ id: 'expired-ignored', expiresOn: '2026-04' }),
      item({ id: 'safe-on-order', expiresOn: '2028-05', onOrder: { sku: 'X2' } }),
    ]);
    const s = summarizeInventory(classified);
    expect(s.onOrder).toBe(1);
    expect(s.shipped).toBe(1);
    // A shipped replacement is not a purchasing decision: only the ignored one counts.
    expect(s.expired).toBe(1);
  });
});

describe('inventorySubLine', () => {
  it('phrases the three stock states', () => {
    const at = (expiresOn: string, id: string) => item({ id, expiresOn });
    const expired = summarizeInventory(
      classifyInventory(NOW, [at('2026-01', 'a'), at('2026-09', 'b')]),
    );
    expect(inventorySubLine(expired)).toBe('1 expired · 1 expiring soon');
    const shipped = summarizeInventory(
      classifyInventory(NOW, [item({ id: 's', expiresOn: '', onOrder: { sku: 'X' } })]),
    );
    expect(inventorySubLine(shipped)).toBe('1 on order');
    const soonOnly = summarizeInventory(classifyInventory(NOW, [at('2026-09', 'a')]));
    expect(inventorySubLine(soonOnly)).toBe('1 expiring soon');
    const clean = summarizeInventory(
      classifyInventory(NOW, [at('2028-01', 'a'), at('2028-02', 'b')]),
    );
    expect(inventorySubLine(clean)).toBe('2 items · all in date');
  });
});

describe('protocolStockStatus (best-of join)', () => {
  it('an in-date lot outranks an expired lot of the same drug', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'old-lot', expiresOn: '2026-05', protocolDrugNames: ['Naloxone'] }),
      item({ id: 'fresh-lot', expiresOn: '2028-03', protocolDrugNames: ['Naloxone'] }),
    ]);
    expect(protocolStockStatus('Naloxone', classified)).toBe('safe');
  });

  it('caution-only stock reports caution; blank-only reports limit', () => {
    const caution = classifyInventory(NOW, [
      item({ id: 'a', expiresOn: '2026-09', protocolDrugNames: ['Aspirin'] }),
    ]);
    expect(protocolStockStatus('Aspirin', caution)).toBe('caution');
    const blank = classifyInventory(NOW, [
      item({ id: 'b', expiresOn: '', protocolDrugNames: ['Succinylcholine'] }),
    ]);
    expect(protocolStockStatus('Succinylcholine', blank)).toBe('limit');
  });

  it('returns null for unmapped names — protocol screens render nothing', () => {
    const classified = classifyInventory(NOW, [item({ id: 'a' })]);
    expect(protocolStockStatus('Glucagon', classified)).toBeNull();
    expect(protocolStockStatus('Midazolam', classified)).toBeNull();
  });
});

describe('protocolsUsing (the "Used in" expansion)', () => {
  it('resolves brand-named stock to its protocol drug — Ventolin finds the Albuterol pages', () => {
    const ids = protocolsUsing(['Albuterol']).map((p) => p.id);
    expect(ids).toContain('bronchospasm');
    expect(ids).toContain('anaphylaxis');
  });

  it('a multi-mapped item collects every protocol across its names', () => {
    const ids = protocolsUsing(['Epinephrine', 'Push-dose Epinephrine']).map((p) => p.id);
    expect(ids).toContain('vfib_vtach');
    expect(ids).toContain('anaphylaxis');
    expect(ids).toContain('bradycardia'); // only via the push-dose name
  });

  it('gap-list names resolve too — Phenylephrine points at hypotension', () => {
    expect(protocolsUsing(['Phenylephrine']).map((p) => p.id)).toEqual(['hypotension']);
  });

  it('empty or unknown names produce an empty list', () => {
    expect(protocolsUsing([])).toEqual([]);
    expect(protocolsUsing(['Not A Drug'])).toEqual([]);
  });
});

describe('live inventory data invariants', () => {
  it('no infiltration lidocaine maps to any protocol name (wrong-vial guard)', () => {
    for (const inv of EMERGENCY_INVENTORY) {
      if (inv.description.includes('infiltration')) {
        expect(inv.protocolDrugNames, `${inv.id} must not map`).toBeUndefined();
      }
    }
    // Cardiac Lidocaine derives from exactly one item.
    const sources = EMERGENCY_INVENTORY.filter((i) =>
      i.protocolDrugNames?.includes('Cardiac Lidocaine'),
    );
    expect(sources.map((i) => i.id)).toEqual(['lidocaine-cardiac']);
  });

  it('equipment never maps to a protocol callout (pads are not drugs)', () => {
    for (const inv of EMERGENCY_INVENTORY) {
      if (inv.category === 'equipment') {
        expect(inv.protocolDrugNames, `${inv.id} must not map`).toBeUndefined();
      }
    }
  });

  it('only equipment links to protocols by id, and every id is a real protocol', () => {
    const ids = new Set(EMERGENCY_PROTOCOLS.map((p) => p.id));
    for (const inv of EMERGENCY_INVENTORY) {
      if (!inv.protocolIds) continue;
      expect(inv.category, `${inv.id} links a protocol but is not equipment`).toBe('equipment');
      for (const id of inv.protocolIds) {
        expect(ids.has(id), `${inv.id} links unknown protocol '${id}'`).toBe(true);
      }
    }
  });

  it('the airway rescue protocols each have their device in the kit', () => {
    const classified = classifyInventory(NOW);
    for (const id of ['npa', 'lma', 'king_lt']) {
      expect(equipmentFor(id, classified).length, `${id} has no linked equipment`).toBeGreaterThan(
        0,
      );
    }
    const lmaSizes = equipmentFor('lma', classified).map((c) => c.item.description);
    expect(lmaSizes.join(' ')).toMatch(/Size 3.*Size 4.*Size 5/);
  });

  it('a linked device lists its protocol under "Used in"', () => {
    const lma4 = EMERGENCY_INVENTORY.find((i) => i.id === 'lma-4');
    expect(lma4).toBeDefined();
    expect(
      useInventoryStatus(NOW)
        .usesFor(lma4!)
        .map((r) => r.id),
    ).toEqual(['lma']);
  });

  it('the protocol gap list is exactly the open purchasing decisions', () => {
    // Tripwire: a future protocol edit that adds a new drug callout (or a
    // mapping typo that orphans an existing one) fails here on purpose.
    // Glucagon left this list 2026-08: the owner decided not to stock it
    // (IV office — the hypoglycemia protocol's no-IV branch is now
    // "establish access for D50W"), so it is no longer a callout at all.
    // Solu-Medrol left this list 2026-11 when the owner ordered it, and
    // Phenylephrine when its first vial arrived (2026-11-12).
    expect(protocolGapList()).toEqual([]);
  });

  it('controlled substances are covered by sedation-cart stock, not an exemption', () => {
    const callouts = protocolCalloutNames();
    for (const name of ['Midazolam', 'Fentanyl']) {
      expect(callouts).toContain(name);
      expect(protocolGapList()).not.toContain(name);
      const sources = EMERGENCY_INVENTORY.filter((i) => i.protocolDrugNames?.includes(name));
      expect(sources.length, `${name} has a stocked row`).toBeGreaterThan(0);
      for (const src of sources) expect(src.category).toBe('sedation');
    }
    // Diazepam is no longer a callout at all — its seizure step was
    // demoted to a text aside (no IV diazepam stocked, owner 2026-08).
    expect(callouts).not.toContain('Diazepam');
  });

  it('every mapped protocol name exists among real protocol callouts (spelling tripwire)', () => {
    const callouts = new Set(protocolCalloutNames());
    for (const inv of EMERGENCY_INVENTORY) {
      for (const name of inv.protocolDrugNames ?? []) {
        expect(callouts.has(name), `${inv.id} maps unknown callout '${name}'`).toBe(true);
      }
    }
  });
});

describe('awaiting-photo rows', () => {
  it('are left out of every warning count and the tracked total', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'pending', expiresOn: '', awaitingPhoto: true }),
      item({ id: 'blank', expiresOn: '' }),
      item({ id: 'fine', expiresOn: '2028-05' }),
    ]);
    const s = summarizeInventory(classified);
    expect(s.expired).toBe(1); // only the un-flagged blank
    expect(s.total).toBe(2);
    expect(s.soonest?.drug).toBe('blank');
  });

  it('no-expiry rows are on hand but never a warning or part of the total', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'scale', expiresOn: '', noExpiry: true }),
      item({ id: 'fine', expiresOn: '2028-05' }),
    ]);
    const s = summarizeInventory(classified);
    expect(s.expired).toBe(0);
    expect(s.total).toBe(1);
  });

  it('in the live data carry no date and never satisfy a protocol callout', () => {
    for (const inv of EMERGENCY_INVENTORY) {
      if (!inv.awaitingPhoto && !inv.noExpiry) continue;
      expect(inv.awaitingPhoto && inv.noExpiry, `${inv.id} has both flags`).toBeFalsy();
      expect(inv.expiresOn, `${inv.id} has a date — drop awaitingPhoto`).toBe('');
      expect(inv.protocolDrugNames, `${inv.id} must not map`).toBeUndefined();
    }
  });
});

describe('protocolCourseCoverage', () => {
  const ATROPINE = [{ drug: 'Atropine', needMg: 3, basis: '', protocolPhrase: '' }];

  it('flags a single in-date 1 mg syringe as short of a 3 mg course', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'syringe', protocolDrugNames: ['Atropine'], mgPerUnit: 1, quantity: 1 }),
    ]);
    const [atropine] = protocolCourseCoverage(classified, ATROPINE);
    expect(atropine).toMatchObject({ haveMg: 1, needMg: 3, short: true });
  });

  it('counts quantity × mg across in-date lots, and nothing that is expired or undated', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'ok', protocolDrugNames: ['Atropine'], mgPerUnit: 1, quantity: 2 }),
      item({ id: 'soon', protocolDrugNames: ['Atropine'], mgPerUnit: 1, expiresOn: '2026-09' }),
      item({ id: 'old', protocolDrugNames: ['Atropine'], mgPerUnit: 1, expiresOn: '2026-05' }),
      item({ id: 'ordered', protocolDrugNames: ['Atropine'], mgPerUnit: 1, expiresOn: '' }),
    ]);
    const [atropine] = protocolCourseCoverage(classified, ATROPINE);
    expect(atropine).toMatchObject({ haveMg: 3, short: false });
  });

  it('reports on-order milligrams separately, never as usable stock', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'ok', protocolDrugNames: ['Adenosine'], mgPerUnit: 6, quantity: 1 }),
      item({
        id: 'ordered',
        protocolDrugNames: ['Adenosine'],
        mgPerUnit: 6,
        quantity: 2,
        expiresOn: '',
        onOrder: { sku: 'X' },
      }),
    ]);
    const [adenosine] = protocolCourseCoverage(classified, [
      { drug: 'Adenosine', needMg: 18, basis: '', protocolPhrase: '' },
    ]);
    expect(adenosine).toMatchObject({ haveMg: 6, onOrderMg: 12, short: true });
  });

  it('sums half-milligram vials without float dust', () => {
    const classified = classifyInventory(NOW, [
      item({ id: 'f', protocolDrugNames: ['Flumazenil'], mgPerUnit: 0.5, quantity: 2 }),
    ]);
    const [f] = protocolCourseCoverage(classified, [
      { drug: 'Flumazenil', needMg: 1, basis: '', protocolPhrase: '' },
    ]);
    expect(f).toMatchObject({ haveMg: 1, short: false });
  });
});

describe('live protocol-course data', () => {
  it("each course phrase appears in that drug's protocol callout (course tripwire)", () => {
    for (const course of PROTOCOL_COURSES) {
      const texts: string[] = [];
      for (const protocol of EMERGENCY_PROTOCOLS) {
        for (const step of protocol.steps) {
          if (step.drug?.name !== course.drug) continue;
          texts.push(step.text, step.drug.notes ?? '');
          for (const row of step.drug.drawTable ?? []) texts.push(row.label);
        }
      }
      expect(texts.length, `${course.drug} is a protocol callout`).toBeGreaterThan(0);
      expect(
        texts.some((t) => t.replace(/\s+/g, ' ').includes(course.protocolPhrase)),
        `${course.drug}: '${course.protocolPhrase}' not found in its protocol`,
      ).toBe(true);
    }
  });

  it('every row for a course drug carries mgPerUnit, so no lot is silently skipped', () => {
    const courseDrugs = new Set(PROTOCOL_COURSES.map((c) => c.drug));
    for (const inv of EMERGENCY_INVENTORY) {
      if (!inv.protocolDrugNames?.some((n) => courseDrugs.has(n))) continue;
      expect(inv.mgPerUnit, `${inv.id} needs mgPerUnit`).toBeGreaterThan(0);
    }
  });
});
