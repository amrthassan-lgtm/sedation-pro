import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { BannerTone } from '@sedation-pro/ui';

/**
 * One slide-in toast. The undo store fires these on every push; the
 * component just renders whatever the store says is current. We never
 * stack toasts — the legacy app shows one at a time so the operator's
 * attention isn't divided during a procedure.
 */
export interface UndoToastView {
  readonly id: string;
  readonly label: string;
  readonly sub?: string;
  readonly tone: BannerTone;
}

export const useToastStore = defineStore('toast', () => {
  const current = ref<UndoToastView | null>(null);
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function show(view: UndoToastView, autoDismissMs = 8000) {
    if (dismissTimer) clearTimeout(dismissTimer);
    current.value = view;
    dismissTimer = setTimeout(() => {
      if (current.value?.id === view.id) {
        current.value = null;
      }
      dismissTimer = null;
    }, autoDismissMs);
  }

  function dismiss() {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    current.value = null;
  }

  return { current, show, dismiss };
});
