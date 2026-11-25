<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import { BREATH } from '@/engine/engine';
import type { Run } from '@/composables/useRun';

/**
 * The bag, once it is on. Each press and hold is one breath, and nothing
 * here keeps time for a scored run: the rhythm is the player's to hold, as
 * it is in the room. A practice run adds a ring that fills over the gap the
 * BVM page writes, and that page's own line under it.
 */
const props = defineProps<{ run: Run; coached: boolean }>();
const emit = defineEmits<{ (e: 'squeezing', down: boolean): void }>();

/** The page's line, word for word. The pad adds no number or technique of its own. */
const PAGE_LINE =
  findProtocol('bvm')?.steps.find((s) => s.text.includes('just enough to see the chest rise'))
    ?.text ?? '';

const RING = 2 * Math.PI * 30;

const down = ref(false);
let since = 0;

const mine = computed(() => props.run.bagHeldBy.value === 'player');
const waited = computed(() => props.run.sinceBreath.value);
/** How far round the ring is: full before the first breath and once the gap has passed. */
const due = computed(() =>
  waited.value === null ? 1 : Math.min(1, waited.value / BREATH.everySec),
);
const count = computed(() => (waited.value === null ? '' : String(Math.floor(waited.value))));

function press(): void {
  if (down.value) return;
  down.value = true;
  since = performance.now();
  emit('squeezing', true);
}

function release(): void {
  if (!down.value) return;
  down.value = false;
  emit('squeezing', false);
  props.run.squeeze((performance.now() - since) / 1000);
}

/** A held key repeats: only the first keydown starts the squeeze. */
function keyPress(e: KeyboardEvent): void {
  if (!e.repeat) press();
}

onBeforeUnmount(() => {
  if (down.value) emit('squeezing', false);
});
</script>

<template>
  <section class="bag" aria-label="The bag">
    <template v-if="mine">
      <div class="bag-row">
        <div v-if="coached" class="ring" :class="{ 'is-due': due >= 1 }" aria-hidden="true">
          <svg viewBox="0 0 72 72">
            <circle class="ring-track" cx="36" cy="36" r="30" />
            <circle
              class="ring-fill"
              cx="36"
              cy="36"
              r="30"
              :stroke-dasharray="RING"
              :stroke-dashoffset="RING * (1 - due)"
            />
          </svg>
          <span class="ring-n mono">{{ count }}</span>
        </div>
        <button
          type="button"
          class="squeeze"
          :class="{ 'is-down': down }"
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
          Squeeze the bag
        </button>
        <button type="button" class="pill hand" @click="run.handBag('da')">DA takes the bag</button>
      </div>
      <p v-if="coached && PAGE_LINE" class="page-line">
        <span class="eyebrow">BVM page</span> {{ PAGE_LINE }}
      </p>
    </template>
    <div v-else class="bag-row">
      <p class="held-by"><span class="eyebrow">DA</span> has the bag.</p>
      <button type="button" class="pill hand" @click="run.handBag('player')">
        Take the bag back
      </button>
    </div>
  </section>
</template>

<style scoped>
.bag {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--r-lg);
  background: var(--color-card-bg);
}
.bag-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.ring {
  position: relative;
  flex: none;
  width: 64px;
  height: 64px;
}
.ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-track,
.ring-fill {
  fill: none;
  stroke-width: 6;
}
.ring-track {
  stroke: var(--color-surface-overlay);
}
.ring-fill {
  stroke: var(--color-text-secondary);
  stroke-linecap: round;
  transition: stroke-dashoffset 250ms linear;
}
.ring.is-due .ring-fill {
  stroke: var(--color-text-primary);
}
.ring-n {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
}
.squeeze {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 80px;
  border-radius: var(--r-lg);
  background: var(--color-text-primary);
  color: var(--color-bg);
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform var(--dur-150) var(--ease-standard),
    background var(--dur-150) var(--ease-standard);
}
.squeeze.is-down {
  transform: scale(0.97);
  background: var(--color-text-secondary);
}
.hand {
  flex: none;
}
.held-by {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--type-heading);
}
.page-line {
  margin: 0;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
@media (max-width: 480px), (max-height: 900px) {
  .bag {
    padding: var(--sp-2);
  }
  .squeeze {
    min-height: 56px;
  }
  .ring {
    width: 52px;
    height: 52px;
  }
  .page-line {
    font-size: var(--type-caption);
  }
}
</style>
