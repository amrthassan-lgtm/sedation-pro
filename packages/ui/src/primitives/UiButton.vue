<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ActionState, ButtonTone } from '../types';

interface Props {
  tone?: ButtonTone;
  disabled?: boolean;
  /**
   * `idle` — default tappable state.
   * `locked` — cooldown active; shows a check overlay, blocks taps.
   * `logged` — action stamped; shows the logged timestamp on the right.
   *
   * The store / parent component drives this. The button never owns its own
   * timer — that keeps the single-source-of-truth contract for the app's
   * event log and undo stack.
   */
  state?: ActionState;
  /** Time string rendered on the right when `state === 'logged'`. */
  loggedAt?: string | undefined;
  /** Make the button render at full width (the common Phase 3 layout). */
  block?: boolean;
  /**
   * Internal anti-double-tap cooldown. Flashes the check overlay and blocks
   * repeat clicks for this duration after every successful tap. Independent
   * of `state` — the parent's state machine still drives logged vs idle.
   * Set to 0 to disable.
   */
  cooldownMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  disabled: false,
  state: 'idle',
  loggedAt: undefined,
  block: false,
  cooldownMs: 1200,
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const inCooldown = ref(false);

function onClick(e: MouseEvent) {
  if (props.disabled || props.state !== 'idle' || inCooldown.value) return;
  if (props.cooldownMs > 0) {
    inCooldown.value = true;
    setTimeout(() => {
      inCooldown.value = false;
    }, props.cooldownMs);
  }
  emit('click', e);
}

/** What the button looks like right now — parent's state takes priority. */
const renderState = computed<ActionState>(() => {
  if (props.state !== 'idle') return props.state;
  if (inCooldown.value) return 'locked';
  return 'idle';
});
</script>

<template>
  <button
    type="button"
    class="ui-btn"
    :class="[
      `ui-btn--${props.tone}`,
      `ui-btn--${renderState}`,
      { 'is-block': props.block, 'is-disabled': props.disabled },
    ]"
    :disabled="props.disabled || renderState === 'locked'"
    @click="onClick"
  >
    <span class="ui-btn-label"><slot /></span>
    <span v-if="renderState === 'locked'" class="ui-btn-overlay" aria-hidden="true">
      <span class="ui-btn-check">✓</span>
    </span>
    <span v-if="renderState === 'logged' && props.loggedAt" class="ui-btn-logged">
      {{ props.loggedAt }}
    </span>
  </button>
</template>

<style scoped>
.ui-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: 12px 22px;
  min-height: 48px;
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.2px;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border-strong);
  /* Faint top-edge highlight for the iOS-polished glass look. */
  background: var(--surface-highlight), var(--color-surface-elevated);
  color: var(--color-text-primary);
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    border-color var(--dur-150) var(--ease-standard),
    box-shadow var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-btn.is-block {
  width: 100%;
}
.ui-btn:active:not(:disabled) {
  transform: scale(0.98);
  background: var(--color-surface-overlay);
}
.ui-btn:disabled,
.ui-btn.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tones */
/* Primary CTA: same neutral surface as the default button, distinguished
   by font-weight only (bold vs semibold). Hierarchy comes from weight +
   copy, not a bright fill — the high-contrast white-on-navy pattern was
   too loud next to the muted chrome. */
.ui-btn--primary {
  font-weight: var(--weight-bold);
}
.ui-btn--danger {
  border-color: rgba(251, 113, 133, 0.4);
  background: var(--surface-highlight), var(--color-danger-soft);
  color: var(--color-danger);
}
.ui-btn--success {
  border-color: rgba(74, 222, 128, 0.35);
  background: var(--surface-highlight), var(--color-good-soft);
  color: var(--color-good);
}

/* Logged state — has timestamp pinned to the right edge. */
.ui-btn--logged {
  padding-right: 60px;
}
.ui-btn-logged {
  position: absolute;
  right: var(--sp-4);
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.3px;
  color: var(--color-good);
}
.ui-btn--danger.ui-btn--logged .ui-btn-logged {
  color: rgba(251, 113, 133, 0.55);
}

/* Locked overlay — check mark fades in. */
.ui-btn-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 21, 39, 0.72);
  backdrop-filter: blur(3px);
  border-radius: inherit;
  animation: ui-btn-fade-in var(--dur-150) var(--ease-decel);
}
.ui-btn-check {
  font-size: 26px;
  font-weight: var(--weight-bold);
  color: #fff;
  animation: ui-btn-check-in var(--dur-250) var(--ease-spring);
}
@keyframes ui-btn-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes ui-btn-check-in {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  55% {
    transform: scale(1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-btn-overlay,
  .ui-btn-check {
    animation: none;
  }
}
</style>
