<script setup lang="ts">
interface Props {
  modelValue?: string;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'search' | 'url' | 'date' | 'password';
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url';
  disabled?: boolean;
  readonly?: boolean;
  /** Render at the wide variant — fills available width. */
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  type: 'text',
  inputmode: 'text',
  disabled: false,
  readonly: false,
  block: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    class="ui-input"
    :class="{ 'is-block': props.block }"
    :type="props.type"
    :inputmode="props.inputmode"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :readonly="props.readonly"
    :value="props.modelValue"
    @input="onInput"
  />
</template>

<style scoped>
.ui-input {
  -webkit-appearance: none;
  appearance: none;
  background-color: var(--color-input-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  padding: 13px 16px;
  font-size: 17px;
  min-height: 52px;
  width: 100%;
  box-sizing: border-box;
  transition:
    border-color var(--dur-150) var(--ease-standard),
    background-color var(--dur-150) var(--ease-standard);
}
.ui-input.is-block {
  width: 100%;
}
.ui-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  background-color: rgba(13, 21, 39, 0.95);
}
.ui-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-input[readonly] {
  cursor: default;
}
</style>
