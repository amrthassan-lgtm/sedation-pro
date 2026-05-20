<script setup lang="ts">
import { useTemplateRef } from 'vue';

interface Props {
  modelValue?: string;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'search' | 'url' | 'date' | 'password';
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url';
  disabled?: boolean;
  readonly?: boolean;
  /** Render at the wide variant — fills available width. */
  block?: boolean;
  /** Optional leading glyph (emoji or single character) painted inside the
   *  input's left padding. Use for affordances like 🔍 on a search field. */
  leadingIcon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  type: 'text',
  inputmode: 'text',
  disabled: false,
  readonly: false,
  block: false,
  leadingIcon: '',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<template>
  <!-- No leading icon: render the bare input so flex parents lay it out
       identically to before this primitive grew the icon affordance. -->
  <input
    v-if="!props.leadingIcon"
    ref="inputRef"
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
  <span v-else class="ui-input-shell" :class="{ 'is-block': props.block }">
    <span class="ui-input-leading" aria-hidden="true">{{ props.leadingIcon }}</span>
    <input
      ref="inputRef"
      class="ui-input has-leading"
      :class="{ 'is-block': props.block }"
      :type="props.type"
      :inputmode="props.inputmode"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :readonly="props.readonly"
      :value="props.modelValue"
      @input="onInput"
    />
  </span>
</template>

<style scoped>
.ui-input-shell {
  position: relative;
  display: inline-block;
}
.ui-input-shell.is-block {
  display: block;
  width: 100%;
}
.ui-input-leading {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  line-height: 1;
  color: var(--color-text-tertiary);
  pointer-events: none;
  z-index: 1;
}
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
.ui-input.has-leading {
  padding-left: 44px;
}
.ui-input.is-block {
  width: 100%;
}
.ui-input:focus {
  outline: none;
  border-color: var(--color-accent);
  background-color: var(--color-input-bg);
  box-shadow: var(--focus-ring);
}
.ui-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-input[readonly] {
  cursor: default;
}
</style>
