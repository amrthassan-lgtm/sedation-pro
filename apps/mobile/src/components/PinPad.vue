<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

import { PIN_LENGTH } from '@/stores/device';

/**
 * The phone-style keypad: four dots and round keys. Emergency sits where a
 * phone puts it, bottom left, and is never disabled.
 */
const props = defineProps<{
  modelValue: string;
  emergency?: boolean | undefined;
  disabled?: boolean | undefined;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  complete: [pin: string];
  emergency: [];
}>();

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const slots = Array.from({ length: PIN_LENGTH }, (_, i) => i);

function press(digit: string): void {
  if (props.disabled || props.modelValue.length >= PIN_LENGTH) return;
  const next = props.modelValue + digit;
  emit('update:modelValue', next);
  if (next.length === PIN_LENGTH) emit('complete', next);
}

function back(): void {
  if (props.disabled) return;
  emit('update:modelValue', props.modelValue.slice(0, -1));
}

// A keyboard works too, for a tablet with one attached.
function onKey(e: KeyboardEvent): void {
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') back();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="pin">
    <div class="pin-dots" aria-hidden="true">
      <span
        v-for="i in slots"
        :key="i"
        class="pin-dot"
        :class="{ 'is-on': i < modelValue.length }"
      />
    </div>
    <div class="pin-pad">
      <button
        v-for="d in DIGITS"
        :key="d"
        type="button"
        class="pin-key"
        :disabled="disabled"
        @click="press(d)"
      >
        {{ d }}
      </button>
      <button
        v-if="emergency"
        type="button"
        class="pin-key pin-key--word pin-key--emerg"
        @click="emit('emergency')"
      >
        Emergency
      </button>
      <span v-else />
      <button type="button" class="pin-key" :disabled="disabled" @click="press('0')">0</button>
      <button
        type="button"
        class="pin-key pin-key--word"
        :disabled="disabled || modelValue === ''"
        @click="back"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pin-dots {
  display: flex;
  gap: var(--sp-4);
  margin: var(--sp-5) 0 var(--sp-6);
}
.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: var(--r-pill);
  border: 1.5px solid var(--color-text-primary);
}
.pin-dot.is-on {
  background: var(--color-text-primary);
}
.pin-pad {
  display: grid;
  grid-template-columns: repeat(3, 80px);
  gap: var(--sp-4) var(--sp-6);
  justify-content: center;
}
.pin-key {
  width: 80px;
  height: 80px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-family: var(--font-system);
  font-size: 32px;
  font-weight: var(--weight-regular);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pin-key:active:not(:disabled) {
  background: var(--color-surface-overlay);
}
.pin-key:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}
.pin-key--word {
  background: transparent;
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
.pin-key--word:active:not(:disabled) {
  background: var(--color-surface);
}
.pin-key--emerg {
  color: var(--color-danger);
}
</style>
