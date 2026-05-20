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
  /* Layered background: faint top-edge highlight over the card body —
     gives a flat surface an iOS-polished curvature without any hue. */
  background: var(--surface-highlight), var(--color-card-bg);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  /* Two-layer shadow expresses depth instead of a border. */
  box-shadow: var(--shadow-md);
  transition:
    box-shadow var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard),
    opacity var(--dur-250) var(--ease-standard);
}

/* Neutral emphasis only — stronger lift, no hue, no layout shift. */
.ui-card.is-active {
  box-shadow: var(--shadow-lg);
}

button.ui-card {
  cursor: pointer;
}
button.ui-card:active {
  transform: scale(0.995);
}
</style>
