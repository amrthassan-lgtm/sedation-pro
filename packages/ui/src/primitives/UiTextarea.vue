<script setup lang="ts">
interface Props {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  rows?: number;
  /** Render at the wide variant — fills available width. */
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  readonly: false,
  rows: 3,
  block: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    class="ui-textarea"
    :class="{ 'is-block': props.block }"
    :rows="props.rows"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :readonly="props.readonly"
    :value="props.modelValue"
    @input="onInput"
  />
</template>

<style scoped>
.ui-textarea {
  -webkit-appearance: none;
  appearance: none;
  background-color: #0d1527;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  padding: 13px 16px;
  font-size: 17px;
  font-family: inherit;
  line-height: 1.45;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 88px;
  transition:
    border-color var(--dur-150) var(--ease-standard),
    background-color var(--dur-150) var(--ease-standard);
}
.ui-textarea.is-block {
  width: 100%;
}
.ui-textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  background-color: rgba(13, 21, 39, 0.95);
}
.ui-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-textarea[readonly] {
  cursor: default;
}
</style>
