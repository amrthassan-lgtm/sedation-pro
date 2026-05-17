<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useModeStore } from '@/stores/mode';

// Teaching prose wrapper. Renders its slot only in Training mode; in
// Clinical (the chairside default) it collapses to nothing so the expert
// sees only protocol/safety text. Single store read, no props — every
// COLLAPSE site is `<TrainingNote>…</TrainingNote>`, greppable in one pass.
const { training } = storeToRefs(useModeStore());
</script>

<template>
  <div v-if="training" class="training-note"><slot /></div>
</template>

<style scoped>
/* Quiet, teaching-only treatment: a soft accent rail + tertiary text so it
   reads as secondary to the always-on clinical copy beside it. */
.training-note {
  border-left: 3px solid var(--color-accent);
  background: var(--color-accent-soft);
  border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
  color: var(--color-text-tertiary);
  font-size: var(--type-footnote);
  line-height: 1.5;
}
</style>
