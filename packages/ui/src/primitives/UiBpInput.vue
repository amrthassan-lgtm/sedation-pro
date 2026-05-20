<script setup lang="ts">
import type { BpValue } from '../primitive-types';

interface Props {
  modelValue: BpValue;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: BpValue): void;
}>();

function onSys(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  emit('update:modelValue', {
    sbp: raw === '' ? null : Number(raw),
    dbp: props.modelValue.dbp,
  });
}

function onDia(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  emit('update:modelValue', {
    sbp: props.modelValue.sbp,
    dbp: raw === '' ? null : Number(raw),
  });
}
</script>

<template>
  <div class="ui-bp" :class="{ 'is-disabled': props.disabled }">
    <input
      type="number"
      inputmode="numeric"
      class="ui-bp-input ui-bp-input--sys"
      placeholder="Sys"
      :disabled="props.disabled"
      :value="props.modelValue.sbp ?? ''"
      @input="onSys"
      aria-label="Systolic blood pressure"
    />
    <span class="ui-bp-sep" aria-hidden="true">/</span>
    <input
      type="number"
      inputmode="numeric"
      class="ui-bp-input ui-bp-input--dia"
      placeholder="Dia"
      :disabled="props.disabled"
      :value="props.modelValue.dbp ?? ''"
      @input="onDia"
      aria-label="Diastolic blood pressure"
    />
  </div>
</template>

<style scoped>
.ui-bp {
  display: inline-flex;
  align-items: stretch;
}
.ui-bp.is-disabled {
  opacity: 0.5;
}
.ui-bp-input {
  -webkit-appearance: none;
  appearance: none;
  background-color: var(--color-input-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: 13px 16px;
  font-size: 17px;
  min-height: 52px;
  width: 88px;
  box-sizing: border-box;
  text-align: center;
}
.ui-bp-input--sys {
  border-radius: var(--r-md) 0 0 var(--r-md);
  border-right: none;
}
.ui-bp-input--dia {
  border-radius: 0 var(--r-md) var(--r-md) 0;
  border-left: none;
}
.ui-bp-input:focus {
  outline: none;
  border-color: var(--color-accent-muted);
}
.ui-bp-sep {
  padding: 0 8px;
  font-size: 18px;
  color: var(--color-text-disabled);
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  border-left: none;
  border-right: none;
  min-height: 52px;
  display: flex;
  align-items: center;
}
</style>
