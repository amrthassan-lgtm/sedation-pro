<script setup lang="ts">
import type { PhaseTint } from '../types';

interface Props {
  /** Phase tint — applies the matching border-left color and background hint. */
  tint?: PhaseTint | undefined;
  /** Active card: full opacity, intensified border. Siblings dim via parent CSS. */
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
    :class="[
      props.tint ? `ui-card--${props.tint}` : null,
      { 'is-active': props.active, 'is-completed': props.completed },
    ]"
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
  border-left: 4px solid var(--color-surface-elevated);
  border-radius: var(--r-lg);
  padding: var(--sp-5);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  transition:
    border-color var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard),
    opacity var(--dur-250) var(--ease-standard);
}

.ui-card--ph1 {
  border-left-color: rgba(59, 130, 246, 0.25);
}
.ui-card--ph1.is-active {
  border-left-color: var(--ph1-color);
  background: var(--ph1-soft);
}

.ui-card--ph2 {
  border-left-color: rgba(139, 92, 246, 0.25);
}
.ui-card--ph2.is-active {
  border-left-color: var(--ph2-color);
  background: var(--ph2-soft);
}

.ui-card--ph3 {
  border-left-color: rgba(249, 115, 22, 0.25);
}
.ui-card--ph3.is-active {
  border-left-color: var(--ph3-color);
  background: var(--ph3-soft);
}

.ui-card--ph4 {
  border-left-color: rgba(74, 222, 128, 0.25);
}
.ui-card--ph4.is-active {
  border-left-color: var(--ph4-color);
  background: var(--ph4-soft);
}

button.ui-card {
  cursor: pointer;
}
button.ui-card:active {
  transform: scale(0.995);
}
</style>
