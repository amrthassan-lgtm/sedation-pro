<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import { BREATH, BREATH_WORDS, gapOnPace, HAND_OVER_AFTER, holdOnPace } from '@/engine/engine';
import type { Run } from '@/composables/useRun';

/**
 * The bag, once it is on. Each press and hold is one breath, and the pad
 * keeps the BVM page's time beside the thumb: a ring that fills over the
 * page's gap from where the last squeeze began, and a fill that crosses the
 * button to a mark at the page's breath length. After each breath one line
 * states what it was, beside the page's own words where it missed them. The
 * pad judges nothing itself and advises nothing: what is on pace is the
 * engine's, and the assistant takes the bag only once the engine says the
 * hand-over is earned. A practice run prints the page's whole line as well.
 */
const props = defineProps<{ run: Run; coached: boolean }>();
const emit = defineEmits<{ (e: 'squeezing', down: boolean): void }>();

/** The page's line, word for word. The pad adds no number or technique of its own. */
const PAGE_LINE =
  findProtocol('bvm')?.steps.find((s) => s.text.includes('just enough to see the chest rise'))
    ?.text ?? '';

const RING = 2 * Math.PI * 30;
/**
 * The button is this long from edge to edge, so the mark for the page's
 * breath sits two thirds across: clear of a thumb on the middle, with room
 * past it for a squeeze held on.
 */
const SWEEP_SEC = BREATH.overSec * 1.5;
const MARK = BREATH.overSec / SWEEP_SEC;

const down = ref(false);
/** How long the last squeeze was held, once it is let go: the fill stays there until the next press. */
const lastHeld = ref(0);
/**
 * Bumped every frame while the pad is up, so that what is read off a clock is
 * read again. The ring and the fill are a timer, and one that moved only when
 * the run does, four times a second, would come due late and be hard to keep
 * time to.
 */
const frames = ref(0);
let since = 0;
let raf = 0;

const mine = computed(() => props.run.bagHeldBy.value === 'player');
const earned = computed(() => props.run.handOverEarned.value);

const heldNow = (): number => (performance.now() - since) / 1000;

/** Seconds the bag has been held squeezed, while it is; then where it was let go. */
const held = computed(() => {
  void frames.value;
  return down.value ? heldNow() : lastHeld.value;
});
/** Seconds into the breath: from the press while the bag is held, from the run once it is let go. */
const waited = computed(() => {
  void frames.value;
  if (down.value) return heldNow();
  const sinceBreath = props.run.sinceBreath.value;
  return sinceBreath === null ? null : sinceBreath + props.run.ahead();
});
/** How far round the ring is: full before the first breath and once the gap has passed. */
const due = computed(() =>
  waited.value === null ? 1 : Math.min(1, waited.value / BREATH.everySec),
);
const count = computed(() => (waited.value === null ? '' : String(Math.floor(waited.value))));
const sweep = computed(() => Math.min(1, held.value / SWEEP_SEC));

/** The latest breath, and which of the page's two numbers it missed. Nothing while the next is being squeezed. */
const last = computed(() => (down.value ? null : props.run.lastBreath.value));
const missed = computed(() => {
  const breath = last.value;
  return {
    gap: breath !== null && !gapOnPace(breath.gap),
    hold: breath !== null && !holdOnPace(breath.held),
  };
});

/** Whole seconds, as the ring counted them; under one second, to the tenth. */
function gapSeconds(gap: number): string {
  return gap < 1 ? gap.toFixed(1) : String(Math.floor(gap));
}

/** What the breath was. A fact and nothing more: the page's words beside it say the rest. */
const fact = computed(() => {
  const breath = last.value;
  if (!breath) return '';
  if (breath.onPace) {
    return breath.towardHandOver === null
      ? 'On pace'
      : `On pace · ${breath.towardHandOver} of ${HAND_OVER_AFTER}`;
  }
  const parts: string[] = [];
  if (missed.value.gap && breath.gap !== null) {
    parts.push(`${gapSeconds(breath.gap)} s since the last breath`);
  }
  if (missed.value.hold) parts.push(`held ${breath.held.toFixed(1)} s`);
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
});

/** The page's words for what was missed; in a practice run, its whole line whatever the breath. */
const pageWords = computed(() => {
  if (props.coached) return PAGE_LINE;
  const { gap, hold } = missed.value;
  if (gap && hold) return BREATH_WORDS.both;
  if (gap) return BREATH_WORDS.every;
  return hold ? BREATH_WORDS.over : '';
});

function frame(): void {
  frames.value += 1;
  raf = requestAnimationFrame(frame);
}

function press(): void {
  if (down.value) return;
  since = performance.now();
  down.value = true;
  emit('squeezing', true);
}

function release(): void {
  if (!down.value) return;
  lastHeld.value = heldNow();
  down.value = false;
  emit('squeezing', false);
  props.run.squeeze(lastHeld.value);
}

/** A held key repeats: only the first keydown starts the squeeze. */
function keyPress(e: KeyboardEvent): void {
  if (!e.repeat) press();
}

onMounted(() => {
  raf = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  if (down.value) emit('squeezing', false);
});
</script>

<template>
  <section class="bag" aria-label="The bag">
    <template v-if="mine">
      <div class="bag-row">
        <div class="ring" :class="{ 'is-due': due >= 1, 'is-held': down }" aria-hidden="true">
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
            <circle class="ring-disc" cx="36" cy="36" r="33" />
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
          <span class="sweep" :style="{ transform: `scaleX(${sweep})` }" aria-hidden="true" />
          <span class="mark" :style="{ left: `${MARK * 100}%` }" aria-hidden="true" />
          <span class="squeeze-label">Squeeze the bag</span>
        </button>
        <button type="button" class="pill hand" :disabled="!earned" @click="run.handBag('da')">
          <span>DA takes the bag</span>
          <span v-if="!earned" class="hand-why">
            On pace {{ run.paceRun.value }} of {{ HAND_OVER_AFTER }}
          </span>
        </button>
      </div>
      <div class="hint" :class="{ 'is-coached': coached }">
        <p class="fact" :class="{ 'is-off': missed.gap || missed.hold }">{{ fact }}</p>
        <p v-if="pageWords" class="page-line">
          <span class="eyebrow">BVM page</span> {{ pageWords }}
        </p>
      </div>
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
}
/* A breath is due: the ring is a whole disc, the way the one main button on a screen is white. */
.ring-disc {
  fill: var(--color-text-primary);
  opacity: 0;
  transition: opacity var(--dur-250) var(--ease-standard);
}
.ring.is-due .ring-disc {
  opacity: 1;
}
/* Under the disc the arc has nothing left to say, and would show through it as a rim. */
.ring.is-due .ring-fill {
  opacity: 0;
}
/* Pressed, the ring starts again at once. */
.ring.is-held .ring-disc,
.ring.is-held .ring-n {
  transition: none;
}
.ring-n {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-secondary);
  transition: color var(--dur-250) var(--ease-standard);
}
.ring.is-due .ring-n {
  color: var(--color-bg);
}
.squeeze {
  position: relative;
  overflow: hidden;
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
  /* Let go, it stays as it was for a moment, so where the fill stopped can be read against the mark. */
  transition:
    transform var(--dur-150) var(--ease-standard),
    background var(--dur-400) var(--ease-standard) 600ms;
}
.squeeze.is-down {
  transform: scale(0.97);
  background: var(--color-text-disabled);
  transition:
    transform var(--dur-150) var(--ease-standard),
    background var(--dur-150) var(--ease-standard);
}
.sweep {
  position: absolute;
  inset: 0;
  background: var(--color-text-primary);
  transform-origin: left center;
  opacity: 0;
  transition: opacity var(--dur-400) var(--ease-standard) 600ms;
}
.squeeze.is-down .sweep {
  opacity: 1;
  transition: none;
}
/* Only with the fill it is there to be read against: at rest it would cut the button in two. */
.mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--color-bg);
  opacity: 0;
  transition: opacity var(--dur-400) var(--ease-standard) 600ms;
}
.squeeze.is-down .mark {
  opacity: 0.4;
  transition: none;
}
.squeeze-label {
  position: relative;
}
.hand {
  flex: none;
  flex-direction: column;
  line-height: var(--leading-tight);
}
.hand:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}
.hand-why {
  font-size: var(--type-caption);
  font-weight: var(--weight-medium);
  color: var(--color-text-tertiary);
}
.held-by {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--type-heading);
}
/*
 * The line under the row keeps its height whether or not it has anything to
 * say, so the button never moves under a thumb that is keeping time on it.
 */
.hint {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px var(--sp-3);
  min-width: 0;
}
.fact,
.page-line {
  margin: 0;
  font-size: var(--type-footnote);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
.fact {
  min-height: calc(var(--type-footnote) * var(--leading-normal));
}
.fact.is-off {
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}
.page-line {
  min-width: 0;
}
/* Smaller type on the same line: left to its own leading it makes the line a pixel taller. */
.page-line .eyebrow {
  line-height: 1;
}
.hint.is-coached .page-line {
  flex-basis: 100%;
}
/* Too narrow for the fact and the page's words side by side: one over the other, both lines kept. */
@media (max-width: 700px) {
  .hint {
    min-height: calc(
      var(--type-footnote) * var(--leading-normal) + 2px + var(--type-caption) *
        var(--leading-normal)
    );
  }
  .page-line {
    flex-basis: 100%;
    font-size: var(--type-caption);
  }
}
/* A short screen, or one both narrow and not tall, where the line under the row is two lines deep. */
@media (max-width: 480px), (max-height: 900px), (max-width: 700px) and (max-height: 1000px) {
  .bag {
    padding: var(--sp-2);
    gap: var(--sp-1);
  }
  .squeeze {
    min-height: 56px;
  }
  .ring {
    width: 52px;
    height: 52px;
  }
}
</style>
