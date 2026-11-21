<script setup lang="ts">
interface Props {
  /** Current textarea contents. Component reads + emits new value on chip tap. */
  modelValue: string;
  /** Quick-add terms. Tapping appends the term to `modelValue` (dedup-safe). */
  terms: ReadonlyArray<string>;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function isUsed(term: string): boolean {
  return props.modelValue.toLowerCase().includes(term.toLowerCase());
}

/**
 * Append `term` to the bound textarea. Skips if the term is already there
 * (case-insensitive substring) so double-tapping a chip doesn't produce
 * "NKDA; NKDA". First entry overwrites the empty default; subsequent ones
 * are joined with the same `; ` separator the rest of the chart uses for
 * inline lists.
 */
function add(term: string): void {
  if (props.disabled) return;
  const cur = props.modelValue.trim();
  if (isUsed(term)) return;
  const next = cur === '' ? term : `${cur}; ${term}`;
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="ui-qa-chips" :class="{ 'is-disabled': props.disabled }">
    <button
      v-for="term in props.terms"
      :key="term"
      type="button"
      class="ui-qa-chip"
      :class="{ 'is-used': isUsed(term) }"
      :aria-pressed="isUsed(term)"
      :disabled="props.disabled"
      @click="add(term)"
    >
      <span v-if="isUsed(term)" class="ui-qa-chip-tick" aria-hidden="true">✓</span>
      {{ term }}
    </button>
  </div>
</template>

<style scoped>
.ui-qa-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-2);
}
.ui-qa-chip {
  /* Same metrics as the Medical problems chips (UiChipMultiSelect) and the
     grey pill of the button family: 44 px, footnote type, no outline. */
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.2px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
/* A chip whose term is already in the box says so. It looked exactly like
   the Medical problems chips, which light up when chosen, yet gave no sign
   it had been used. It is marked, not filled white: a second tap does not
   take the word back out of text the clinician may have edited. */
.ui-qa-chip.is-used {
  background: var(--color-segment-active);
  gap: 6px;
}
.ui-qa-chip-tick {
  color: var(--color-good);
  font-weight: var(--weight-bold);
}
.ui-qa-chip:active:not(:disabled) {
  transform: scale(0.96);
  background: var(--color-surface-overlay);
}
.ui-qa-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
