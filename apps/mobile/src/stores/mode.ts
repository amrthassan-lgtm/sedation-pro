import { ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * UI verbosity mode. A single global flag: Clinical (default) shows only
 * protocol / safety / dose / medicolegal text for an expert working a case
 * under time pressure; Training additionally reveals the teaching prose
 * (drug-selection rationale, pharmacology "why", workflow glance-maps).
 *
 * Defaults to Clinical deliberately — the chairside default must be the
 * lean, no-distraction screen; Training is an explicit opt-in for
 * onboarding and audits. Kept on its own store (not folded into `session`)
 * so the persistence key versions independently. Under the `sedation-pro:`
 * namespace so `useCaseReset()` wipes it on "Start new case", returning the
 * next patient to the safe Clinical default.
 */
export const useModeStore = defineStore('mode', () => {
  const training = ref(false);

  persistRefs('sedation-pro:mode:v1', { training });

  function toggle() {
    training.value = !training.value;
  }

  return { training, toggle };
});
