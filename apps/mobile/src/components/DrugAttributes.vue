<script setup lang="ts">
import type { DrugAttribute } from '@sedation-pro/clinical';

// Renders a drug's selection attributes as quiet label/value slots instead
// of a prose paragraph. Same shape on every drug card in every phase, so a
// clinician pattern-matches the profile at a glance. Deliberately
// monochrome — the label ("Caution") carries the meaning; colour would
// make a card-dense screen busy.
defineProps<{ attributes: ReadonlyArray<DrugAttribute> }>();
</script>

<template>
  <dl class="drug-attrs">
    <div v-for="(attr, i) in attributes" :key="i" class="drug-attr">
      <dt class="drug-attr-label">{{ attr.label }}</dt>
      <dd class="drug-attr-value">{{ attr.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.drug-attrs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--sp-1) 0 0;
}
.drug-attr {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: var(--sp-2);
  align-items: baseline;
}
.drug-attr-label {
  font-size: var(--type-caption);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.drug-attr-value {
  margin: 0;
  font-size: var(--type-footnote);
  line-height: 1.45;
  color: var(--color-text-secondary);
}

@media (max-width: 420px) {
  .drug-attr {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
