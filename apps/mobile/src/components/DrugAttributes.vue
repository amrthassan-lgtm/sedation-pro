<script setup lang="ts">
import type { DrugAttribute } from '@sedation-pro/clinical';

// Renders a drug's selection attributes as fixed label/value slots instead
// of a prose paragraph. Same shape on every drug card in every phase, so a
// clinician pattern-matches the profile in under a second. The data lives
// in the formulary (per-practice), this only presents it.
defineProps<{ attributes: ReadonlyArray<DrugAttribute> }>();
</script>

<template>
  <dl class="drug-attrs">
    <div
      v-for="(attr, i) in attributes"
      :key="i"
      class="drug-attr"
      :class="attr.tone ? `drug-attr--${attr.tone}` : null"
    >
      <dt class="drug-attr-label">{{ attr.label }}</dt>
      <dd class="drug-attr-value">
        <span v-if="attr.tone" class="drug-attr-flag" aria-hidden="true">⚠</span>
        {{ attr.value }}
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.drug-attrs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: var(--sp-1) 0 0;
}
.drug-attr {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: var(--sp-2);
  align-items: baseline;
}
.drug-attr-label {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.drug-attr-value {
  margin: 0;
  font-size: var(--type-footnote);
  line-height: 1.45;
  color: var(--color-text-secondary);
}
.drug-attr-flag {
  margin-right: 2px;
}
.drug-attr--caution .drug-attr-value {
  color: var(--color-warn);
  font-weight: var(--weight-semibold);
}
.drug-attr--limit .drug-attr-value {
  color: var(--color-danger);
  font-weight: var(--weight-semibold);
}

@media (max-width: 420px) {
  .drug-attr {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
