<script setup lang="ts">
import { computed, ref } from 'vue';
import { UiCard } from '@sedation-pro/ui';

import { fmtClock } from '@/composables/format';
import { useStepFold } from '@/composables/useStepFold';

/**
 * One numbered step of the IV sedation screen. Once it is finished it can
 * fold to a single line that keeps what was stamped and when; a tap opens it
 * again. See `useStepFold` for when it folds.
 */
const props = defineProps<{
  step: number;
  title: string;
  /** Unique among the steps on the screen. */
  foldKey: string;
  /** When the step was stamped, or null while it is still to do. */
  doneAt: number | null;
  /** The stamped facts, shown on the folded line. */
  summary?: string;
}>();

const el = ref<HTMLElement | null>(null);
const done = computed(() => props.doneAt !== null);
const { folded, open, fold } = useStepFold(props.foldKey, () => done.value, el);
const time = computed(() => fmtClock(props.doneAt) ?? '');
</script>

<template>
  <div ref="el" class="step-card">
    <UiCard tint="ph3" :class="{ 'is-folded': folded }">
      <button
        v-if="folded"
        type="button"
        class="step-fold"
        :aria-label="`Step ${props.step}, ${props.title}, done at ${time}. Open`"
        aria-expanded="false"
        @click="open"
      >
        <span class="heading step-fold-title">
          <span class="heading-step">{{ props.step }}</span> {{ props.title }}
        </span>
        <span class="step-fold-summary">{{ props.summary }}</span>
        <span class="step-fold-time">✓ {{ time }}</span>
        <svg class="step-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>
      <template v-else>
        <div class="step-head">
          <p class="heading">
            <span class="heading-step">{{ props.step }}</span> {{ props.title }}
          </p>
          <button
            v-if="done"
            type="button"
            class="step-fold-toggle"
            :aria-label="`Fold step ${props.step}, ${props.title}`"
            aria-expanded="true"
            @click="fold"
          >
            <svg class="step-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
              <path d="M1 7l5-5 5 5" />
            </svg>
          </button>
        </div>
        <slot />
      </template>
    </UiCard>
  </div>
</template>

<style scoped>
.step-card :deep(.ui-card.is-folded) {
  padding-top: 6px;
  padding-bottom: 6px;
}
.step-fold {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.step-fold-title {
  margin: 0;
  flex-shrink: 0;
  white-space: nowrap;
}
.step-fold-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.step-fold-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-good);
}
.step-chevron {
  flex-shrink: 0;
  fill: none;
  stroke: var(--color-text-tertiary);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Narrower than a tablet, the stamped facts take a line of their own under
   the title and wrap, instead of being cut short with an ellipsis (or, on a
   small phone, pushing the time off the edge). */
@media (max-width: 700px) {
  .step-fold {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    column-gap: var(--sp-3);
    row-gap: 2px;
    padding: 6px 0;
  }
  .step-fold-title {
    white-space: normal;
  }
  .step-fold-summary {
    grid-column: 1 / -1;
    grid-row: 2;
    overflow: visible;
    white-space: normal;
  }
}
.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: 0 0 var(--sp-3);
}
.step-head .heading {
  margin: 0;
}
.step-fold-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -12px -12px -12px 0;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.step-fold-toggle:active {
  background: var(--color-surface-elevated);
}
</style>
