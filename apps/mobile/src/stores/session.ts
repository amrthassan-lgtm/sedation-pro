import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * Phase identity used throughout the shell. `quickref` is a sibling — not a
 * sedation phase — but it lives in the same enum so the sticky bar and nav
 * drawer can describe "where am I" with one prop.
 */
export type Phase =
  | 'quickref'
  | 'inventory'
  | 'settings'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'phase4';

const SEDATION_PHASES: ReadonlyArray<Phase> = ['phase1', 'phase2', 'phase3', 'phase4'];

/**
 * Session-level navigation state. Single source of truth for the sticky bar,
 * the nav drawer, and any code that needs to know "what's active right now."
 * The router is *also* a source of routing intent, but the store always
 * lags it by one tick — both surfaces should subscribe to this store, not
 * `useRoute()` directly, so they can't drift.
 */
export const useSessionStore = defineStore('session', () => {
  const currentPhase = ref<Phase>('phase1');
  const drawerOpen = ref(false);

  const isQuickRef = computed(() => currentPhase.value === 'quickref');
  const isSedationPhase = computed(() => SEDATION_PHASES.includes(currentPhase.value));

  function setPhase(phase: Phase) {
    currentPhase.value = phase;
  }

  function openDrawer() {
    drawerOpen.value = true;
  }

  function closeDrawer() {
    drawerOpen.value = false;
  }

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value;
  }

  // Persist the current phase so a reload lands the user back where they
  // were. Drawer state is deliberately *not* persisted — it should always
  // start closed on a fresh load.
  persistRefs('sedation-pro:session:v1', { currentPhase });

  return {
    currentPhase,
    drawerOpen,
    isQuickRef,
    isSedationPhase,
    setPhase,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
});
