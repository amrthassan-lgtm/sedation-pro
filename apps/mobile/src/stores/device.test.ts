import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { PRESERVED_KEYS } from '@/composables/useCaseReset';
import {
  DEVICE_KEY,
  PIN_IDLE_MS,
  PIN_TRIES,
  PIN_WAIT_MS,
  USE_GRAIN_MS,
  hashPin,
  useDeviceStore,
} from './device';

const T0 = Date.UTC(2026, 10, 16, 13, 0);

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('the tablet PIN', () => {
  it('is never stored as typed, and each setup salts it afresh', async () => {
    const device = useDeviceStore();
    await device.setPin('1234', T0);
    const first = device.pinHash;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(localStorage)).not.toContain('1234');
    await device.setPin('1234', T0);
    expect(device.pinHash).not.toBe(first);
    expect(await hashPin(device.pinSalt, '1234')).toBe(device.pinHash);
  });

  it('a tablet that was never set up is not locked: setup comes first', () => {
    const device = useDeviceStore();
    expect(device.isSetUp).toBe(false);
    expect(device.isLocked(T0)).toBe(false);
  });

  it('asks again only after twelve hours without use (owner, Nov 2026)', async () => {
    const device = useDeviceStore();
    await device.setPin('2468', T0);
    expect(device.isLocked(T0 + PIN_IDLE_MS - 1)).toBe(false);
    expect(device.isLocked(T0 + PIN_IDLE_MS)).toBe(true);
  });

  it('using the app pushes the twelve hours back, at most once a minute', async () => {
    const device = useDeviceStore();
    await device.setPin('2468', T0);
    device.noteUse(T0 + USE_GRAIN_MS - 1);
    expect(device.lastUsedAt).toBe(T0);
    device.noteUse(T0 + 10 * 60 * 60 * 1000);
    expect(device.isLocked(T0 + PIN_IDLE_MS + 60 * 60 * 1000)).toBe(false);
  });

  it('a tap after the twelve hours does not unlock it: only the PIN does', async () => {
    const device = useDeviceStore();
    await device.setPin('2468', T0);
    const late = T0 + PIN_IDLE_MS + 1;
    device.noteUse(late);
    expect(device.isLocked(late)).toBe(true);
    expect(await device.unlock('2468', late)).toBe('ok');
    expect(device.isLocked(late)).toBe(false);
  });

  it(`after ${PIN_TRIES} wrong tries the keypad waits a minute, then accepts the right PIN`, async () => {
    const device = useDeviceStore();
    await device.setPin('2468', T0);
    const at = T0 + PIN_IDLE_MS;
    for (let i = 1; i < PIN_TRIES; i++) expect(await device.unlock('0000', at)).toBe('wrong');
    expect(await device.unlock('0000', at)).toBe('wait');
    expect(await device.unlock('2468', at + PIN_WAIT_MS - 1)).toBe('wait');
    expect(await device.unlock('2468', at + PIN_WAIT_MS)).toBe('ok');
  });

  it('survives Start new case, which keeps per-tablet keys', async () => {
    expect(PRESERVED_KEYS.has(DEVICE_KEY)).toBe(true);
    const device = useDeviceStore();
    await device.setPin('1357', T0);
    await Promise.resolve();
    setActivePinia(createPinia());
    const reloaded = useDeviceStore();
    expect(reloaded.isSetUp).toBe(true);
    expect(await reloaded.checkPin('1357')).toBe(true);
  });
});
