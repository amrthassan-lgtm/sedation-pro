<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { MonitorView } from '@/engine/types';

/**
 * The bedside monitor. It only draws what the engine reports: three sweeping
 * traces, four numbers and a cuff pressure with its age. It makes no sound
 * of its own; alarms are played by the run, and there is no pulse tone.
 */
const props = defineProps<{
  monitor: MonitorView;
  /** Scenario seconds, for the age of the cuff reading. */
  t: number;
  /** Story clock, "10:42:07". */
  clock: string;
  /** Traces sweep only while the run is live. */
  live: boolean;
  alarmPaused: boolean;
}>();

const emit = defineEmits<{ (e: 'cuff'): void; (e: 'pauseAlarm'): void }>();

const ecg = ref<HTMLCanvasElement | null>(null);
const pleth = ref<HTMLCanvasElement | null>(null);
const co2 = ref<HTMLCanvasElement | null>(null);

const alarmText = computed(() => {
  const a = props.monitor.alarms;
  if (a.includes('apnea')) return 'APNEA · NO CO₂ WAVEFORM';
  if (a.includes('spo2_low')) return 'SpO₂ LOW';
  return '';
});

const nibpAge = computed(() => {
  if (props.monitor.cuffCycling) return 'measuring…';
  const reading = props.monitor.nibp;
  if (!reading) return '';
  const sec = Math.max(0, Math.round(props.t - reading.at));
  if (sec < 10) return 'just now';
  return sec < 60 ? `${sec} s ago` : `${Math.floor(sec / 60)} min ago`;
});

// ---------------------------------------------------------------- traces

interface Trace {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x: number;
  prevY: number | null;
  color: string;
  /** CSS pixels per second. */
  speed: number;
  sample: () => number;
}

const bell = (x: number, mid: number, width: number): number =>
  Math.exp(-((x - mid) ** 2) / (2 * width * width));

let beat = 0;
let breath = 0;
let traces: Trace[] = [];
let raf = 0;
let last = 0;

function ecgSample(): number {
  if (props.monitor.rhythm === 'vtach') return 0.5 + 0.45 * Math.sin(beat * 2 * Math.PI);
  const p = beat;
  return (
    0.12 * bell(p, 0.1, 0.025) -
    0.12 * bell(p, 0.2, 0.008) +
    1.0 * bell(p, 0.22, 0.011) -
    0.25 * bell(p, 0.245, 0.01) +
    0.25 * bell(p, 0.45, 0.05)
  );
}

function plethSample(): number {
  const p = (beat + 0.85) % 1;
  return props.monitor.perfusion * (0.9 * bell(p, 0.18, 0.07) + 0.35 * bell(p, 0.42, 0.08));
}

/** One breath, 0..1. Expiration is the first 55% of the cycle. */
function co2Sample(): number {
  const m = props.monitor;
  if (m.capno === 'flat' || m.etco2 === null || m.rr <= 0) return 0;
  const height = Math.min(1, m.etco2 / 70);
  const p = breath;
  if (p < 0.06 || p >= 0.6) return 0;
  if (m.capno === 'sharkfin') {
    // Obstructed airways empty slowly: a long curved upstroke with no flat top.
    if (p < 0.55) return height * (1 - Math.exp(-3.2 * ((p - 0.06) / 0.49))) * 1.04;
    return height * (1 - (p - 0.55) / 0.05);
  }
  if (p < 0.13) return height * 0.86 * ((p - 0.06) / 0.07);
  if (p < 0.55) return height * (0.86 + 0.14 * ((p - 0.13) / 0.42));
  return height * (1 - (p - 0.55) / 0.05);
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function setUp(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bg = cssVar('--mon-bg', '#04070c');
  const rows: Array<[HTMLCanvasElement | null, string, number, () => number]> = [
    [ecg.value, cssVar('--mon-ecg', '#4ade80'), 110, ecgSample],
    [pleth.value, cssVar('--mon-spo2', '#38bdf8'), 110, plethSample],
    [co2.value, cssVar('--mon-co2', '#facc15'), 34, co2Sample],
  ];
  traces = [];
  for (const [canvas, color, speed, sample] of rows) {
    if (!canvas) continue;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    traces.push({ canvas, ctx, x: 0, prevY: null, color, speed: speed * dpr, sample });
  }
}

/** The pen never moves more than this many device pixels between samples, so a narrow R wave is never stepped over. */
const MAX_PEN_STEP = 1.5;

function draw(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (props.live && traces.length > 0) {
    const m = props.monitor;
    const bg = cssVar('--mon-bg', '#04070c');
    const fastest = Math.max(...traces.map((tr) => tr.speed));
    const steps = Math.max(1, Math.ceil((fastest * dt) / MAX_PEN_STEP));
    const sub = dt / steps;
    for (const tr of traces) {
      // The erase bar runs just ahead of the pen, as on a real sweep display.
      tr.ctx.fillStyle = bg;
      tr.ctx.fillRect(tr.x, 0, tr.speed * dt + 14, tr.canvas.height);
      tr.ctx.strokeStyle = tr.color;
      tr.ctx.lineWidth = Math.max(2, tr.canvas.height / 44);
      tr.ctx.lineJoin = 'round';
      tr.ctx.lineCap = 'round';
      tr.ctx.beginPath();
      if (tr.prevY !== null) tr.ctx.moveTo(tr.x, tr.prevY);
    }
    for (let i = 0; i < steps; i += 1) {
      beat = (beat + (sub * Math.max(20, m.hr)) / 60) % 1;
      breath = m.rr > 0 ? (breath + (sub * m.rr) / 60) % 1 : 0.9;
      for (const tr of traces) {
        const h = tr.canvas.height;
        const y = h * 0.84 - tr.sample() * h * 0.66;
        const next = tr.x + tr.speed * sub;
        if (next > tr.canvas.width) {
          tr.ctx.stroke();
          tr.ctx.beginPath();
          tr.x = 0;
          tr.prevY = null;
          continue;
        }
        if (tr.prevY === null) tr.ctx.moveTo(next, y);
        else tr.ctx.lineTo(next, y);
        tr.prevY = y;
        tr.x = next;
      }
    }
    for (const tr of traces) tr.ctx.stroke();
  }
  raf = requestAnimationFrame(draw);
}

let resize: ResizeObserver | null = null;

onMounted(() => {
  setUp();
  last = performance.now();
  raf = requestAnimationFrame(draw);
  if (typeof ResizeObserver !== 'undefined' && ecg.value) {
    resize = new ResizeObserver(setUp);
    resize.observe(ecg.value);
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  resize?.disconnect();
});

// A trace must not keep the tail of a rhythm that has ended.
watch(
  () => props.monitor.rhythm,
  () => {
    for (const tr of traces) tr.prevY = null;
  },
);
</script>

<template>
  <section class="monitor" :class="`is-${monitor.alarmLevel}`" aria-label="Patient monitor">
    <header class="mon-head mono">
      <span class="mon-id">TRAINING</span>
      <span>ADULT</span>
      <span class="mon-clock">{{ clock }}</span>
    </header>

    <div class="mon-alarm mono" role="status">
      <span v-if="alarmText" class="mon-alarm-text">{{ alarmText }}</span>
      <button
        v-if="alarmText"
        type="button"
        class="mon-key"
        :disabled="alarmPaused"
        @click="emit('pauseAlarm')"
      >
        {{ alarmPaused ? 'Audio paused' : 'Alarm pause' }}
      </button>
    </div>

    <div class="mon-grid">
      <div class="wave">
        <span class="tag mono ecg">II</span>
        <canvas ref="ecg" aria-hidden="true"></canvas>
      </div>
      <div class="num ecg">
        <span class="lab mono">HR</span>
        <span class="val mono">{{ monitor.hr }}</span>
      </div>

      <div class="wave">
        <span class="tag mono spo2">PLETH</span>
        <canvas ref="pleth" aria-hidden="true"></canvas>
      </div>
      <div class="num spo2" :class="{ 'is-low': monitor.alarms.includes('spo2_low') }">
        <span class="lab mono">SpO₂</span>
        <span class="val mono">{{ monitor.spo2 }}</span>
      </div>

      <div class="wave">
        <span class="tag mono co2">CO₂</span>
        <canvas ref="co2" aria-hidden="true"></canvas>
      </div>
      <div class="num co2" :class="{ 'is-low': monitor.alarms.includes('apnea') }">
        <span class="lab mono">EtCO₂</span>
        <span class="val mono">{{ monitor.etco2 ?? '--' }}</span>
        <span class="rr mono">
          <span class="lab">RR</span> {{ monitor.rr }}
          <span v-if="monitor.bagged" class="rr-note">bagged</span>
        </span>
      </div>
    </div>

    <button type="button" class="nibp" @click="emit('cuff')">
      <span class="lab mono">NIBP</span>
      <span class="nibp-val mono">
        {{ monitor.nibp ? `${monitor.nibp.sbp}/${monitor.nibp.dbp}` : '--/--' }}
      </span>
      <span class="nibp-age mono">{{ nibpAge }}</span>
      <span class="nibp-go mono">{{ monitor.cuffCycling ? '' : 'Start' }}</span>
    </button>
  </section>
</template>

<style scoped>
.monitor {
  position: relative;
  background: var(--mon-bg);
  border-radius: var(--r-lg);
  padding: var(--sp-2) var(--sp-3) var(--sp-2);
  box-shadow:
    inset 0 0 0 1px var(--mon-line),
    var(--shadow-md);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.mon-head {
  display: flex;
  gap: var(--sp-3);
  font-size: var(--type-caption);
  letter-spacing: 0.12em;
  color: var(--mon-dim);
}
.mon-id {
  color: var(--train);
  font-weight: var(--weight-bold);
}
.mon-clock {
  margin-left: auto;
}
.mon-alarm {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  height: 30px;
  margin-top: 2px;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.12em;
}
.mon-alarm-text {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  background: var(--mon-alarm);
  color: var(--color-text-primary);
  animation: mon-flash 1s steps(2) infinite;
}
/* A breached limit flashes yellow; no breath, or a deep desaturation, flashes red. */
.is-limit .mon-alarm-text {
  background: var(--mon-caution);
  color: var(--train-ink);
}
.mon-key {
  height: 100%;
  padding: 0 var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.mon-key:disabled {
  color: var(--mon-dim);
}
@keyframes mon-flash {
  50% {
    opacity: 0.45;
  }
}
.mon-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(92px, 22%, 168px);
  grid-template-rows: repeat(3, minmax(52px, 1fr));
  column-gap: var(--sp-3);
}
.wave {
  position: relative;
  min-height: 0;
  border-bottom: 1px solid var(--mon-line);
}
.wave canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.tag {
  position: absolute;
  left: 2px;
  top: 3px;
  z-index: 1;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
}
.num {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 1px solid var(--mon-line);
  line-height: 1;
  min-height: 0;
}
.lab {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
}
.val {
  font-size: clamp(2rem, 7.4vw, 3.6rem);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
}
.rr {
  margin-top: 2px;
  font-size: clamp(1.05rem, 3.6vw, 1.7rem);
  font-weight: var(--weight-bold);
}
.rr-note {
  font-size: var(--type-caption);
  font-weight: var(--weight-regular);
  color: var(--mon-dim);
}
.ecg {
  color: var(--mon-ecg);
}
.spo2 {
  color: var(--mon-spo2);
}
.co2 {
  color: var(--mon-co2);
}
.num.is-low .val {
  animation: mon-flash 1s steps(2) infinite;
}
.nibp {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  min-height: 44px;
  padding-top: var(--sp-2);
  color: var(--mon-nibp);
  text-align: left;
}
.nibp-val {
  font-size: var(--type-display);
  font-weight: var(--weight-bold);
}
.nibp-age {
  font-size: var(--type-caption);
  color: var(--mon-dim);
}
.nibp-go {
  margin-left: auto;
  align-self: center;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  background: var(--color-surface-overlay);
}
.nibp-go:empty {
  display: none;
}
</style>
