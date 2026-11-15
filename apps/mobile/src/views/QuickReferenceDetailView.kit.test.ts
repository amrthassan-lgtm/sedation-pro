import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import type { InventoryItem } from '@/data/emergency-inventory';

/**
 * The Equipment card on a made-up cart: the real rows change whenever the
 * owner records a delivery, and these states must hold whatever is stocked.
 */
const cart: { rows: InventoryItem[] } = { rows: [] };
vi.mock('@/data/emergency-inventory', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/emergency-inventory')>();
  return {
    ...real,
    get EMERGENCY_INVENTORY() {
      return cart.rows;
    },
  };
});

const { default: QuickReferenceDetailView } = await import('./QuickReferenceDetailView.vue');

const lma = (id: string, item: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  drug: 'LarySeal Clear Laryngeal Mask Airway',
  description: `Size ${id}`,
  lot: 'L1',
  ndc: '',
  quantity: 1,
  expiresOn: '2029-09',
  category: 'equipment',
  protocolIds: ['lma'],
  ...item,
});

function mountWith(rows: InventoryItem[], id = 'lma') {
  cart.rows = rows;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(QuickReferenceDetailView, { props: { id }, global: { plugins: [router] } });
  vi.useRealTimers();
  return {
    w,
    open: () => w.find('.kit-head').attributes('aria-expanded') === 'true',
    summary: () => w.find('.kit-summary').text(),
    dot: () =>
      w
        .find('.kit-head .dot')
        .classes()
        .find((c) => c.startsWith('dot--')),
    pills: () => w.findAll('.kit-row .ui-status-pill').map((p) => p.text()),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the Equipment card', () => {
  it('is one quiet, closed row while everything is in date, and opens by hand', async () => {
    const k = mountWith([lma('3'), lma('4'), lma('5', { expiresOn: '', noExpiry: true })]);
    expect(k.open()).toBe(false);
    expect(k.summary()).toBe('All in date');
    expect(k.dot()).toBe('dot--good');
    expect(k.w.find('.kit-head .card-count').text()).toBe('3');
    await k.w.find('.kit-head').trigger('click');
    expect(k.open()).toBe(true);
    expect(k.w.findAll('.kit-row').length).toBe(3);
    expect(k.pills()).toEqual([]);
    k.w.unmount();
  });

  it('opens by itself and turns red when something has expired', () => {
    const k = mountWith([lma('3'), lma('4', { expiresOn: '2026-01' })]);
    expect(k.open()).toBe(true);
    expect(k.summary()).toBe('1 to check');
    expect(k.dot()).toBe('dot--danger');
    expect(k.pills()).toEqual(['Expired']);
    k.w.unmount();
  });

  it('opens in yellow when something is close to its date', () => {
    const k = mountWith([lma('3'), lma('4', { expiresOn: '2026-12' })]);
    expect(k.open()).toBe(true);
    expect(k.dot()).toBe('dot--warn');
    expect(k.pills()[0]).toMatch(/^\d+ d$/);
    k.w.unmount();
  });

  it('a date that does not read is a problem, as the Inventory counts it', () => {
    const k = mountWith([lma('3'), lma('4', { expiresOn: '2029-7' })]);
    expect(k.open()).toBe(true);
    expect(k.summary()).toBe('1 to check');
    expect(k.dot()).toBe('dot--danger');
    expect(k.pills()).toEqual(['No date']);
    k.w.unmount();
  });

  it('an item waiting for its photo is quiet: grey, closed, and counted as having no date', async () => {
    const k = mountWith([lma('3'), lma('4', { expiresOn: '', awaitingPhoto: true })]);
    expect(k.open()).toBe(false);
    expect(k.summary()).toBe('1 with no date');
    expect(k.dot()).toBe('dot--muted');
    await k.w.find('.kit-head').trigger('click');
    expect(k.pills()).toEqual(['No date']);
    k.w.unmount();
  });

  it('a list opened by hand does not stay open on the next protocol', async () => {
    const k = mountWith([lma('3'), lma('king', { protocolIds: ['king_lt'] })]);
    await k.w.find('.kit-head').trigger('click');
    expect(k.open()).toBe(true);
    await k.w.setProps({ id: 'king_lt' });
    expect(k.open()).toBe(false);
    k.w.unmount();
  });
});
