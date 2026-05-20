<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ActionState, DrugTone } from '../types';

interface Props {
  tone: DrugTone;
  /** Top-line label — e.g. `"Versed"`. */
  name: string;
  /** Big middle line — e.g. `"1 mg"`. */
  dose: string;
  /** Footer hint — e.g. `"0.2 ml"`. */
  sub?: string | undefined;
  /** `idle | locked | logged` — same model as `UiButton`. */
  state?: ActionState;
  /** Time shown at the bottom of the button after the dose was logged. */
  loggedAt?: string | undefined;
  /** Disable interactions (e.g. diazepam locked because OSA not selected yet). */
  disabled?: boolean;
  /**
   * Compact size variant for the SedationDock. Same visual identity (accent
   * stripe + name/dose stack + cooldown ✓ check) at a tighter min-height —
   * the dock is "another version of the cockpit" at floating-sheet density.
   */
  compact?: boolean;
  /**
   * Internal anti-double-tap cooldown. Flashes the check overlay and blocks
   * repeat clicks for this duration after every successful tap. Independent
   * of `state` — the parent's state machine still drives logged vs idle.
   * Set to 0 to disable.
   */
  cooldownMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
  state: 'idle',
  sub: undefined,
  loggedAt: undefined,
  disabled: false,
  compact: false,
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

const renderState = computed<ActionState>(() => {
  if (props.state !== 'idle') return props.state;
  if (inCooldown.value) return 'locked';
  return 'idle';
});
</script>

<template>
  <button
    type="button"
    class="ui-drug-btn"
    :class="[
      `ui-drug-btn--${props.tone}`,
      `ui-drug-btn--${renderState}`,
      { 'is-disabled': props.disabled, 'is-compact': props.compact },
    ]"
    :disabled="props.disabled || renderState === 'locked'"
    @click="onClick"
  >
    <span class="ui-drug-btn-name">{{ props.name }}</span>
    <span class="ui-drug-btn-dose">{{ props.dose }}</span>
    <span v-if="props.sub" class="ui-drug-btn-sub">{{ props.sub }}</span>
    <span v-if="renderState === 'logged' && props.loggedAt" class="ui-drug-btn-last">
      {{ props.loggedAt }}
    </span>
    <span v-if="renderState === 'locked'" class="ui-drug-btn-overlay" aria-hidden="true">
      <span class="ui-drug-btn-check">✓</span>
    </span>
  </button>
</template>

<style scoped>
.ui-drug-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 72px;
  padding: 22px 10px 14px;
  flex: 1;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border);
  background-color: var(--color-surface);
  background-repeat: no-repeat;
  background-position: top center;
  background-size: 100% 10px;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  transition: background-color var(--dur-150) var(--ease-standard);
}
.ui-drug-btn:active:not(:disabled) {
  background-color: var(--color-surface-elevated);
}
.ui-drug-btn:disabled,
.ui-drug-btn.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Compact variant — used by the SedationDock so the dock buttons match the
   cockpit's UiDrugButton character (accent stripe + name/dose stack +
   cooldown ✓ check) at floating-sheet density. */
.ui-drug-btn.is-compact {
  min-height: 50px;
  padding: 12px 8px 8px;
  background-size: 100% 6px;
  gap: 1px;
}
.ui-drug-btn.is-compact .ui-drug-btn-dose {
  font-size: var(--type-body);
}
.ui-drug-btn-name {
  font-size: 9px;
  font-weight: var(--weight-bold);
  color: var(--color-text-tertiary);
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.ui-drug-btn-dose {
  font-size: var(--type-heading);
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: 0.2px;
  font-family: var(--font-mono);
}
.ui-drug-btn-sub {
  font-size: 9px;
  color: var(--color-text-disabled);
  font-family: var(--font-mono);
  letter-spacing: 0.3px;
  line-height: 1.2;
}
.ui-drug-btn-last {
  font-size: var(--type-footnote);
  font-family: var(--font-mono);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  color: var(--color-good);
  margin-top: 2px;
}

/* Tone — top accent stripe. */
.ui-drug-btn--versed {
  background-image: linear-gradient(var(--color-orange), var(--color-orange));
}
.ui-drug-btn--fentanyl {
  background-image: linear-gradient(var(--color-blue), var(--color-blue));
}
.ui-drug-btn--zofran {
  background-image: linear-gradient(var(--color-slate), var(--color-slate));
}
.ui-drug-btn--flumazenil {
  background-image: linear-gradient(var(--color-warn), var(--color-warn));
}
.ui-drug-btn--naloxone {
  background-image: linear-gradient(var(--color-danger), var(--color-danger));
}
.ui-drug-btn--oral {
  background-image: linear-gradient(var(--color-purple), var(--color-purple));
}
.ui-drug-btn--bedtime {
  background-image: linear-gradient(rgba(139, 92, 246, 0.6), rgba(139, 92, 246, 0.6));
}
.ui-drug-btn--lidocaine {
  background-image: linear-gradient(var(--color-red), var(--color-red));
}
.ui-drug-btn--septocaine-gold {
  background-image: linear-gradient(var(--color-gold), var(--color-gold));
}
.ui-drug-btn--septocaine-silver {
  background-image: linear-gradient(var(--color-slate), var(--color-slate));
}
.ui-drug-btn--marcaine {
  background-image: linear-gradient(var(--color-blue), var(--color-blue));
}
.ui-drug-btn--mepivacaine {
  background-image: linear-gradient(var(--color-tan), var(--color-tan));
}

/* Locked overlay — same animation as UiButton. */
.ui-drug-btn-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 21, 39, 0.72);
  backdrop-filter: blur(3px);
  border-radius: inherit;
  animation: ui-drug-fade-in var(--dur-150) var(--ease-decel);
}
.ui-drug-btn-check {
  font-size: 26px;
  font-weight: var(--weight-bold);
  color: #fff;
  animation: ui-drug-check-in var(--dur-250) var(--ease-spring);
}
@keyframes ui-drug-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes ui-drug-check-in {
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
  .ui-drug-btn-overlay,
  .ui-drug-btn-check {
    animation: none;
  }
}
</style>
