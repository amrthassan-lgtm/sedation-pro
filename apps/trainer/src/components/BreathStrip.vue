<script setup lang="ts">
import { computed } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import { BREATH } from '@/engine/engine';
import type { Breath } from '@/engine/types';
import { fmtClock } from '@/time';

/**
 * The breaths the player gave, as they gave them: one bar a squeeze, from
 * where it began to where it was let go, against marks set the page's gap
 * apart. A breath the engine found off the page's pace is an outline. Facts
 * only. What the rhythm should have been is the page's own line, printed
 * above it.
 */
const props = defineProps<{
  breaths: ReadonlyArray<Breath>;
  assistantBagging: ReadonlyArray<{ readonly from: number; readonly to: number }>;
}>();

/** Long enough to read a rhythm, short enough that a breath is still a bar and not a hair. */
const WINDOW_SEC = 60;
const W = 560;
const H = 58;
const PAD = 8;
const BAR_TOP = 12;
const BAR_H = 24;

const PAGE_LINE =
  findProtocol('bvm')?.steps.find((s) => s.text.includes('just enough to see the chest rise'))
    ?.text ?? '';

/** A squeeze is recorded when the bag is let go: it began its own length before that. */
const began = (b: Breath): number => Math.max(0, b.t - b.held);
const from = computed(() => {
  const first = props.breaths[0];
  return first ? began(first) : 0;
});
const x = (seconds: number): number => PAD + ((W - 2 * PAD) * seconds) / WINDOW_SEC;

const bars = computed(() =>
  props.breaths
    .filter((b) => began(b) - from.value <= WINDOW_SEC)
    .map((b) => ({
      x: x(began(b) - from.value),
      width: Math.max(3, x(Math.min(b.held, WINDOW_SEC)) - PAD),
      off: b.onPace === false,
    })),
);

/** A run saved before breaths were judged says nothing about their pace, so neither does the strip. */
const judged = computed(() => props.breaths.some((b) => typeof b.onPace === 'boolean'));

const marks = computed(() => {
  const out: number[] = [];
  for (let s = 0; s <= WINDOW_SEC; s += BREATH.everySec) out.push(x(s));
  return out;
});

/** Where the assistant had the bag inside the window drawn. */
const handed = computed(() =>
  props.assistantBagging
    .map((span) => ({
      from: Math.max(0, span.from - from.value),
      to: Math.min(WINDOW_SEC, span.to - from.value),
    }))
    .filter((span) => span.to > span.from)
    .map((span) => ({ x: x(span.from), width: x(span.to) - x(span.from) })),
);

const summary = computed(() => {
  const first = bars.value.length;
  const all = props.breaths.length;
  const window = `${first} in the first minute`;
  return all > first ? `${window} · ${all} in all` : window;
});
</script>

<template>
  <figure v-if="breaths.length > 0" class="strip">
    <figcaption class="strip-head">
      <span class="eyebrow">Breaths you gave</span>
      <span class="strip-sum">{{ summary }}</span>
    </figcaption>
    <p v-if="PAGE_LINE" class="strip-page"><span class="eyebrow">BVM page</span> {{ PAGE_LINE }}</p>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`Breaths given: ${summary}`">
      <rect
        v-for="(span, i) in handed"
        :key="`h${i}`"
        class="handed"
        :x="span.x"
        :y="BAR_TOP - 4"
        :width="span.width"
        :height="BAR_H + 8"
        rx="3"
      />
      <line
        v-for="(mark, i) in marks"
        :key="`m${i}`"
        class="mark"
        :x1="mark"
        :x2="mark"
        :y1="BAR_TOP - 6"
        :y2="BAR_TOP + BAR_H + 6"
      />
      <rect
        v-for="(bar, i) in bars"
        :key="`b${i}`"
        class="bar"
        :class="{ 'is-off': bar.off }"
        :x="bar.x"
        :y="BAR_TOP"
        :width="bar.width"
        :height="BAR_H"
        rx="2"
      />
      <text class="axis" :x="PAD" :y="H - 2">{{ fmtClock(from) }}</text>
      <text class="axis" :x="W - PAD" :y="H - 2" text-anchor="end">
        {{ fmtClock(from + WINDOW_SEC) }}
      </text>
    </svg>
    <p class="strip-note">
      Dotted lines are {{ BREATH.everySec }} seconds apart. Each bar is one squeeze, as wide as it
      was held<template v-if="judged"
        >: solid when it was on pace, outlined when it was not</template
      >.<template v-if="handed.length > 0"> Shaded: the assistant had the bag.</template>
    </p>
    <a class="strip-go" href="../quick-reference/bvm">Go to BVM ›</a>
  </figure>
</template>

<style scoped>
.strip {
  margin: var(--sp-2) 0 0;
  padding: var(--sp-3) var(--sp-4) var(--sp-1);
  border-radius: var(--r-lg);
  background: var(--color-card-bg);
}
.strip-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-3);
}
.strip-sum {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.strip-page {
  margin: var(--sp-1) 0 var(--sp-2);
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
svg {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
}
.mark {
  stroke: var(--color-text-tertiary);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.bar {
  fill: var(--color-text-primary);
}
/*
 * Off pace is a quieter bar, not a red one: red is the room's, for an
 * emergency. Hollow on the card's own colour, so it is not taken for the
 * shading that marks the assistant's turn.
 */
.bar.is-off {
  fill: var(--color-card-bg);
  stroke: var(--color-text-secondary);
  stroke-width: 1.5;
}
.handed {
  fill: var(--color-surface-overlay);
}
.axis {
  fill: var(--color-text-tertiary);
  font-size: 11px;
  font-family: var(--font-mono);
}
.strip-note {
  margin: var(--sp-1) 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
}
.strip-go {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-accent);
  font-size: var(--type-footnote);
}
</style>
