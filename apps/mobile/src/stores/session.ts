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
  | 'notes'
  | 'note'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'phase4';

const SEDATION_PHASES: ReadonlyArray<Phase> = ['phase1', 'phase2', 'phase3', 'phase4'];

export type CasePhase = 'phase1' | 'phase2' | 'phase3' | 'phase4';

export const CASE_PHASE_ROUTE: Readonly<Record<CasePhase, string>> = {
  phase1: '/phase/1',
  phase2: '/phase/2',
  phase3: '/phase/3',
  phase4: '/phase/4',
};

export const CASE_PHASE_SHORT: Readonly<Record<CasePhase, string>> = {
  phase1: 'Assessment',
  phase2: 'Oral Sedation',
  phase3: 'IV Sedation',
  phase4: 'Recovery',
};

function isCasePhase(phase: Phase): phase is CasePhase {
  return (SEDATION_PHASES as ReadonlyArray<string>).includes(phase);
}

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
  /**
   * The case phase the clinician was last working in, kept while they are
   * on Quick Reference, the inventory or settings, so an emergency detour
   * has a one-tap way back.
   */
  const lastCasePhase = ref<CasePhase>('phase1');
  /** Scroll position per case phase, captured on the way out, restored on return. */
  const caseScroll = ref<Partial<Record<CasePhase, number>>>({});

  const isQuickRef = computed(() => currentPhase.value === 'quickref');
  const isSedationPhase = computed(() => SEDATION_PHASES.includes(currentPhase.value));

  function setPhase(phase: Phase) {
    currentPhase.value = phase;
    if (isCasePhase(phase)) lastCasePhase.value = phase;
  }

  function rememberScroll(phase: Phase, top: number) {
    if (isCasePhase(phase)) caseScroll.value = { ...caseScroll.value, [phase]: top };
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
  persistRefs('sedation-pro:session:v1', { currentPhase, lastCasePhase, caseScroll });

  return {
    currentPhase,
    lastCasePhase,
    caseScroll,
    rememberScroll,
    drawerOpen,
    isQuickRef,
    isSedationPhase,
    setPhase,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
});
