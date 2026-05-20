<script setup lang="ts" generic="T extends string | number | boolean">
import { computed } from 'vue';
import type { ChipOption } from '../primitive-types';

interface Props {
  modelValue: T;
  options: ReadonlyArray<ChipOption<T>>;
  /**
   * When true, render the active chip's `caption` beneath the row. Lets
   * ASA-style "Roman numeral chip + descriptive subtitle" render without
   * making the chips themselves wider.
   */
  showCaption?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showCaption: false,
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();

function select(value: T): void {
  if (props.disabled) return;
  emit('update:modelValue', value);
}

const activeCaption = computed<string | undefined>(() => {
  const active = props.options.find((opt) => opt.value === props.modelValue);
  return active?.caption;
});
</script>

<template>
  <div class="ui-chip-group" :class="{ 'is-disabled': props.disabled }">
    <div class="ui-chip-row" role="radiogroup">
      <button
        v-for="opt in props.options"
        :key="String(opt.value)"
        type="button"
        class="ui-chip"
        :class="{ 'is-active': props.modelValue === opt.value }"
        :aria-pressed="props.modelValue === opt.value"
        :disabled="props.disabled || opt.disabled"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <p v-if="props.showCaption && activeCaption" class="ui-chip-caption">
      {{ activeCaption }}
    </p>
  </div>
</template>

<style scoped>
.ui-chip-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ui-chip {
  min-width: 44px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
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
    transform var(--dur-150) var(--ease-standard);
}
.ui-chip:active:not(:disabled) {
  transform: scale(0.96);
}
.ui-chip.is-active {
  background: var(--color-text-primary);
  border-color: var(--color-text-primary);
  color: var(--color-bg);
}
.ui-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-chip-group.is-disabled {
  opacity: 0.5;
}
.ui-chip-caption {
  margin: 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
  font-weight: var(--weight-regular);
}
</style>
