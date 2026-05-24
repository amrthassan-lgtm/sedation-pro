<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useModeStore } from '@/stores/mode';

/**
 * Wraps teaching / rationale prose that should only be visible in Training
 * mode (default off). Clinical mode hides the slot entirely — no DOM, no
 * spacing — so the cockpit reads lean for a clinician working under time
 * pressure. The quiet left-accent treatment makes it scannable as "this is
 * an explainer, not a protocol line" when it does appear.
 *
 * Safety / contraindication / dose-ceiling / monitoring sentences must NOT
 * be wrapped; those are KEEP-always per the trim plan.
 */
const { training } = storeToRefs(useModeStore());
</script>

<template>
  <div v-if="training" class="training-note">
    <slot />
  </div>
</template>

<style scoped>
.training-note {
  border-left: 3px solid var(--color-accent-soft);
  padding: 6px 10px;
  margin: 4px 0;
  color: var(--color-text-tertiary);
  background: var(--color-surface-subtle);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--type-footnote);
  line-height: 1.45;
}
</style>
