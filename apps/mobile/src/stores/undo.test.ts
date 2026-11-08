import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useEventLogStore } from './event-log';
import { useToastStore } from './toast';
import { useUndoStore } from './undo';

describe('undo store', () => {
  beforeEach(() => {
    // The chrono log persists to localStorage, so a fresh Pinia would
    // otherwise hydrate the previous test's rows.
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('stamp appends the chrono-log row and shows a toast that names its undo entry', () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    const toast = useToastStore();
    const entry = undo.stamp({
      event: 'IV Dose',
      details: { Drug: 'Midazolam (Versed)', Dose: '2.5 mg' },
      toast: { label: '✓ Versed 2.5 mg IV', tone: 'safe' },
    });
    expect(log.events.map((e) => e.id)).toEqual([entry.id]);
    expect(toast.current?.undoId).toBe(entry.id);
    expect(undo.nextLabel).toBe('✓ Versed 2.5 mg IV');
    expect(undo.isNext(entry.id)).toBe(true);
  });

  it('undo removes exactly the stamped row and runs the caller revert', () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    let reverted = 0;
    const a = undo.stamp({ event: 'A', toast: { label: 'A', tone: 'safe' } });
    const b = undo.stamp({
      event: 'B',
      toast: { label: 'B', tone: 'safe' },
      revert: () => {
        reverted += 1;
      },
    });
    expect(undo.undo()).toBe(true);
    expect(reverted).toBe(1);
    expect(log.events.map((e) => e.id)).toEqual([a.id]);
    expect(undo.isNext(b.id)).toBe(false);
    expect(undo.nextLabel).toBe('A');
  });

  it('undo with an id refuses when that id is not the newest action', () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    const older = undo.stamp({ event: 'Diazepam', toast: { label: 'D', tone: 'safe' } });
    undo.stamp({ event: 'Versed', toast: { label: 'V', tone: 'safe' } });
    expect(undo.undo(older.id)).toBe(false);
    expect(log.events).toHaveLength(2);
    expect(undo.count).toBe(2);
  });

  it('a plain toast (route gate, readiness refusal) carries no undo entry and cannot pop the stack', () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    const toast = useToastStore();
    undo.stamp({ event: 'Bedtime Premedication', toast: { label: 'Diazepam', tone: 'safe' } });
    toast.show({ id: 'gate-1', label: 'Complete Phase 1 first', tone: 'caution' });
    expect(toast.current?.undoId).toBeUndefined();
    // The toast component only calls undo(id) when the toast has an undoId,
    // and a foreign id is refused outright.
    expect(undo.undo('gate-1')).toBe(false);
    expect(log.events).toHaveLength(1);
  });

  it('undo with nothing stacked is a no-op', () => {
    const undo = useUndoStore();
    expect(undo.undo()).toBe(false);
    expect(undo.nextLabel).toBeNull();
  });
});
