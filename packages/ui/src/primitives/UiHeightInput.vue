<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  modelValue: number | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
}>();

const ft = computed<number | null>(() => {
  if (props.modelValue === null) return null;
  return Math.floor(props.modelValue / 12);
});

const inches = computed<number | null>(() => {
  if (props.modelValue === null) return null;
  return props.modelValue - Math.floor(props.modelValue / 12) * 12;
});

function combine(nextFt: number | null, nextIn: number | null): number | null {
  if (nextFt === null && nextIn === null) return null;
  return (nextFt ?? 0) * 12 + (nextIn ?? 0);
}

function onFt(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const parsed = raw === '' ? null : Number(raw);
  emit('update:modelValue', combine(parsed, inches.value));
}

function onIn(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const parsed = raw === '' ? null : Number(raw);
  emit('update:modelValue', combine(ft.value, parsed));
}
</script>

<template>
  <div class="ui-height" :class="{ 'is-disabled': props.disabled }">
    <input
      type="number"
      inputmode="numeric"
      min="0"
      max="9"
      class="ui-height-input ui-height-input--ft"
      placeholder="ft"
      :disabled="props.disabled"
      :value="ft ?? ''"
      @input="onFt"
      aria-label="Height feet"
    />
    <span class="ui-height-sep" aria-hidden="true">&prime;</span>
    <input
      type="number"
      inputmode="numeric"
      min="0"
      max="11"
      class="ui-height-input ui-height-input--in"
      placeholder="in"
      :disabled="props.disabled"
      :value="inches ?? ''"
      @input="onIn"
      aria-label="Height inches"
    />
    <span class="ui-height-suffix" aria-hidden="true">&Prime;</span>
  </div>
</template>

<style scoped>
.ui-height {
  display: inline-flex;
  align-items: stretch;
}
.ui-height.is-disabled {
  opacity: 0.5;
}
.ui-height-input {
  -webkit-appearance: none;
  appearance: none;
  background-color: var(--color-input-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: 13px 14px;
  font-size: 17px;
  min-height: 52px;
  width: 76px;
  box-sizing: border-box;
  text-align: center;
}
.ui-height-input--ft {
  border-radius: var(--r-md) 0 0 var(--r-md);
  border-right: none;
}
.ui-height-input--in {
  border-left: none;
  border-right: none;
}
.ui-height-input:focus {
  outline: none;
  border-color: var(--color-accent-muted);
}
.ui-height-sep,
.ui-height-suffix {
  padding: 0 6px;
  font-size: 18px;
  color: var(--color-text-tertiary);
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  min-height: 52px;
  display: flex;
  align-items: center;
}
.ui-height-sep {
  border-left: none;
  border-right: none;
}
.ui-height-suffix {
  border-left: none;
  border-radius: 0 var(--r-md) var(--r-md) 0;
}
</style>
