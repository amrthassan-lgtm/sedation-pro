import { describe, expect, it } from 'vitest';

import {
  classifyInventory,
  inventorySubLine,
  protocolCalloutNames,
  protocolGapList,
  protocolStockStatus,
  protocolsUsing,
  summarizeInventory,
} from './useInventoryStatus';
import { EMERGENCY_INVENTORY, type InventoryItem } from '@/data/emergency-inventory';

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
    expect(summarizeInventory(classified).onOrder).toBe(1);
  });
});

describe('inventorySubLine', () => {
  it('phrases the three stock states', () => {
    const at = (expiresOn: string, id: string) => item({ id, expiresOn });
    const expired = summarizeInventory(
      classifyInventory(NOW, [at('2026-01', 'a'), at('2026-09', 'b')]),
    );
    expect(inventorySubLine(expired)).toBe('1 expired · 1 expiring soon');
    const soonOnly = summarizeInventory(classifyInventory(NOW, [at('2026-09', 'a')]));
    expect(inventorySubLine(soonOnly)).toBe('1 expiring within 60 days');
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

  it('the protocol gap list is exactly the two open purchasing decisions', () => {
    // Tripwire: a future protocol edit that adds a new drug callout (or a
    // mapping typo that orphans an existing one) fails here on purpose.
    // Glucagon left this list 2026-08: the owner decided not to stock it
    // (IV office — the hypoglycemia protocol's no-IV branch is now
    // "establish access for D50W"), so it is no longer a callout at all.
    expect(protocolGapList()).toEqual(['Methylprednisolone (Solu-Medrol)', 'Phenylephrine']);
  });

  it('controlled substances appear as callouts but are excluded from the gap list', () => {
    const callouts = protocolCalloutNames();
    for (const name of ['Midazolam', 'Fentanyl']) {
      expect(callouts).toContain(name);
      expect(protocolGapList()).not.toContain(name);
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
