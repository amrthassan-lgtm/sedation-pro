import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { ORAL_PREMED_EVENT } from '@/composables/useEncounterReopen';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useRecoveryStore } from '@/stores/recovery';
import { OPEN_ROUTES, gateView, useSedationUnderway } from './useDeviceGate';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

const base = { isSetUp: true, locked: false, sedationUnderway: false, onOpenRoute: false };

describe('what covers the app', () => {
  it('nothing on a set-up tablet used within twelve hours', () => {
    expect(gateView(base)).toBeNull();
  });

  it('the PIN once twelve hours have passed', () => {
    expect(gateView({ ...base, locked: true })).toBe('lock');
  });

  it('setup on a tablet that was never set up', () => {
    expect(gateView({ ...base, isSetUp: false })).toBe('setup');
  });

  it('never setup in the middle of a sedation: the case is finished first', () => {
    expect(gateView({ ...base, isSetUp: false, sedationUnderway: true })).toBeNull();
  });

  it('never anything over the emergency protocols, locked or not set up', () => {
    expect(OPEN_ROUTES).toEqual(new Set(['quickref', 'quickref-detail']));
    expect(gateView({ ...base, locked: true, onOpenRoute: true })).toBeNull();
    expect(gateView({ ...base, isSetUp: false, onOpenRoute: true })).toBeNull();
  });
});

describe('a sedation is underway', () => {
  it('from the IV, an IV dose or the oral premed, until the patient is released', () => {
    const underway = useSedationUnderway();
    expect(underway.value).toBe(false);

    useIVStore().ivStarted = true;
    expect(underway.value).toBe(true);

    useRecoveryStore().releasedAt = Date.UTC(2026, 10, 16, 15, 0);
    expect(underway.value).toBe(false);
  });

  it('an oral premed alone counts', () => {
    const underway = useSedationUnderway();
    useEventLogStore().append(ORAL_PREMED_EVENT, {});
    expect(underway.value).toBe(true);
  });
});
