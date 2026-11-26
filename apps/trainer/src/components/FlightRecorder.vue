<script setup lang="ts">
import { computed } from 'vue';

import { pressureFell, pressureRange, readings } from '@/engine/recorder';
import type { CutRecord, LogEntry, Sample } from '@/engine/types';
import { fmtClock } from '@/time';

/**
 * The run as a trace: oxygen saturation over the time that was played, with
 * a pin where the team did something and a break where the story skipped a
 * protocol wait. Under it, the systolic pressure, in a run where it fell: a
 * patient lost to his pressure must not leave a debrief that only shows a
 * saturation that barely changed.
 *
 * Where he had no pulse the oximeter read nothing, so nothing is drawn: the
 * trace stops, the stretch is shaded, and what the team did in it is pinned
 * along the foot of the chart, where a pin stands for a time and no value.
 */
const props = defineProps<{
  history: ReadonlyArray<Sample>;
  cuts: ReadonlyArray<CutRecord>;
  log: ReadonlyArray<LogEntry>;
}>();

const W = 600;
const H = 184;
const LEFT = 34;
const RIGHT = 10;
const TOP = 12;
const BOTTOM = 40;
const LOW = 60;
const HIGH = 100;
const LIMIT = 90;

/** Story seconds with the skipped waits taken out, so the chart is time actually played. */
function played(t: number): number {
  return props.cuts.reduce((acc, cut) => (t > cut.at ? acc - cut.seconds : acc), t);
}

const span = computed(() => Math.max(30, played(props.history.at(-1)?.t ?? 0)));
const x = (t: number): number => LEFT + ((W - LEFT - RIGHT) * played(t)) / span.value;
const y = (spo2: number): number =>
  TOP + (H - TOP - BOTTOM) * (1 - (Math.min(HIGH, Math.max(LOW, spo2)) - LOW) / (HIGH - LOW));

/**
 * One polyline per stretch between cuts: the trace does not draw across a
 * skip. Nor across a stretch with no pulse, where there was no reading.
 */
function traceOf(height: (s: Sample) => number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let lastCut = -1;
  for (const s of props.history) {
    const cutIndex = props.cuts.filter((c) => s.t > c.at).length;
    if ((cutIndex !== lastCut || s.pulseless) && current.length > 0) {
      out.push(current.join(' '));
      current = [];
    }
    lastCut = cutIndex;
    if (!s.pulseless) current.push(`${x(s.t).toFixed(1)},${height(s).toFixed(1)}`);
  }
  if (current.length > 0) out.push(current.join(' '));
  return out;
}

/** Each stretch with no pulse, from the sample that lost it to the one that found it again. */
const noPulse = computed(() => {
  const out: Array<{ from: number; to: number }> = [];
  let from: number | null = null;
  for (const s of props.history) {
    if (s.pulseless && from === null) from = s.t;
    if (!s.pulseless && from !== null) {
      out.push({ from, to: s.t });
      from = null;
    }
  }
  const end = props.history.at(-1)?.t;
  if (from !== null && end !== undefined) out.push({ from, to: end });
  return out.map((band) => ({
    ...band,
    x: x(band.from),
    width: Math.max(1, x(band.to) - x(band.from)),
  }));
});

/**
 * One label for each kind of cut, at the first of them, with how many there
 * were when it came more than once: the same card several rounds running
 * would otherwise be written over itself along the foot of the chart.
 */
const cutLabels = computed(() => {
  const out: Array<{ at: number; title: string; times: number }> = [];
  for (const cut of props.cuts) {
    const seen = out.find((label) => label.title === cut.title);
    if (seen) seen.times += 1;
    else out.push({ at: cut.at, title: cut.title, times: 1 });
  }
  return out.map((label) => ({
    at: label.at,
    text: label.times > 1 ? `${label.title} ×${label.times}` : label.title,
  }));
});

/** A pin in a stretch with no reading stands at the foot of the chart. */
const FOOT = H - BOTTOM - 7;
const unread = (t: number): boolean => noPulse.value.some((band) => t >= band.from && t < band.to);

const segments = computed(() => traceOf((s) => y(s.spo2)));

const PH = 118;
const PTOP = 10;
const PBOTTOM = 10;
const STEP = 20;

const showPressure = computed(() => pressureFell(props.history));
/** The scale is the run's own range, opened out to the gridlines either side. */
const pressure = computed(() => {
  const range = pressureRange(props.history) ?? { low: 80, high: 120 };
  const low = Math.floor(range.low / STEP) * STEP;
  const high = Math.max(low + STEP, Math.ceil(range.high / STEP) * STEP);
  const marks: number[] = [];
  const every = high - low > 100 ? STEP * 2 : STEP;
  for (let v = low; v <= high; v += every) marks.push(v);
  return { low, high, marks, lowest: range.low };
});
const py = (sbp: number): number => {
  const { low, high } = pressure.value;
  return (
    PTOP + (PH - PTOP - PBOTTOM) * (1 - (Math.min(high, Math.max(low, sbp)) - low) / (high - low))
  );
};
const pressureSegments = computed(() => traceOf((s) => py(s.sbp)));
const lowestPressure = computed(() => {
  const read = readings(props.history);
  let low = read[0];
  for (const s of read) if (!low || s.sbp < low.sbp) low = s;
  return low;
});
const pressureSummary = computed(
  () => `Systolic pressure over ${fmtClock(span.value)} of play. Lowest ${pressure.value.lowest}.`,
);

function spo2At(t: number): number {
  let best = props.history[0];
  for (const s of props.history) {
    if (s.t <= t) best = s;
    else break;
  }
  return best?.spo2 ?? HIGH;
}

const pins = computed(() =>
  props.log
    .filter((entry) => entry.tone !== 'neutral')
    .map((entry) => ({
      cx: x(entry.t),
      cy: unread(entry.t) ? FOOT : y(spo2At(entry.t)),
      tone: entry.tone,
      text: entry.text,
    })),
);

/** The lowest saturation that was read. */
const lowest = computed(() => {
  const read = readings(props.history);
  let low = read[0];
  for (const s of read) if (!low || s.spo2 < low.spo2) low = s;
  return low;
});

/**
 * Where a "lowest" label goes beside its point: after it, or before it when
 * the point is at the right-hand edge and the label would run off the chart.
 */
function beside(px: number): { x: number; anchor: 'start' | 'end' } {
  return px > W - RIGHT - 44 ? { x: px - 8, anchor: 'end' } : { x: px + 8, anchor: 'start' };
}

const summary = computed(
  () =>
    `Oxygen saturation over ${fmtClock(span.value)} of play. Lowest ${lowest.value?.spo2 ?? '--'} percent.${
      noPulse.value.length > 0 ? ' No reading while he had no pulse.' : ''
    }`,
);
</script>

<template>
  <figure class="recorder">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary">
      <rect
        v-for="band in noPulse"
        :key="`n${band.from}`"
        class="unread"
        :x="band.x"
        :y="TOP"
        :width="band.width"
        :height="H - TOP - BOTTOM"
      />
      <g class="grid">
        <line
          v-for="v in [70, 80, 100]"
          :key="v"
          :x1="LEFT"
          :x2="W - RIGHT"
          :y1="y(v)"
          :y2="y(v)"
        />
        <text
          v-for="v in [70, 80, 90, 100]"
          :key="`t${v}`"
          :x="LEFT - 6"
          :y="y(v) + 4"
          text-anchor="end"
        >
          {{ v }}
        </text>
      </g>
      <line class="limit" :x1="LEFT" :x2="W - RIGHT" :y1="y(LIMIT)" :y2="y(LIMIT)" />
      <g v-for="cut in cuts" :key="cut.at" class="cut">
        <line :x1="x(cut.at)" :x2="x(cut.at)" :y1="TOP" :y2="H - BOTTOM" />
      </g>
      <g class="cut">
        <text
          v-for="(label, i) in cutLabels"
          :key="label.at"
          :x="x(label.at) + (x(label.at) > W * 0.6 ? -4 : 4)"
          :y="H - BOTTOM + 15 + (i % 2) * 14"
          :text-anchor="x(label.at) > W * 0.6 ? 'end' : 'start'"
        >
          {{ label.text }}
        </text>
      </g>
      <polyline v-for="(points, i) in segments" :key="i" class="trace" :points="points" />
      <circle
        v-for="(pin, i) in pins"
        :key="i"
        class="pin"
        :class="`pin--${pin.tone}`"
        :cx="pin.cx"
        :cy="pin.cy"
        r="4.5"
      >
        <title>{{ pin.text }}</title>
      </circle>
      <text
        v-if="lowest"
        class="low"
        :x="beside(x(lowest.t)).x"
        :text-anchor="beside(x(lowest.t)).anchor"
        :y="Math.min(H - BOTTOM - 4, y(lowest.spo2) + 16)"
      >
        {{ lowest.spo2 }}%
      </text>
    </svg>
    <svg
      v-if="showPressure"
      class="pressure"
      :viewBox="`0 0 ${W} ${PH}`"
      role="img"
      :aria-label="pressureSummary"
    >
      <g class="grid">
        <line
          v-for="v in pressure.marks"
          :key="v"
          :x1="LEFT"
          :x2="W - RIGHT"
          :y1="py(v)"
          :y2="py(v)"
        />
        <text
          v-for="v in pressure.marks"
          :key="`t${v}`"
          :x="LEFT - 6"
          :y="py(v) + 4"
          text-anchor="end"
        >
          {{ v }}
        </text>
      </g>
      <rect
        v-for="band in noPulse"
        :key="`n${band.from}`"
        class="unread"
        :x="band.x"
        :y="PTOP"
        :width="band.width"
        :height="PH - PTOP - PBOTTOM"
      />
      <g v-for="cut in cuts" :key="cut.at" class="cut">
        <line :x1="x(cut.at)" :x2="x(cut.at)" :y1="PTOP" :y2="PH - PBOTTOM" />
      </g>
      <polyline
        v-for="(points, i) in pressureSegments"
        :key="i"
        class="trace trace--pressure"
        :points="points"
      />
      <text
        v-if="lowestPressure"
        class="low"
        :x="beside(x(lowestPressure.t)).x"
        :text-anchor="beside(x(lowestPressure.t)).anchor"
        :y="Math.max(PTOP + 12, py(lowestPressure.sbp) - 6)"
      >
        {{ pressure.lowest }}
      </text>
    </svg>
    <figcaption class="legend">
      <span><i class="key key--trace"></i>SpO₂</span>
      <span><i class="key key--limit"></i>Alarm limit 90</span>
      <span v-if="noPulse.length > 0"><i class="key key--unread"></i>No pulse: no reading</span>
      <span v-if="showPressure"><i class="key key--pressure"></i>Systolic pressure</span>
      <span><i class="key key--good"></i>▲ Helped</span>
      <span><i class="key key--bad"></i>▼ Got worse</span>
    </figcaption>
    <p v-if="showPressure" class="note">
      The pressure drawn is the patient’s own, whether or not the cuff was cycled.
    </p>
  </figure>
</template>

<style scoped>
.recorder {
  margin: 0;
  padding: var(--sp-3) var(--sp-3) var(--sp-2);
  border-radius: var(--r-lg);
  background: var(--color-card-bg);
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
.grid line {
  stroke: var(--color-border);
  stroke-width: 1;
}
.grid text,
.cut text {
  fill: var(--color-text-tertiary);
  font-size: 11px;
  font-family: var(--font-mono);
}
.limit {
  stroke: var(--mon-alarm);
  stroke-width: 1.2;
  stroke-dasharray: 5 4;
}
.cut line {
  stroke: var(--train);
  stroke-width: 1.2;
  stroke-dasharray: 2 4;
}
.cut text {
  fill: var(--train);
}
.trace {
  fill: none;
  stroke: var(--mon-spo2);
  stroke-width: 2.4;
  stroke-linejoin: round;
  stroke-linecap: round;
}
/* The oximeter read nothing here: a shade, and no line through it. */
.unread {
  fill: var(--color-surface-elevated);
}
.pressure {
  margin-top: var(--sp-2);
}
.trace--pressure {
  stroke: var(--mon-nibp);
  stroke-width: 2;
}
.note {
  margin: var(--sp-1) 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
}
.pin {
  stroke: var(--color-bg);
  stroke-width: 1.5;
}
.pin--good {
  fill: var(--color-good);
}
.pin--bad {
  fill: var(--color-danger);
}
.low {
  fill: var(--color-text-primary);
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-1);
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.key {
  display: inline-block;
  width: 12px;
  height: 3px;
  margin-right: 5px;
  vertical-align: middle;
  border-radius: 2px;
}
.key--trace {
  background: var(--mon-spo2);
}
.key--limit {
  background: var(--mon-alarm);
}
.key--pressure {
  background: var(--mon-nibp);
}
.key--unread {
  height: 10px;
  background: var(--color-surface-overlay);
}
.key--good,
.key--bad {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.key--good {
  background: var(--color-good);
}
.key--bad {
  background: var(--color-danger);
}
</style>
