import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * One row in the chronological medicolegal record. Every clinical action —
 * dose, vitals stamp, phase transition — appends one of these. The clinical
 * note is built by replaying the event log in order, so undo must restore
 * the log to a prior state.
 */
export interface LogEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly event: string;
  readonly details: Readonly<Record<string, string>>;
}

let eventCounter = 0;

function nextId(): string {
  eventCounter += 1;
  return `evt-${eventCounter}-${Date.now().toString(36)}`;
}

export const PHASE1_LOCK_EVENT = 'Phase 1 — Pre-Sedation Assessment';
export const PHASE1_AMENDMENT_EVENT = 'Phase 1 — Assessment amended';

export const useEventLogStore = defineStore('eventLog', () => {
  const events = ref<LogEvent[]>([]);

  const count = computed(() => events.value.length);
  const last = computed<LogEvent | undefined>(() => events.value[events.value.length - 1]);

  // First lock wins — re-mounts can't accidentally produce two lock events
  // even if a hydration race somehow slipped one through.
  const phase1LockEvent = computed<LogEvent | undefined>(() =>
    events.value.find((e) => e.event === PHASE1_LOCK_EVENT),
  );
  const phase1LockedAt = computed<number | null>(() => phase1LockEvent.value?.timestamp ?? null);

  function append(event: string, details: Record<string, string> = {}): LogEvent {
    const entry: LogEvent = {
      id: nextId(),
      timestamp: Date.now(),
      event,
      details,
    };
    events.value.push(entry);
    return entry;
  }

  /**
   * Remove a specific event by id. Returns `true` if removed. Used by undo
   * to ensure we drop the exact event the user reverted (not just "the last
   * one," which could have been overwritten by another action in flight).
   */
  function removeById(id: string): boolean {
    const idx = events.value.findIndex((entry) => entry.id === id);
    if (idx === -1) return false;
    events.value.splice(idx, 1);
    return true;
  }

  function clear() {
    events.value = [];
  }

  // The chrono log IS the medicolegal record — must survive page reloads.
  persistRefs('sedation-pro:event-log:v1', { events });

  return {
    events,
    count,
    last,
    phase1LockedAt,
    append,
    removeById,
    clear,
  };
});
