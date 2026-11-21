<script setup lang="ts">
import { computed } from 'vue';

import { fmtClock } from '@/composables/format';
import { useGasSwitch } from '@/composables/useGasSwitch';

/**
 * The N₂O / O₂ switch as a two-sided control. The lit side is what is
 * running, with the time it was set; a tap on the other side flips it.
 *
 * Step 4 of the IV screen and the dock show this same control (owner, Nov
 * 2026), so the gas reads and works the same wherever it is flipped. Both
 * go through `useGasSwitch`: same log line, same pop-up, same Undo.
 *
 * O₂ 100% is not offered until the mix has been on: there is nothing to
 * turn off before that. A tap on the lit side does nothing.
 */
interface Props {
  /** 56 px on a step card, where clinical actions keep their full height. 44 px in the dock. */
  tall?: boolean;
}

const props = withDefaults(defineProps<Props>(), { tall: false });

const { n2oOn, o2OnlyOn, canTurnOff, runningSince, turnOn, turnOff } = useGasSwitch();
const since = computed(() => fmtClock(runningSince.value));
</script>

<template>
  <div class="gas-switch" :class="{ 'is-tall': props.tall }" role="group" aria-label="Gas">
    <button
      type="button"
      class="gas-seg"
      :class="{ 'is-on': n2oOn }"
      :aria-pressed="n2oOn"
      @click="turnOn"
    >
      <span>N₂O / O₂</span>
      <span v-if="n2oOn && since" class="gas-time">{{ since }}</span>
    </button>
    <button
      type="button"
      class="gas-seg"
      :class="{ 'is-on': o2OnlyOn }"
      :aria-pressed="o2OnlyOn"
      :disabled="!canTurnOff && !o2OnlyOn"
      @click="turnOff"
    >
      <span>O₂ 100%</span>
      <span v-if="o2OnlyOn && since" class="gas-time">{{ since }}</span>
    </button>
  </div>
</template>

<style scoped>
/* The kit's segmented control (UiChipGroup, tap-target), with the time
   riding inside the lit segment. */
.gas-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 2px;
  border-radius: var(--r-md);
  background: var(--color-surface);
}
.gas-seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: 10px;
  min-width: 0;
  min-height: 44px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.is-tall .gas-seg {
  min-height: 56px;
}
.gas-seg:active:not(:disabled):not(.is-on) {
  transform: scale(0.97);
}
.gas-seg.is-on {
  background: var(--color-segment-active);
  border-color: var(--color-border);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
  cursor: default;
}
.gas-seg:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}
.gas-time {
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-good);
}
</style>
