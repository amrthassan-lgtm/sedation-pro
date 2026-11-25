<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { findDevice, penControls, spokenInstruction } from '@/engine/catalog';
import type { Run } from '@/composables/useRun';

import BottomSheet from './BottomSheet.vue';
import VitalsStrip from './VitalsStrip.vue';

/**
 * Things that are given without drawing anything up: an auto-injector is
 * unguarded and held against the thigh; the inhaler is counted in puffs.
 */
const props = defineProps<{ run: Run; deviceId: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const device = computed(() => findDevice(props.deviceId));
const isPen = computed(() => device.value?.route === 'IM');

/** Only the Auvi-Q's own steps are in the protocol. Another pen gets no technique from the trainer. */
const pen = computed(() => penControls(props.deviceId));

/**
 * The adult Auvi-Q talks the moment it leaves its case, as the real one does
 * (owner, Nov 2026). Written here too, for a room with the sound off.
 */
const instruction = computed(() => spokenInstruction(props.deviceId));
onMounted(() => {
  if (instruction.value) props.run.speak({ who: 'Pen', line: instruction.value });
});

const guardOff = ref(false);
const held = ref(0);
const puffs = ref(1);
let raf = 0;
let since = 0;

function press(): void {
  if (!guardOff.value) return;
  since = performance.now();
  const step = (now: number): void => {
    held.value = Math.min(1, (now - since) / (pen.value.holdSeconds * 1000));
    if (held.value >= 1) {
      try {
        navigator.vibrate?.(120);
      } catch {
        // No motor.
      }
      props.run.useDevice(props.deviceId);
      emit('close');
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function release(): void {
  cancelAnimationFrame(raf);
  held.value = 0;
}

/** A held key repeats: only the first keydown starts the hold. */
function keyPress(e: KeyboardEvent): void {
  if (!e.repeat) press();
}

function givePuffs(): void {
  props.run.useDevice(props.deviceId, puffs.value);
  emit('close');
}

onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <BottomSheet :title="device?.label ?? 'Device'" @close="emit('close')">
    <template #vitals
      ><VitalsStrip :monitor="run.monitor.value" :said="run.caption.value"
    /></template>
    <template v-if="device && isPen">
      <p class="hint">{{ device.detail }}</p>
      <p v-if="instruction" class="pen-says">
        <span class="pen-says-who">The pen says</span> “{{ instruction }}”
      </p>
      <button
        type="button"
        class="btn btn--tall"
        :class="{ 'btn--on': guardOff }"
        :disabled="guardOff"
        @click="guardOff = true"
      >
        {{ guardOff ? pen.off : pen.pull }}
      </button>
      <button
        type="button"
        class="hold"
        :disabled="!guardOff"
        :style="{ '--held': held }"
        @pointerdown.prevent="press"
        @pointerup="release"
        @pointerleave="release"
        @pointercancel="release"
        @keydown.space.prevent="keyPress"
        @keydown.enter.prevent="keyPress"
        @keyup.space="release"
        @keyup.enter="release"
        @blur="release"
        @contextmenu.prevent
      >
        <span class="hold-fill" aria-hidden="true"></span>
        <span class="hold-text">{{ pen.press }}</span>
      </button>
    </template>

    <template v-else-if="device">
      <p class="hint">{{ device.detail }}</p>
      <div class="stepper">
        <button
          type="button"
          class="btn"
          :disabled="puffs <= 1"
          aria-label="Fewer puffs"
          @click="puffs -= 1"
        >
          −
        </button>
        <output class="count mono">{{ puffs }} {{ puffs === 1 ? 'puff' : 'puffs' }}</output>
        <button
          type="button"
          class="btn"
          :disabled="puffs >= (device.maxUnits ?? 8)"
          aria-label="More puffs"
          @click="puffs += 1"
        >
          +
        </button>
      </div>
      <button type="button" class="btn btn--key btn--tall" @click="givePuffs">Give</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--color-text-secondary);
}
/* The pen's words, for a room with the sound off. */
.pen-says {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--type-body);
}
.pen-says-who {
  display: block;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-secondary);
}
.hold {
  position: relative;
  overflow: hidden;
  min-height: 120px;
  border-radius: var(--r-lg);
  background: var(--color-surface-elevated);
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  touch-action: none;
}
.hold:disabled {
  color: var(--color-text-disabled);
}
.hold-fill {
  position: absolute;
  inset: 0;
  transform-origin: left;
  transform: scaleX(var(--held, 0));
  background: var(--color-purple-soft);
  border-right: 2px solid var(--color-purple);
}
.hold-text {
  position: relative;
}
.stepper {
  display: grid;
  grid-template-columns: 64px 1fr 64px;
  align-items: center;
  gap: var(--sp-3);
}
.stepper .btn {
  min-height: 56px;
  font-size: var(--type-title);
}
.count {
  text-align: center;
  font-size: var(--type-title);
  font-weight: var(--weight-bold);
}
</style>
