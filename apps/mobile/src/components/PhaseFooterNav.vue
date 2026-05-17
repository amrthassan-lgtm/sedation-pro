<script setup lang="ts">
import { useRouter } from 'vue-router';

import { haptic } from '@/composables/useHaptics';
import type { PhaseTint } from '@sedation-pro/ui';

interface NavTarget {
  readonly label: string;
  readonly route: string;
  /**
   * Retained for API compatibility; no longer rendered. Phase identity
   * now lives in the sticky bar + nav drawer, so footer buttons stay
   * neutral and signal direction by weight + arrow, not colour.
   */
  readonly tint?: PhaseTint;
}

interface Props {
  back?: NavTarget | undefined;
  forward?: NavTarget | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  back: undefined,
  forward: undefined,
});

const router = useRouter();

function goBack() {
  if (!props.back) return;
  haptic('light');
  void router.push(props.back.route);
}

function goForward() {
  if (!props.forward) return;
  haptic('light');
  void router.push(props.forward.route);
}
</script>

<template>
  <nav class="phase-nav" aria-label="Phase navigation">
    <button
      v-if="props.back"
      type="button"
      class="phase-nav-btn phase-nav-btn--back"
      @click="goBack"
    >
      <span class="phase-nav-icon" aria-hidden="true">←</span>
      <span class="phase-nav-text">{{ props.back.label }}</span>
    </button>
    <span v-if="props.back && props.forward" class="phase-nav-spacer" aria-hidden="true" />
    <button
      v-if="props.forward"
      type="button"
      class="phase-nav-btn phase-nav-btn--forward"
      @click="goForward"
    >
      <span class="phase-nav-text">{{ props.forward.label }}</span>
      <span class="phase-nav-icon" aria-hidden="true">→</span>
    </button>
  </nav>
</template>

<style scoped>
.phase-nav {
  margin-top: var(--sp-4);
  display: flex;
  gap: var(--sp-2);
  align-items: stretch;
}
.phase-nav-spacer {
  flex: 1;
}
.phase-nav-btn {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 18px;
  border-radius: var(--r-md);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.2px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  min-height: 52px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    border-color var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.phase-nav-btn:active {
  transform: scale(0.98);
}
.phase-nav-btn--back:hover {
  background: var(--color-surface);
  color: var(--color-text-primary);
}
.phase-nav-icon {
  font-size: 18px;
  line-height: 1;
}
.phase-nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Neutral hierarchy — phase colour now lives only in the app chrome.
   Forward (the primary direction) reads stronger than back by weight +
   contrast, not hue. */
.phase-nav-btn--forward {
  color: var(--color-text-primary);
  font-weight: var(--weight-bold);
  border-color: var(--color-border-strong);
}
.phase-nav-btn--forward:hover {
  background: var(--color-surface-elevated);
}
</style>
