<script setup lang="ts">
interface Props {
  modelValue?: number | null;
  placeholder?: string;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | string | undefined;
  inputmode?: 'numeric' | 'decimal';
  disabled?: boolean;
  readonly?: boolean;
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  placeholder: '',
  min: undefined,
  max: undefined,
  step: undefined,
  inputmode: 'decimal',
  disabled: false,
  readonly: false,
  block: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
}>();

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  if (raw === '') {
    emit('update:modelValue', null);
    return;
  }
  const parsed = Number(raw);
  emit('update:modelValue', Number.isFinite(parsed) ? parsed : null);
}
</script>

<template>
  <input
    type="number"
    class="ui-number"
    :class="{ 'is-block': props.block }"
    :inputmode="props.inputmode"
    :placeholder="props.placeholder"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :disabled="props.disabled"
    :readonly="props.readonly"
    :value="props.modelValue ?? ''"
    @input="onInput"
  />
</template>

<style scoped>
.ui-number {
  -webkit-appearance: none;
  appearance: none;
  background-color: var(--color-input-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  padding: 13px 16px;
  font-size: 17px;
  min-height: 52px;
  box-sizing: border-box;
  transition: border-color var(--dur-150) var(--ease-standard);
}
.ui-number.is-block {
  width: 100%;
}
.ui-number:focus {
  outline: none;
  border-color: var(--color-accent-muted);
}
.ui-number:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-number[readonly] {
  cursor: default;
}
</style>
