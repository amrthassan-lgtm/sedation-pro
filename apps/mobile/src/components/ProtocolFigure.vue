<script setup lang="ts">
/**
 * Drawings for what a protocol step cannot place in words under stress.
 *
 * One is drawn here by hand: how the auto-injector meets the thigh. Every
 * label on it is a phrase from the callout the drawing sits in, so the
 * picture adds a place and never an instruction.
 *
 * The rest (Larson's point, bagging, and each airway device in place) are
 * reviewed files, listed in `data/protocolFigures.ts`. A numbered one prints
 * its captions under it as page text, so they read on a phone, and one traced
 * from the Open Critical Care / WHO head carries the credit its licence
 * requires.
 */
import { computed } from 'vue';

import type { StepFigure } from '@sedation-pro/clinical';

import { ANATOMY_CREDIT, PROTOCOL_DRAWINGS, type ProtocolDrawing } from '@/data/protocolFigures';

export type ProtocolFigureKind = StepFigure | 'auto-injector';

const props = defineProps<{ kind: ProtocolFigureKind }>();

const drawing = computed<ProtocolDrawing | null>(() =>
  props.kind === 'auto-injector' ? null : PROTOCOL_DRAWINGS[props.kind],
);
</script>

<template>
  <figure v-if="drawing" class="drawing" :data-figure="kind">
    <!-- Markup from a file bundled with the app, never text someone typed. -->
    <div class="drawing-art" role="img" :aria-label="drawing.label" v-html="drawing.svg" />
    <ol v-if="drawing.captions.length > 0" class="drawing-captions" role="list">
      <li v-for="(caption, index) in drawing.captions" :key="index" class="drawing-caption">
        <span class="drawing-number" aria-hidden="true">{{ index + 1 }}</span>
        <span class="drawing-caption-text">{{ caption }}</span>
      </li>
    </ol>
    <figcaption v-if="drawing.tracedAnatomy" class="drawing-credit">
      {{ ANATOMY_CREDIT }}
    </figcaption>
  </figure>

  <svg
    v-else
    class="figure"
    viewBox="0 0 340 200"
    role="img"
    aria-label="Auto-injector with the red guard off, pressed into the outer thigh and held for 2 seconds"
  >
    <path
      class="body"
      d="M196 -6 C188 12 184 28 184 44 C184 104 190 156 196 215 L238 215 C242 160 247 114 251 74 C255 114 260 160 264 215 L306 215 C312 156 318 104 318 44 C318 28 314 12 306 -6 Z"
    />
    <rect class="pen" x="100" y="88" width="76" height="44" rx="8" />
    <rect class="pen-window" x="116" y="100" width="32" height="20" rx="4" />
    <rect class="pen-base" x="170" y="88" width="15" height="44" rx="4" />
    <path class="press" d="M28 110 L74 110" />
    <path class="press-head" d="M88 110 L74 102 L74 118 Z" />
    <rect
      class="guard"
      x="143"
      y="150"
      width="15"
      height="36"
      rx="4"
      transform="rotate(-24 150 168)"
    />
    <path class="pulled" d="M177 136 C177 150 172 158 164 163" />
    <text class="label label--key" x="20" y="60">Press firmly,</text>
    <text class="label label--key" x="20" y="77">hold 2 seconds</text>
    <text class="label" x="20" y="174">Red guard off</text>
    <path class="leader" d="M96 24 L186 60" />
    <text class="label" x="20" y="28">Outer thigh</text>
  </svg>
</template>

<style scoped>
/* A reviewed drawing: the picture, its numbered captions and its credit on
   one quiet platter, so the three read as one thing under the step. */
.drawing {
  margin: 0;
  padding: var(--sp-2) var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-surface-subtle);
}
/* The files carry a pixel size for their own previews; on the page the
   picture takes the step's width and keeps its shape. */
.drawing-art :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--r-sm);
}
.drawing-captions {
  display: grid;
  gap: var(--sp-2);
  margin: var(--sp-3) var(--sp-1) 0;
  padding: 0;
  list-style: none;
}
.drawing-caption {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  font-size: var(--type-body);
  line-height: var(--leading-normal);
  color: var(--color-text-primary);
}
/* The marker on the picture, again: white disc, dark numeral. */
.drawing-number {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  /* Lifts the disc so the numeral sits on the caption's first line. */
  margin-top: -2px;
  border-radius: 50%;
  background: var(--color-text-primary);
  color: var(--color-bg);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
}
.drawing-credit {
  margin: var(--sp-3) var(--sp-1) 0;
  font-size: var(--type-caption);
  line-height: var(--leading-normal);
  color: var(--color-text-tertiary);
}

.figure {
  display: block;
  width: 100%;
  max-width: 340px;
  margin-top: var(--sp-2);
}
.body {
  fill: var(--color-surface-elevated);
  stroke: var(--color-text-tertiary);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.leader,
.pulled,
.press {
  fill: none;
  stroke-linecap: round;
}
.press {
  stroke: var(--color-text-primary);
  stroke-width: 2.4;
}
.press-head {
  fill: var(--color-text-primary);
}
.leader {
  stroke: var(--color-border-strong);
  stroke-width: 1;
}
.pulled {
  stroke: var(--color-text-tertiary);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.label {
  fill: var(--color-text-secondary);
  font-size: 13px;
}
.label--key {
  fill: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}
/* The pen is the object in the hand, so it is drawn solid like the syringes. */
.pen {
  fill: #cbd5e1;
}
.pen-window {
  fill: #5d6b85;
}
.pen-base {
  fill: #0d1527;
  stroke: #a8b6cf;
  stroke-width: 1.2;
}
.guard {
  fill: var(--color-red);
}
</style>
