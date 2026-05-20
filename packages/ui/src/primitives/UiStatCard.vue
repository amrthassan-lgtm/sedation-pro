<script setup lang="ts">
import type { Severity } from '../types';

interface Props {
  /** Section label — small caps, top of card. */
  label: string;
  /** Big number / value. Pass already-formatted (e.g. `'27.3'`, `'134/82'`). */
  value: string;
  /** Optional unit, rendered small after the value. */
  unit?: string | undefined;
  /** Optional category — rendered as a tinted pill in the top-right. */
  category?: string | undefined;
  /** Tints the card border and category pill. Defaults to `safe`. */
  severity?: Severity | 'empty';
  /** Optional short clinical detail rendered under the value. */
  detail?: string | undefined;
}

withDefaults(defineProps<Props>(), {
  unit: undefined,
  category: undefined,
  severity: 'safe',
  detail: undefined,
});
</script>

<template>
  <article class="ui-stat" :class="`ui-stat--${severity}`">
    <header class="ui-stat-header">
      <span class="ui-stat-label">{{ label }}</span>
      <span v-if="category" class="ui-stat-category">{{ category }}</span>
    </header>
    <p class="ui-stat-value">
      <span class="ui-stat-number">{{ value }}</span>
      <span v-if="unit" class="ui-stat-unit">{{ unit }}</span>
    </p>
    <p v-if="detail" class="ui-stat-detail">{{ detail }}</p>
  </article>
</template>

<style scoped>
.ui-stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 16px;
  border-radius: var(--r-lg);
  background: var(--surface-highlight), var(--color-surface);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard);
}
.ui-stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.ui-stat-label {
  font-size: 10px;
  font-weight: var(--weight-bold);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.ui-stat-category {
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: var(--r-pill);
  border: 1px solid currentColor;
  background: var(--color-surface);
}
.ui-stat-value {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1;
}
.ui-stat-number {
  font-size: 30px;
  font-weight: 700;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  color: var(--color-text-primary);
}
.ui-stat-unit {
  font-size: var(--type-footnote);
  font-weight: var(--weight-medium);
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
}
.ui-stat-detail {
  margin: 0;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

/* Severity is carried by a soft tinted card fill + the category pill —
   no border (containers don't carry borders any more). The category pill
   keeps its currentColor outline so it still reads as a chip on the tint. */
.ui-stat--safe {
  background: var(--surface-highlight), var(--color-good-soft);
}
.ui-stat--safe .ui-stat-category {
  color: var(--color-good);
  background: var(--color-good-soft);
}
.ui-stat--caution {
  background: var(--surface-highlight), var(--color-warn-soft);
}
.ui-stat--caution .ui-stat-category {
  color: var(--color-warn);
  background: var(--color-warn-soft);
}
.ui-stat--limit {
  background: var(--surface-highlight), var(--color-danger-soft);
}
.ui-stat--limit .ui-stat-category {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
.ui-stat--crisis {
  background: var(--surface-highlight), var(--color-crisis-soft);
}
.ui-stat--crisis .ui-stat-category {
  color: var(--color-crisis);
  background: rgba(239, 68, 68, 0.18);
}
.ui-stat--empty .ui-stat-number {
  color: var(--color-text-disabled);
}
.ui-stat--empty .ui-stat-detail {
  color: var(--color-text-disabled);
}
</style>
