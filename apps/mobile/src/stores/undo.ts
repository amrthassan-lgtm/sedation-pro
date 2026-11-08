import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { BannerTone } from '@sedation-pro/ui';

import { useEventLogStore, type LogEvent } from './event-log';
import { useToastStore } from './toast';

/**
 * One pop-able action. Owns the snapshot of any state the action touched
 * (the event-log entry that was appended, drug totals, timers, etc.) and a
 * `revert()` that restores the prior values.
 *
 * Following the legacy app's pattern: the store captures the snapshot at
 * push-time, so undo never needs to re-derive anything.
 */
export interface UndoEntry {
  readonly id: string;
  readonly label: string;
  readonly sub?: string;
  readonly tone: BannerTone;
  /** Called on undo. The caller is responsible for restoring any extra state. */
  readonly revert: () => void;
}

const MAX_STACK = 25;

export const useUndoStore = defineStore('undo', () => {
  const stack = ref<UndoEntry[]>([]);
  const eventLog = useEventLogStore();
  const toast = useToastStore();

  const count = computed(() => stack.value.length);
  const canUndo = computed(() => stack.value.length > 0);
  /** What the next undo would revert — the sticky-bar button names it. */
  const nextLabel = computed<string | null>(
    () => stack.value[stack.value.length - 1]?.label ?? null,
  );

  /**
   * Record an event and its undo entry in one shot. Returns the log entry so
   * the caller can keep its id around if needed.
   */
  function stamp(
    options: Readonly<{
      event: string;
      details?: Record<string, string>;
      toast: { label: string; sub?: string; tone: BannerTone };
      /** Extra revert work — restoring drug totals, timer timestamps, etc. */
      revert?: () => void;
    }>,
  ): LogEvent {
    const entry = eventLog.append(options.event, options.details ?? {});

    const undoEntry: UndoEntry = {
      id: entry.id,
      label: options.toast.label,
      ...(options.toast.sub !== undefined && { sub: options.toast.sub }),
      tone: options.toast.tone,
      revert: () => {
        eventLog.removeById(entry.id);
        options.revert?.();
      },
    };

    stack.value.push(undoEntry);
    if (stack.value.length > MAX_STACK) {
      stack.value.shift();
    }

    toast.show({
      id: entry.id,
      label: options.toast.label,
      ...(options.toast.sub !== undefined && { sub: options.toast.sub }),
      tone: options.toast.tone,
      undoId: entry.id,
    });

    return entry;
  }

  /** True when `id` is the entry the next undo would revert. */
  function isNext(id: string): boolean {
    return stack.value[stack.value.length - 1]?.id === id;
  }

  /**
   * Revert the most recent action. With `expectedId`, revert only if that
   * is the action on top — a toast's Undo must never pop a different,
   * newer entry than the one it describes.
   */
  function undo(expectedId?: string): boolean {
    const last = stack.value[stack.value.length - 1];
    if (!last) return false;
    if (expectedId !== undefined && last.id !== expectedId) return false;
    stack.value.pop();
    last.revert();
    toast.dismiss();
    return true;
  }

  function clear() {
    stack.value = [];
    toast.dismiss();
  }

  return { stack, count, canUndo, nextLabel, isNext, stamp, undo, clear };
});
