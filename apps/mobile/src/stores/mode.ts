import { ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * App mode — Clinical (default, lean cockpit) vs Training (shows
 * teaching/rationale prose wrapped in `<TrainingNote>`). Default is
 * Clinical for chairside safety: a clinician working a case under time
 * pressure shouldn't have to read past explanatory paragraphs, and an
 * un-onboarded new install should land in the lean state. Training is
 * opt-in via the nav drawer, persisted across reloads, and reset to
 * Clinical by `useCaseReset()` (lives under the `sedation-pro:` namespace).
 *
 * Kept on its own store (not folded into `session` or `audio`) so the
 * persistence key versions independently and the mode flag is greppable
 * from any view via `useModeStore()`.
 */
export const useModeStore = defineStore('mode', () => {
  const training = ref(false);

  persistRefs('sedation-pro:mode:v1', { training });

  function toggle(): void {
    training.value = !training.value;
  }

  return { training, toggle };
});
