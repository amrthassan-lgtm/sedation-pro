<script setup lang="ts">
import { computed } from 'vue';

import { phraseInStep } from '@/engine/protocol';
import type { Look } from '@/engine/types';

/**
 * The patient, drawn as plainly as the syringes: colour, eyes and a chest
 * that moves when air does. Colour is never the only signal; the line of
 * text under the figure says the same thing in words.
 */
const props = defineProps<{
  look: Look;
  /** Breaths a minute to animate; 0 holds the chest still. */
  rr: number;
  /** A mask held on the face (bagging or CPAP) instead of the nasal hood. */
  mask: boolean;
  /**
   * The player's hand is on the bag: the chest is up while it is squeezed
   * and still between squeezes. `null` leaves the chest to breathe at `rr`.
   */
  lift?: boolean | null;
  /** The belly is seen to rise. Said in words under the figure as well as drawn. */
  belly?: boolean;
}>();

/** The sign as the BVM page names it. */
const BELLY = phraseInStep('bvm', 'Belly rising', 'Belly rising');
const byHand = computed(() => props.lift !== null && props.lift !== undefined);
const note = computed(() =>
  [props.look.note, props.belly ? BELLY.toLowerCase() : ''].filter(Boolean).join(' · '),
);

const skin = computed(() => `var(--skin-${props.look.color})`);
const breathSeconds = computed(() => (props.rr > 0 ? `${(60 / props.rr).toFixed(2)}s` : '0s'));
</script>

<template>
  <figure class="patient">
    <svg viewBox="0 0 120 120" role="img" :aria-label="`Patient: ${note || look.color}`">
      <g
        class="chest"
        :class="{ 'is-still': rr <= 0 || byHand, 'is-up': lift === true }"
        :style="{ animationDuration: breathSeconds }"
      >
        <path d="M14 120 C14 86 36 78 60 78 C84 78 106 86 106 120 Z" class="gown" />
        <ellipse v-if="belly" class="belly" cx="60" cy="112" rx="22" ry="9" />
      </g>
      <rect x="50" y="62" width="20" height="20" rx="6" :fill="skin" />
      <circle cx="60" cy="42" r="25" :fill="skin" />
      <g v-if="look.eyes === 'closed'" class="eyes">
        <path d="M46 40 q5 4 10 0" />
        <path d="M64 40 q5 4 10 0" />
      </g>
      <g v-else class="eyes-open">
        <circle cx="51" cy="40" r="2.6" />
        <circle cx="69" cy="40" r="2.6" />
      </g>
      <path
        v-if="!mask"
        d="M52 47 h16 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z"
        class="hood"
      />
      <path
        v-else
        d="M44 44 h32 l4 20 a10 10 0 0 1 -10 6 h-20 a10 10 0 0 1 -10 -6 z"
        class="mask"
      />
      <path v-if="!mask" d="M48 51 C30 52 22 60 16 70 M72 51 C90 52 98 60 104 70" class="tube" />
    </svg>
    <figcaption class="patient-note">{{ note }}</figcaption>
  </figure>
</template>

<style scoped>
.patient {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  min-width: 0;
}
/* Given less height than it would take, the drawing is made smaller and the line under it kept. */
svg {
  flex: 0 1 auto;
  width: 100%;
  max-width: 132px;
  height: auto;
  min-height: 0;
}
.gown {
  fill: var(--color-surface-overlay);
}
.chest {
  transform-origin: 60px 120px;
  animation: breathe ease-in-out infinite;
}
.chest.is-still {
  animation: none;
  transition: transform 300ms var(--ease-standard);
}
.chest.is-up {
  transform: scaleY(1.09);
}
.belly {
  fill: var(--color-warn-soft);
  stroke: var(--color-warn);
  stroke-width: 1.5;
}
@keyframes breathe {
  50% {
    transform: scaleY(1.07);
  }
}
.eyes path {
  fill: none;
  stroke: var(--fig-ink);
  stroke-width: 2;
  stroke-linecap: round;
}
.eyes-open circle {
  fill: var(--fig-ink);
}
.hood {
  fill: var(--fig-device);
  stroke: var(--fig-device-line);
  stroke-width: 1;
}
.mask {
  fill: var(--fig-device);
  stroke: var(--fig-device-line);
  stroke-width: 1.5;
}
.tube {
  fill: none;
  stroke: var(--fig-tube);
  stroke-width: 2;
}
.patient-note {
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
  text-align: center;
  min-height: 2.6em;
  line-height: 1.3;
}
</style>
