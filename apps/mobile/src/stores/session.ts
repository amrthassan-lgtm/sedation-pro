import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * Phase identity used throughout the shell. `quickref` is a sibling — not a
 * sedation phase — but it lives in the same enum so the sticky bar and nav
 * drawer can describe "where am I" with one prop.
 */
export type Phase = 'quickref' | 'phase1' | 'phase2' | 'phase3' | 'phase4';

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
  const currentStep = ref<number | null>(null);
  const lastStepPerPhase = ref<Record<Phase, number | null>>({
    quickref: null,
    phase1: null,
    phase2: null,
    phase3: null,
    phase4: null,
  });

  const drawerOpen = ref(false);

  const isQuickRef = computed(() => currentPhase.value === 'quickref');
  const isSedationPhase = computed(() => SEDATION_PHASES.includes(currentPhase.value));

  function setPhase(phase: Phase) {
    if (currentPhase.value !== phase) {
      // Remember where we were before leaving the previous phase.
      if (currentStep.value !== null) {
        lastStepPerPhase.value[currentPhase.value] = currentStep.value;
      }
      currentPhase.value = phase;
      currentStep.value = lastStepPerPhase.value[phase] ?? null;
    }
  }

  function setStep(step: number | null) {
    currentStep.value = step;
    if (step !== null) {
      lastStepPerPhase.value[currentPhase.value] = step;
    }
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

  return {
    currentPhase,
    currentStep,
    lastStepPerPhase,
    drawerOpen,
    isQuickRef,
    isSedationPhase,
    setPhase,
    setStep,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
});
