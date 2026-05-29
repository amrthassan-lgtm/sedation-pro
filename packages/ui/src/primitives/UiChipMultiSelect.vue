<script setup lang="ts" generic="T extends string | number">
import type { ChipOption } from '../primitive-types';

interface Props {
  /** Currently-selected values. Chip with matching value lights up. */
  modelValue: ReadonlyArray<T>;
  options: ReadonlyArray<ChipOption<T>>;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T[]): void;
}>();

function toggle(value: T): void {
  if (props.disabled) return;
  const cur = props.modelValue;
  if (cur.includes(value)) {
    emit(
      'update:modelValue',
      cur.filter((v) => v !== value),
    );
  } else {
    emit('update:modelValue', [...cur, value]);
  }
}
</script>

<template>
  <div class="ui-chip-group" :class="{ 'is-disabled': props.disabled }">
    <div class="ui-chip-row" role="group">
      <button
        v-for="opt in props.options"
        :key="String(opt.value)"
        type="button"
        class="ui-chip"
        :class="{ 'is-active': props.modelValue.includes(opt.value) }"
        :aria-pressed="props.modelValue.includes(opt.value)"
        :disabled="props.disabled || opt.disabled"
        @click="toggle(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Visual identity matches UiChipGroup — same segmented-control track, same
   raised active segment — so the user perceives "selection chip" whether
   the group is single- or multi-select. Behaviour differs (toggle vs
   replace), which `aria-pressed` per chip surfaces semantically; here
   multiple segments can be raised at once. */
.ui-chip-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-pill);
}
.ui-chip {
  min-width: 44px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.2px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    border-color var(--dur-150) var(--ease-standard),
    box-shadow var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-chip:active:not(:disabled) {
  transform: scale(0.96);
}
.ui-chip.is-active {
  background: var(--color-segment-active);
  border-color: var(--color-border);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}
.ui-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-chip-group.is-disabled {
  opacity: 0.5;
}
</style>
