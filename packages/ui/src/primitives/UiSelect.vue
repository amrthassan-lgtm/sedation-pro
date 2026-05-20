<script setup lang="ts">
import type { SelectOption } from '../primitive-types';

interface Props {
  modelValue?: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string | undefined;
  disabled?: boolean;
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: undefined,
  disabled: false,
  block: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement).value);
}
</script>

<template>
  <select
    class="ui-select"
    :class="{ 'is-block': props.block }"
    :disabled="props.disabled"
    :value="props.modelValue"
    @change="onChange"
  >
    <!-- Placeholder is a real, re-selectable option (emits '') so a
         mis-tapped value can be cleared back to the unselected state —
         important for clinical charting. Required-field gating, not a
         disabled option, is what enforces "must choose". -->
    <option v-if="props.placeholder" value="">{{ props.placeholder }}</option>
    <option
      v-for="option in props.options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>

<style scoped>
.ui-select {
  -webkit-appearance: none;
  appearance: none;
  background-color: var(--color-input-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  padding: 13px 40px 13px 16px;
  font-size: 17px;
  min-height: 52px;
  box-sizing: border-box;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.55)' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  transition: border-color var(--dur-150) var(--ease-standard);
}
.ui-select.is-block {
  width: 100%;
}
.ui-select:focus {
  outline: none;
  border-color: var(--color-accent);
}
.ui-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
