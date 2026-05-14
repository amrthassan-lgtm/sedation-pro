import { ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * Audio preferences. Currently a single flag — global mute for the Versed
 * and Fentanyl timer-ready chimes. Kept on its own store (not folded into
 * `session`) so the persistence key versions independently and so future
 * audio settings (per-tone toggles, volume) have a natural home.
 */
export const useAudioStore = defineStore('audio', () => {
  const muted = ref(false);

  persistRefs('sedation-pro:audio:v1', { muted });

  return { muted };
});
