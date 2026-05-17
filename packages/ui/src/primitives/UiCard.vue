<script setup lang="ts">
import type { PhaseTint } from '../types';

interface Props {
  /**
   * Retained for API compatibility; no longer paints. Phase identity now
   * lives in the app chrome (sticky bar + nav drawer), not on every card.
   * Kept as a consumed prop so existing `tint="phN"` call sites stay
   * valid and it isn't leaked to the DOM as a stray attribute.
   */
  tint?: PhaseTint | undefined;
  /** Subtle neutral emphasis — a stronger border, no colour wash. */
  active?: boolean;
  /** Completed cards retain full opacity; consumer chooses styling. */
  completed?: boolean;
  /** Render the card as a button-like clickable element. */
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tint: undefined,
  active: false,
  completed: false,
  interactive: false,
});

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <component
    :is="props.interactive ? 'button' : 'section'"
    :type="props.interactive ? 'button' : undefined"
    class="ui-card"
    :class="{ 'is-active': props.active, 'is-completed': props.completed }"
    @click="$emit('click')"
  >
    <slot />
  </component>
</template>

<style scoped>
.ui-card {
  display: block;
  width: 100%;
  text-align: inherit;
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  padding: var(--sp-5);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  transition:
    border-color var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard),
    opacity var(--dur-250) var(--ease-standard);
}

/* Neutral emphasis only — phase colour no longer lives on cards. */
.ui-card.is-active {
  border-color: var(--color-border-strong);
}

button.ui-card {
  cursor: pointer;
}
button.ui-card:active {
  transform: scale(0.995);
}
</style>
