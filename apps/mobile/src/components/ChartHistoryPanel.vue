<script setup lang="ts">
import { computed } from 'vue';

import { UiBanner, UiButton, UiCard } from '@sedation-pro/ui';

import type { UsePullHistory } from '@/composables/usePullHistory';

/**
 * Review panel for history pulled from Open Dental.
 *
 * Deliberately a proposal, never a silent overwrite. Each row shows what the
 * chart says next to what the field currently holds, and the clinician
 * accepts per field. The chart is second-hand and goes stale; a sedation
 * assessment is the moment that gets discovered, so the confirmation step is
 * the point of the feature rather than friction around it.
 */
const props = defineProps<{ history: UsePullHistory }>();

const fetchedLabel = computed(() => {
  const at = props.history.fetchedAt.value;
  if (at === null) return '';
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
});

const anyChanges = computed(() => props.history.proposals.value.some((p) => p.changes));
</script>

<template>
  <UiCard v-if="history.status.value === 'ready' || history.status.value === 'error'" tint="ph1">
    <p class="heading">From the chart</p>

    <UiBanner v-if="history.status.value === 'error'" tone="caution" class="mt-2">
      Couldn't reach the chart — {{ history.error.value }}. Nothing has changed; fill the form as
      usual.
    </UiBanner>

    <template v-else>
      <p class="chart-provenance mt-1">
        Read from Open Dental at {{ fetchedLabel }}. Charts go stale — confirm each item with the
        patient before accepting it.
      </p>

      <UiBanner v-for="w in history.warnings.value" :key="w" tone="limit" class="mt-2">
        {{ w }}
      </UiBanner>

      <div class="chart-rows mt-2">
        <div v-for="p in history.proposals.value" :key="p.key" class="chart-row">
          <div class="chart-row-head">
            <span class="chart-field">{{ p.label }}</span>
            <span v-if="p.applied" class="chart-applied">✓ accepted</span>
            <UiButton v-else-if="p.changes" tone="primary" @click="history.accept(p.key)">
              Accept
            </UiButton>
            <span v-else class="chart-nochange">no change</span>
          </div>
          <p class="chart-val"><span class="chart-tag">Chart</span>{{ p.chartText }}</p>
          <p class="chart-val chart-current">
            <span class="chart-tag">Now</span>{{ p.currentText }}
          </p>
        </div>
      </div>

      <div class="chart-actions mt-2">
        <UiButton v-if="anyChanges" tone="neutral" @click="history.acceptAll()">
          Accept all
        </UiButton>
        <UiButton tone="neutral" @click="history.dismiss()">Close</UiButton>
      </div>
    </template>
  </UiCard>
</template>

<style scoped>
.chart-provenance {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.chart-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.chart-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--color-border, rgba(127, 127, 127, 0.2));
}
.chart-row:last-child {
  border-bottom: none;
}
.chart-row-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  justify-content: space-between;
}
.chart-field {
  font-weight: 600;
}
.chart-applied {
  font-size: var(--type-footnote);
  color: var(--color-safe, #047857);
}
.chart-nochange {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.chart-val {
  font-size: var(--type-footnote);
  display: flex;
  gap: var(--sp-2);
}
.chart-current {
  color: var(--color-text-secondary);
}
.chart-tag {
  flex: 0 0 3.2rem;
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  padding-top: 2px;
}
.chart-actions {
  display: flex;
  gap: var(--sp-2);
}
</style>
