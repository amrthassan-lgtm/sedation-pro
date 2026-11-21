import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { GAS_OFF_EVENT, GAS_ON_EVENT, useGasSwitch } from './useGasSwitch';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useUndoStore } from '@/stores/undo';

const T0 = new Date('2026-11-21T10:00:00').getTime();
const MIN = 60_000;

function rows(): ReadonlyArray<{ event: string; details: Readonly<Record<string, string>> }> {
  return useEventLogStore().events.map((e) => ({ event: e.event, details: e.details }));
}

describe('useGasSwitch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the two lines steps 2 and 4 always wrote, word for word', () => {
    const gas = useGasSwitch();

    gas.turnOn();
    gas.turnOff();

    expect(rows()).toEqual([
      { event: 'N₂O/O₂ ON', details: { Route: 'Inhalation' } },
      {
        event: 'N₂O/O₂ OFF · O₂ 100% ON',
        details: { 'N₂O': 'Discontinued', 'O₂': '100% via nasal cannula' },
      },
    ]);
  });

  it('is one switch for the step cards and the dock: either flips what the other shows', () => {
    const card = useGasSwitch();
    const dock = useGasSwitch();

    card.turnOn();
    expect(dock.n2oOn.value).toBe(true);

    dock.turnOff();
    expect(card.n2oOn.value).toBe(false);
    expect(card.o2OnlyOn.value).toBe(true);
    expect(rows().map((r) => r.event)).toEqual([GAS_ON_EVENT, GAS_OFF_EVENT]);
  });

  it('flips again and again through a case, one row a flip', () => {
    const gas = useGasSwitch();

    gas.turnOn();
    gas.turnOff();
    gas.turnOn();
    gas.turnOff();

    expect(rows().map((r) => r.event)).toEqual([
      GAS_ON_EVENT,
      GAS_OFF_EVENT,
      GAS_ON_EVENT,
      GAS_OFF_EVENT,
    ]);
  });

  describe('a tap that changes nothing writes nothing', () => {
    it('the mix cannot be turned on twice', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      gas.turnOn();

      expect(rows()).toHaveLength(1);
      expect(useUndoStore().count).toBe(1);
    });

    it('there is nothing to turn off before the mix has been on', () => {
      const gas = useGasSwitch();
      expect(gas.canTurnOff.value).toBe(false);

      gas.turnOff();

      expect(rows()).toEqual([]);
      expect(gas.o2OnlyOn.value).toBe(false);
    });

    it('oxygen alone cannot be set twice', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      gas.turnOff();
      gas.turnOff();

      expect(rows()).toHaveLength(2);
    });
  });

  describe('Undo', () => {
    it('takes back the first flip: no row, no gas', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      useUndoStore().undo();

      expect(rows()).toEqual([]);
      expect(gas.n2oOn.value).toBe(false);
      expect(gas.o2OnlyOn.value).toBe(false);
    });

    it('puts the mix back on when the switch to oxygen is undone', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      gas.turnOff();
      useUndoStore().undo();

      expect(rows().map((r) => r.event)).toEqual([GAS_ON_EVENT]);
      expect(gas.n2oOn.value).toBe(true);
      expect(gas.o2OnlyOn.value).toBe(false);
    });

    it('puts oxygen back when a later return to the mix is undone', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      gas.turnOff();
      gas.turnOn();
      useUndoStore().undo();

      expect(rows().map((r) => r.event)).toEqual([GAS_ON_EVENT, GAS_OFF_EVENT]);
      expect(gas.n2oOn.value).toBe(false);
      expect(gas.o2OnlyOn.value).toBe(true);
    });

    it('walks back flip by flip, however many, to no gas at all', () => {
      const gas = useGasSwitch();
      const undo = useUndoStore();

      gas.turnOn();
      gas.turnOff();
      gas.turnOn();
      gas.turnOff();
      undo.undo();
      undo.undo();
      undo.undo();
      undo.undo();

      expect(rows()).toEqual([]);
      expect(gas.n2oOn.value).toBe(false);
      expect(gas.o2OnlyOn.value).toBe(false);
      expect(undo.canUndo).toBe(false);
    });

    it('undoes a dose given after a flip without touching the gas', () => {
      const gas = useGasSwitch();
      const iv = useIVStore();
      const undo = useUndoStore();

      gas.turnOn();
      const dose = iv.logDose({ drug: 'versed', mg: 1 });
      undo.stamp({
        event: 'IV Dose',
        details: { Drug: 'Midazolam (Versed)', Dose: '1 mg', Route: 'IV' },
        toast: { label: '✓ Versed 1 mg IV', tone: 'safe' },
        revert: () => iv.removeDoseById(dose.id),
      });
      undo.undo();

      expect(rows().map((r) => r.event)).toEqual([GAS_ON_EVENT]);
      expect(gas.n2oOn.value).toBe(true);
    });
  });

  describe('the time on the lit side', () => {
    it('is blank before any gas', () => {
      expect(useGasSwitch().runningSince.value).toBeNull();
    });

    it('is the time of the flip that set what is running', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      expect(gas.runningSince.value).toBe(T0);

      vi.setSystemTime(T0 + 12 * MIN);
      gas.turnOff();
      expect(gas.runningSince.value).toBe(T0 + 12 * MIN);
    });

    it('does not move while the gas runs on', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      vi.setSystemTime(T0 + 40 * MIN);

      expect(gas.runningSince.value).toBe(T0);
    });

    it('goes back to the earlier flip when the latest is undone', () => {
      const gas = useGasSwitch();

      gas.turnOn();
      vi.setSystemTime(T0 + 12 * MIN);
      gas.turnOff();
      vi.setSystemTime(T0 + 30 * MIN);
      gas.turnOn();
      vi.setSystemTime(T0 + 45 * MIN);
      gas.turnOff();
      expect(gas.runningSince.value).toBe(T0 + 45 * MIN);

      useUndoStore().undo();
      expect(gas.n2oOn.value).toBe(true);
      expect(gas.runningSince.value).toBe(T0 + 30 * MIN);

      useUndoStore().undo();
      expect(gas.o2OnlyOn.value).toBe(true);
      expect(gas.runningSince.value).toBe(T0 + 12 * MIN);
    });

    it('is the time written on the log row, to the millisecond', () => {
      const gas = useGasSwitch();

      vi.setSystemTime(T0 + 7 * MIN + 31_000);
      gas.turnOn();

      expect(gas.runningSince.value).toBe(useEventLogStore().events.at(-1)?.timestamp);
    });
  });
});
