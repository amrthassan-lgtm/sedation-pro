<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { findDevice } from '@/engine/catalog';
import { calloutAt } from '@/engine/protocol';
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

/** How long to hold comes from the protocol's own instruction for the pen. */
const HOLD_SECONDS = (() => {
  const notes = calloutAt('anaphylaxis', 'Auvi-Q 0.3 first').notes ?? '';
  const m = /hold (\d+) seconds/.exec(notes);
  return m ? Number(m[1]) : 2;
})();

/** Only the Auvi-Q's own steps are in the protocol. Another pen gets no technique from the trainer. */
const guard = computed(() =>
  props.deviceId === 'auviq_adult'
    ? { pull: 'Pull off the red guard', off: 'Red guard off' }
    : { pull: 'Take the safety off', off: 'Safety off' },
);

const guardOff = ref(false);
const held = ref(0);
const puffs = ref(1);
let raf = 0;
let since = 0;

function press(): void {
  if (!guardOff.value) return;
  since = performance.now();
  const step = (now: number): void => {
    held.value = Math.min(1, (now - since) / (HOLD_SECONDS * 1000));
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
      <button
        type="button"
        class="btn btn--tall"
        :class="{ 'btn--on': guardOff }"
        :disabled="guardOff"
        @click="guardOff = true"
      >
        {{ guardOff ? guard.off : guard.pull }}
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
        @contextmenu.prevent
      >
        <span class="hold-fill" aria-hidden="true"></span>
        <span class="hold-text">Press into the outer thigh and hold</span>
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
