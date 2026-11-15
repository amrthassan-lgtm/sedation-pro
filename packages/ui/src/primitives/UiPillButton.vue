<script setup lang="ts">
/**
 * The small inline action of the button family: a 44 px capsule, grey for
 * anything ordinary ("Go to LMA ›", "Unlock", "Clear search") and white for
 * the one main inline action. Screens used to draw this pill themselves; it
 * lives here so every one of them is the same pill.
 */
import type { PillButtonTone } from '../primitive-types';

interface Props {
  tone?: PillButtonTone;
  /** Full width of its container, for a pill that stands alone on a phone. */
  block?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'nav',
  block: false,
  disabled: false,
});

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();
</script>

<template>
  <button
    type="button"
    class="ui-pill-btn"
    :class="[`ui-pill-btn--${props.tone}`, { 'is-block': props.block }]"
    :disabled="props.disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.ui-pill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 var(--sp-4);
  border: 0;
  border-radius: var(--r-pill);
  font: inherit;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-pill-btn.is-block {
  width: 100%;
}
.ui-pill-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.ui-pill-btn--nav {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
.ui-pill-btn--nav:active:not(:disabled) {
  background: var(--color-surface-overlay);
}
.ui-pill-btn--key {
  background: var(--color-text-primary);
  color: var(--color-bg);
  font-weight: var(--weight-bold);
}
.ui-pill-btn--key:active:not(:disabled) {
  background: var(--color-text-secondary);
}
/* Disabled drops back to the grey family, as the picklist's actions do:
   never a faded white slab. */
.ui-pill-btn:disabled {
  cursor: not-allowed;
  background: var(--color-surface-elevated);
  color: var(--color-text-disabled);
  font-weight: var(--weight-semibold);
}
</style>
