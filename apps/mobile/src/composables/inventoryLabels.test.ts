import { describe, expect, it } from 'vitest';

import type { InventoryItem } from '@/data/emergency-inventory';
import { awaitingDate, courseLine, exceptionPill } from './inventoryLabels';
import { classifyInventory } from './useInventoryStatus';

const NOW = Date.UTC(2026, 10, 15);
const base: InventoryItem = {
  id: 'lma-5',
  drug: 'LarySeal Clear Laryngeal Mask Airway',
  description: 'Size 5',
  lot: 'L1',
  ndc: '',
  quantity: 1,
  expiresOn: '2029-09',
  category: 'equipment',
  protocolIds: ['lma'],
};
const one = (item: Partial<InventoryItem>) => classifyInventory(NOW, [{ ...base, ...item }])[0]!;

describe('the pill a screen shows by exception', () => {
  it('says nothing for an item plainly in date, or one that never expires', () => {
    expect(exceptionPill(one({}))).toBeNull();
    expect(exceptionPill(one({ expiresOn: '', noExpiry: true }))).toBeNull();
  });

  it('says how many days are left when the date is close, and Expired after it', () => {
    expect(exceptionPill(one({ expiresOn: '2026-12' }))).toMatchObject({ severity: 'caution' });
    expect(exceptionPill(one({ expiresOn: '2026-12' }))?.label).toMatch(/^\d+ d$/);
    expect(exceptionPill(one({ expiresOn: '2026-01' }))).toEqual({
      severity: 'limit',
      label: 'Expired',
    });
  });

  it('a date that does not read is a problem, as the Inventory counts it', () => {
    for (const expiresOn of ['', '2029-7', 'soon']) {
      expect(exceptionPill(one({ expiresOn })), expiresOn).toEqual({
        severity: 'limit',
        label: 'No date',
      });
    }
  });

  it('an item waiting for its photo is quiet: no date yet, and not a problem', () => {
    const c = one({ expiresOn: '', awaitingPhoto: true });
    expect(awaitingDate(c)).toBe(true);
    expect(exceptionPill(c)).toEqual({ severity: 'empty', label: 'No date' });
  });

  it('a replacement on its way says so, not Expired', () => {
    const c = one({ expiresOn: '', onOrder: { sku: 'X1' } });
    expect(exceptionPill(c)).toEqual({ severity: 'empty', label: 'On order' });
  });
});

describe('the one-course line', () => {
  it('reads the same as on the Inventory, with what is on order when there is some', () => {
    const course = {
      drug: 'Naloxone',
      basis: '',
      needMg: 2,
      haveMg: 1.6,
      onOrderMg: 0,
      short: true,
    };
    expect(courseLine(course)).toBe('Have 1.6 mg · need 2 mg');
    expect(courseLine({ ...course, onOrderMg: 0.4 })).toBe(
      'Have 1.6 mg · need 2 mg · 0.4 mg on order',
    );
  });
});
