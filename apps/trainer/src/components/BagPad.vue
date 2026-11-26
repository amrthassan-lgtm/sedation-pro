<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import {
  BREATH,
  BREATH_WORDS,
  CPR,
  CPR_WORDS,
  gapOnPace,
  HAND_OVER_AFTER,
  holdOnPace,
} from '@/engine/engine';
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
 *
 * With the assistant on the chest the bag stays in the player's hand, so
 * there is no hand-over to offer. Until a tube is in, the ring keeps her time
 * and not the bag's: it counts her compressions to the arrest page's thirty,
 * then stands white with the breaths her pause is waiting for.
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

/** Where the assistant's hands are, while CPR is on. */
const chest = computed(() => props.run.compressions.value);
/** He has no pulse wave on the monitor: an arrest, in which the bag stays with the player. */
const pulseless = computed(() => props.run.monitor.value.perfusion === 0);
/**
 * No pulse, and nobody on his chest: before CPR has started, or with her
 * hands off for the AED. The bag is in the hand and is not the way forward,
 * so the pad keeps no time and asks for nothing.
 */
const standing = computed(() => pulseless.value && !chest.value);
/** The arrest page's cycle is running: her compressions, then the player's breaths. */
const cycle = computed(() => chest.value?.mode === 'cycle');
/** Compressions she has counted in this set, at the page's rate, as of this frame. */
const compressed = computed(() => {
  void frames.value;
  const now = chest.value;
  if (!now || !now.compressing) return CPR.compressions;
  const counted = Math.floor(((now.elapsed + props.run.ahead()) * CPR.perMin) / 60);
  return Math.min(CPR.compressions, counted);
});
/** Her hands are off for the breaths: the run says so, or the last of the set has just been counted. */
const paused = computed(
  () => cycle.value && (chest.value?.compressing === false || compressed.value >= CPR.compressions),
);
const breathsWanted = computed(
  () => CPR.breaths - (chest.value?.compressing === false ? chest.value.breaths : 0),
);

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
/**
 * How far round the ring is. On the bag's own time: full before the first
 * breath and once the gap has passed. On hers: as far as she has counted.
 */
const due = computed(() => {
  if (standing.value) return 0;
  if (cycle.value) return paused.value ? 1 : compressed.value / CPR.compressions;
  return waited.value === null ? 1 : Math.min(1, waited.value / BREATH.everySec);
});
/** The ring stands white: a breath is due, or her pause is waiting for one. */
const isDue = computed(() => (cycle.value ? paused.value : !standing.value && due.value >= 1));
const count = computed(() => {
  if (standing.value) return '';
  if (cycle.value) return String(paused.value ? breathsWanted.value : compressed.value);
  return waited.value === null ? '' : String(Math.floor(waited.value));
});
/** The bag is in the hand but a breath is not the next thing: she is compressing, or nobody is. */
const resting = computed(() => standing.value || (cycle.value && !paused.value));
/** Her pause has just begun and has had no breath yet: the bag is wanted this instant. */
const called = computed(() => paused.value && breathsWanted.value === CPR.breaths);
const sweep = computed(() => Math.min(1, held.value / SWEEP_SEC));

/** The latest breath, and which of the page's two numbers it missed. Nothing while the next is being squeezed. */
const last = computed(() => (down.value ? null : props.run.lastBreath.value));
/** One of the cycle's breaths is not held to the bag's six seconds: a pause's two come one after the other. */
const cycleBreath = computed(() => last.value?.cycle !== undefined);
const missed = computed(() => {
  const breath = last.value;
  return {
    gap: breath !== null && !cycleBreath.value && !gapOnPace(breath.gap),
    hold: breath !== null && !holdOnPace(breath.held),
  };
});

/**
 * The pause she has just come back from without its breaths: how many it
 * got. Null once a breath has been squeezed since, or once this set is no
 * longer the one that followed it.
 */
const shortPause = computed(() => {
  const now = chest.value;
  if (down.value || !cycle.value || !now?.compressing) return null;
  const pause = props.run.pauses.value.at(-1);
  if (!pause || pause.ended === null || pause.breaths >= CPR.breaths) return null;
  const setBegan = props.run.t.value - now.elapsed;
  if (Math.abs(setBegan - pause.ended) >= 0.01) return null;
  const breath = last.value;
  return breath === null || breath.t <= pause.ended ? pause.breaths : null;
});
/** The line under the pad states something that was off the page, so it is set in the stronger type. */
const offPage = computed(
  () =>
    !standing.value &&
    (missed.value.gap ||
      missed.value.hold ||
      shortPause.value !== null ||
      (cycle.value && last.value?.cycle === 'compressions')),
);

/** Whole seconds, as the ring counted them; under one second, to the tenth. */
function gapSeconds(gap: number): string {
  return gap < 1 ? gap.toFixed(1) : String(Math.floor(gap));
}

const capital = (line: string): string => line.charAt(0).toUpperCase() + line.slice(1);

/** What the breath was. A fact and nothing more: the page's words beside it say the rest. */
const fact = computed(() => {
  // With nobody on his chest the bag's six seconds are not the page he is on.
  if (standing.value) return '';
  if (shortPause.value !== null) {
    return shortPause.value === 0
      ? 'No breaths in the pause'
      : `${shortPause.value} of ${CPR.breaths} breaths in the pause`;
  }
  const breath = last.value;
  if (!breath) return '';
  if (breath.cycle === 'compressions') return cycle.value ? 'Breath during compressions' : '';
  if (breath.cycle === 'pause') {
    if (!cycle.value) return '';
    const nth = Math.min(CPR.breaths, props.run.pauses.value.at(-1)?.breaths ?? 1);
    const held = missed.value.hold ? `, held ${breath.held.toFixed(1)} s` : '';
    return `Breath ${nth} of ${CPR.breaths}${held}`;
  }
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
  return capital(parts.join(', '));
});

const BVM_PAGE = 'BVM page';
const ARREST_PAGE = 'Cardiac arrest page';

/**
 * The page's words for what was missed, under the name of the page that
 * says them; in a practice run, its line whatever the breath. In the cycle
 * that line is the arrest page's, and a breath's length is still the BVM
 * page's.
 */
const pageWords = computed<{ page: string; words: string } | null>(() => {
  if (standing.value) return null;
  if (cycle.value) {
    if (props.coached) return { page: ARREST_PAGE, words: CPR_WORDS.until };
    if (shortPause.value !== null || last.value?.cycle === 'compressions') {
      return { page: ARREST_PAGE, words: CPR_WORDS.ratio };
    }
    return missed.value.hold && cycleBreath.value
      ? { page: BVM_PAGE, words: BREATH_WORDS.over }
      : null;
  }
  if (props.coached) return { page: BVM_PAGE, words: PAGE_LINE };
  if (cycleBreath.value) return null;
  const { gap, hold } = missed.value;
  if (gap && hold) return { page: BVM_PAGE, words: BREATH_WORDS.both };
  if (gap) return { page: BVM_PAGE, words: BREATH_WORDS.every };
  return hold ? { page: BVM_PAGE, words: BREATH_WORDS.over } : null;
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
        <div class="ring" :class="{ 'is-due': isDue, 'is-held': down }" aria-hidden="true">
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
          :class="{ 'is-down': down, 'is-resting': resting, 'is-called': called }"
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
        <!-- Her hands are on the chest, or about to be: there is nobody to hand the bag to. -->
        <button
          v-if="!chest && !pulseless"
          type="button"
          class="pill hand"
          :disabled="!earned"
          @click="run.handBag('da')"
        >
          <span>DA takes the bag</span>
          <span v-if="!earned" class="hand-why">
            On pace {{ run.paceRun.value }} of {{ HAND_OVER_AFTER }}
          </span>
        </button>
      </div>
      <div class="hint" :class="{ 'is-coached': coached }">
        <p class="fact" :class="{ 'is-off': offPage }">{{ fact }}</p>
        <p v-if="pageWords" class="page-line">
          <span class="eyebrow">{{ pageWords.page }}</span> {{ pageWords.words }}
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
/*
 * While she is compressing, or nobody is, the bag is at rest in the hand:
 * still his to squeeze, but not the way forward. It is the white button again
 * the moment her pause wants its breaths.
 */
.squeeze.is-resting:not(.is-down) {
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  transition:
    transform var(--dur-150) var(--ease-standard),
    background var(--dur-250) var(--ease-standard);
}
/* Called for, it is white at once: her pause does not wait for a fade meant for a breath just let go. */
.squeeze.is-called:not(.is-down) {
  transition:
    transform var(--dur-150) var(--ease-standard),
    background var(--dur-150) var(--ease-standard);
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
