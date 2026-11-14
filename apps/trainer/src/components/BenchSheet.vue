<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { UiSyringe } from '@sedation-pro/ui';

import { findVial } from '@/engine/catalog';
import { formatMass } from '@/engine/dose';
import { concentrationMcgPerMl, type SyringeSize } from '@/engine/syringe';
import type { Run } from '@/composables/useRun';
import { settings } from '@/session';

import BottomSheet from './BottomSheet.vue';
import VitalsStrip from './VitalsStrip.vue';

/**
 * The draw-up bench. Everything the protocol specifies about a dose is the
 * player's to supply here: which syringe, how much, a label, which route.
 * All three syringes and both routes are offered for every drug, so nothing
 * on the bench hints at the right answer.
 */
const props = defineProps<{
  run: Run;
  /** The vial being drawn from, for a fresh syringe. */
  vialKey: string | null;
  /** A syringe already on the tray, reopened. */
  syringeId: string | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const SIZES: ReadonlyArray<SyringeSize> = [1, 3, 10];
const NEUTRAL = 'var(--color-slate)';

const id = ref<string | null>(props.syringeId);
const syringe = computed(() =>
  id.value ? props.run.tray.value.find((s) => s.id === id.value) : undefined,
);
const vial = computed(() => findVial(props.vialKey ?? syringe.value?.drugKey ?? ''));

/** Where the plunger is while a finger is on it; committed to the sim on release. */
const plunger = ref(syringe.value?.volumeMl ?? 0);
watch(syringe, (s) => {
  plunger.value = s?.volumeMl ?? 0;
});

const pending = ref<'IV' | 'IM' | null>(null);
/** On a phone the read-back and Give land below the fold of the sheet: bring them up. */
const readbackEl = ref<HTMLElement | null>(null);
watch(pending, async (route) => {
  if (!route) return;
  await nextTick();
  readbackEl.value?.scrollIntoView({ block: 'end', behavior: 'smooth' });
});

const size = computed(() => syringe.value?.sizeMl ?? null);
const labeled = computed(() => syringe.value?.labeled ?? false);
const volume = computed(() => syringe.value?.volumeMl ?? 0);
const title = computed(() =>
  vial.value ? `${vial.value.name} · ${vial.value.presentation}` : 'Syringe',
);
const shownName = computed(() =>
  labeled.value ? (syringe.value?.drugName ?? 'Saline') : 'Unlabeled syringe',
);

/** In coached runs the bench also shows the mass, as the protocol card would. */
const mass = computed(() => {
  const s = syringe.value;
  if (!settings.coached || !s || s.drugKey === null) return '';
  return `= ${formatMass(plunger.value * concentrationMcgPerMl(s) || plunger.value * (vial.value?.mcgPerMl ?? 0))}`;
});

function pickSize(ml: SyringeSize): void {
  if (id.value && volume.value === 0) props.run.discard(id.value);
  id.value = props.run.pickUpSyringe(ml);
  pending.value = null;
}

function tick(): void {
  try {
    navigator.vibrate?.(4);
  } catch {
    // No motor.
  }
}

function commit(): void {
  const s = syringe.value;
  if (!s || !id.value) return;
  const target = Math.round(plunger.value * 10) / 10;
  if (target > s.volumeMl && vial.value)
    props.run.drawFromVial(id.value, vial.value.key, target - s.volumeMl);
  else if (target < s.volumeMl) props.run.wasteTo(id.value, target);
  pending.value = null;
}

/** A tenth at a time, for a finger that cannot land the slider on 0.3. */
function nudge(by: number): void {
  const s = syringe.value;
  if (!s) return;
  plunger.value = Math.min(s.sizeMl, Math.max(0, Math.round((plunger.value + by) * 10) / 10));
  tick();
  commit();
}

function give(): void {
  if (!id.value || !pending.value || volume.value <= 0) return;
  props.run.give(id.value, volume.value, pending.value);
  emit('close');
}

function putDown(): void {
  if (id.value && volume.value === 0) props.run.discard(id.value);
  emit('close');
}

const readBack = computed(() => {
  if (!pending.value) return '';
  const where = pending.value === 'IM' ? 'into the thigh' : 'into the IV';
  return `${shownName.value}, ${volume.value.toFixed(1)} ml, ${where}?`;
});
</script>

<template>
  <BottomSheet :title="title" size="tall" @close="putDown">
    <template #vitals
      ><VitalsStrip :monitor="run.monitor.value" :said="run.caption.value"
    /></template>
    <p class="eyebrow">Syringe</p>
    <div class="sizes">
      <button
        v-for="ml in SIZES"
        :key="ml"
        type="button"
        class="btn"
        :class="{ 'btn--on': size === ml }"
        :aria-pressed="size === ml"
        :disabled="volume > 0 && size !== ml"
        @click="pickSize(ml)"
      >
        {{ ml }} ml
      </button>
    </div>

    <template v-if="syringe">
      <UiSyringe
        hero
        :label="shownName"
        :capacity-ml="syringe.sizeMl"
        :drawn-ml="plunger"
        :color="labeled && syringe.tint ? syringe.tint : NEUTRAL"
        :caption="`${plunger.toFixed(1)} ml`"
        :concentration="mass"
      />
      <label class="eyebrow" for="plunger">Plunger</label>
      <div class="plunger-row">
        <button
          type="button"
          class="btn nudge"
          aria-label="Push in a tenth"
          :disabled="plunger <= 0"
          @click="nudge(-0.1)"
        >
          −
        </button>
        <input
          id="plunger"
          v-model.number="plunger"
          class="plunger"
          type="range"
          min="0"
          :max="syringe.sizeMl"
          step="0.1"
          @input="tick"
          @change="commit"
        />
        <button
          type="button"
          class="btn nudge"
          aria-label="Draw back a tenth"
          :disabled="plunger >= syringe.sizeMl"
          @click="nudge(0.1)"
        >
          +
        </button>
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn"
          :class="{ 'btn--on': labeled }"
          :disabled="labeled || volume <= 0"
          @click="run.labelSyringe(syringe.id)"
        >
          {{ labeled ? 'Labeled' : 'Label it' }}
        </button>
        <button type="button" class="btn" @click="putDown">Put it down</button>
      </div>

      <p class="eyebrow">Give</p>
      <div class="actions">
        <button
          type="button"
          class="btn btn--tall"
          :class="{ 'btn--on': pending === 'IM' }"
          :aria-pressed="pending === 'IM'"
          :disabled="volume <= 0"
          @click="pending = 'IM'"
        >
          IM, outer thigh
        </button>
        <button
          type="button"
          class="btn btn--tall"
          :class="{ 'btn--on': pending === 'IV' }"
          :aria-pressed="pending === 'IV'"
          :disabled="volume <= 0"
          @click="pending = 'IV'"
        >
          IV push
        </button>
      </div>

      <div v-if="pending" ref="readbackEl" class="readback">
        <p class="readback-line"><span class="eyebrow">DA</span> {{ readBack }}</p>
        <div class="actions">
          <button type="button" class="btn btn--key btn--tall" @click="give">Give</button>
          <button type="button" class="btn btn--tall" @click="pending = null">Stop</button>
        </div>
      </div>
    </template>
    <p v-else class="hint">Pick a syringe to draw into.</p>
  </BottomSheet>
</template>

<style scoped>
.sizes,
.actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: var(--sp-2);
}
.plunger-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  gap: var(--sp-2);
  align-items: center;
}
.nudge {
  padding: 0;
  font-size: var(--type-title);
}
.plunger {
  width: 100%;
  height: 44px;
  accent-color: var(--train);
}
.readback {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-surface-elevated);
}
.readback-line {
  margin: 0;
  font-size: var(--type-heading);
  font-weight: var(--weight-semibold);
}
.hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
