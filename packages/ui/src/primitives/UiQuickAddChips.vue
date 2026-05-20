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
  if (cur.toLowerCase().includes(term.toLowerCase())) return;
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
      :disabled="props.disabled"
      @click="add(term)"
    >
      + {{ term }}
    </button>
  </div>
</template>

<style scoped>
.ui-qa-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 var(--sp-2);
}
.ui-qa-chip {
  font-size: var(--type-caption);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.2px;
  padding: 5px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-qa-chip:active:not(:disabled) {
  transform: scale(0.96);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
.ui-qa-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
