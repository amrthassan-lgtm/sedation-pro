<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';
import { useRouter } from 'vue-router';

import { unlockAlarms } from '@/audio/alarm';
import FlightRecorder from '@/components/FlightRecorder.vue';
import { formatMass } from '@/engine/dose';
import type { DebriefRow, RowResult } from '@/engine/grade';
import { pageShortName } from '@/engine/protocol';
import type { DoseEvent } from '@/engine/types';
import { findScenario } from '@/scenarios';
import { lastRun, settings } from '@/session';
import { fmtClock, toneMark } from '@/time';

/**
 * Two things, kept apart. "What happened to the patient" is the story the
 * simulator told. "Against your protocols" is the practice's own written
 * steps, printed word for word, each marked by what the team did. The
 * trainer adds no advice of its own to either.
 */
const router = useRouter();
const run = lastRun.value;
const debrief = run?.debrief;
const scenario = debrief ? findScenario(debrief.scenarioId) : undefined;

onMounted(() => {
  if (!run || !scenario) void router.replace('/');
});

const STATUS: Readonly<Record<RowResult, string>> = {
  done: 'Done',
  partial: 'Partly done',
  missed: 'Not done',
  na: 'Not reached',
};

interface StepView {
  readonly index: number;
  readonly text: string;
  /** `null` when this run did not exercise the step. */
  readonly row: DebriefRow | null;
  readonly notes: ReadonlyArray<DebriefRow>;
  /** The pages the step itself sends the reader to, as the clinical app links them. */
  readonly goTo: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

interface ProtocolView {
  readonly id: string;
  readonly name: string;
  readonly steps: ReadonlyArray<StepView>;
}

const protocols = computed<ProtocolView[]>(() => {
  if (!debrief || !scenario) return [];
  return scenario.protocols.flatMap((id) => {
    const protocol = findProtocol(id);
    if (!protocol) return [];
    const rows = debrief.rows.filter((r) => r.protocolId === id);
    return [
      {
        id,
        name: protocol.name,
        steps: protocol.steps.map((step, index) => ({
          index,
          text: step.text,
          row: rows.find((r) => r.kind === 'step' && r.stepIndex === index) ?? null,
          notes: rows.filter((r) => r.kind === 'note' && r.stepIndex === index),
          goTo: (step.goTo ?? [])
            .filter((to) => findProtocol(to))
            .map((to) => ({ id: to, name: pageShortName(to) })),
        })),
      },
    ];
  });
});

/**
 * The run before, stated as it was. Not a difference: the number of steps a
 * run reaches changes with the path it took, so "+2" could mean 5 of 7 after
 * 3 of 4.
 */
const lastSteps = computed(() => {
  const prev = run?.previous;
  return prev ? `Last run ${prev.done} of ${prev.of}` : '';
});

const lastSpo2 = computed(() => {
  const prev = run?.previous;
  return prev ? `Last run ${prev.lowestSpo2}%` : '';
});

const TAKEAWAY_HEADING = ['', 'One thing', 'Two things', 'Three things'] as const;
const takeawayHeading = computed(
  () => `${TAKEAWAY_HEADING[debrief?.takeaways.length ?? 0] ?? 'Things'} for the team`,
);

function doseText(dose: DoseEvent): string {
  const how = dose.device === null ? `${dose.ml.toFixed(1)} ml ${dose.route}` : dose.route;
  return `${dose.drugName} ${formatMass(dose.mcg)}, ${how}`;
}

function again(): void {
  if (!scenario) return;
  if (settings.sound) unlockAlarms();
  void router.push(`/room/${scenario.id}`);
}
</script>

<template>
  <main v-if="run && debrief && scenario" class="page">
    <header class="hero">
      <p class="eyebrow">
        Debrief · “{{ scenario.title }}”<template v-if="run.practice"> · practice run</template>
      </p>
      <h1 class="hero-title">{{ debrief.ending.title }}</h1>
      <p class="hero-sub">{{ debrief.ending.text }}</p>
    </header>

    <section>
      <p class="eyebrow section-label">What happened to the patient</p>
      <div class="stats">
        <div class="stat">
          <span class="eyebrow">Lowest SpO₂</span>
          <span class="stat-val mono">{{ debrief.lowestSpo2 }}%</span>
          <span class="stat-sub">{{ lastSpo2 }}</span>
        </div>
        <div class="stat">
          <span class="eyebrow">Protocol steps</span>
          <span class="stat-val mono">{{ debrief.done }} of {{ debrief.of }}</span>
          <span class="stat-sub">{{ lastSteps }}</span>
        </div>
        <div class="stat">
          <span class="eyebrow">Story time</span>
          <span class="stat-val mono">{{ fmtClock(debrief.seconds) }}</span>
          <span class="stat-sub">{{ debrief.clean ? 'Clean run' : '' }}</span>
        </div>
      </div>
      <FlightRecorder :history="run.history" :cuts="run.cuts" :log="run.log" />
    </section>

    <section v-if="debrief.takeaways.length > 0">
      <p class="eyebrow section-label">{{ takeawayHeading }}</p>
      <div class="group">
        <div v-for="row in debrief.takeaways" :key="row.id" class="row take">
          <span class="row-main">
            <span class="row-title">{{ row.text }}</span>
            <span class="row-sub"
              >{{ row.protocolName }} · {{ STATUS[row.result].toLowerCase() }}</span
            >
          </span>
        </div>
      </div>
    </section>

    <section v-for="p in protocols" :key="p.id">
      <p class="eyebrow section-label">Against your protocol · {{ p.name }}</p>
      <div class="group">
        <div
          v-for="step in p.steps"
          :key="step.index"
          class="row step"
          :class="[
            `is-${step.row?.result ?? 'out'}`,
            { 'is-optional': step.row?.tier === 'extra' },
          ]"
        >
          <span class="step-n mono">{{ step.index + 1 }}</span>
          <span class="row-main">
            <span class="step-text">{{ step.text }}</span>
            <span v-if="step.row && step.row.parts.length > 0" class="parts">
              <span
                v-for="part in step.row.parts"
                :key="part.quote"
                class="part"
                :class="`is-${part.result}`"
              >
                {{ part.result === 'done' ? '✓' : part.result === 'missed' ? '✕' : '·' }}
                {{ part.quote }}
              </span>
            </span>
            <span
              v-for="note in step.notes"
              :key="note.id"
              class="part"
              :class="`is-${note.result}`"
            >
              {{ note.result === 'done' ? '✓' : note.result === 'missed' ? '✕' : '·' }}
              {{ note.text }}
            </span>
            <span v-if="step.goTo.length > 0" class="gos">
              <a
                v-for="to in step.goTo"
                :key="to.id"
                class="go"
                :href="`../quick-reference/${to.id}`"
                >Go to {{ to.name }} ›</a
              >
            </span>
          </span>
          <span class="step-state">
            <template v-if="step.row">
              {{ STATUS[step.row.result]
              }}<template v-if="step.row.tier === 'extra'"> · add-on</template>
              <span v-if="step.row.at !== null" class="mono step-at">{{
                fmtClock(step.row.at)
              }}</span>
            </template>
            <template v-else>Not part of this run</template>
          </span>
        </div>
      </div>
      <a class="open" :href="`../quick-reference/${p.id}`">Open this protocol in Sedation Pro</a>
    </section>

    <section v-if="debrief.outside.length > 0">
      <p class="eyebrow section-label">Given, and not in these protocols</p>
      <div class="group">
        <div v-for="(dose, i) in debrief.outside" :key="i" class="row log">
          <span class="mono log-t">{{ fmtClock(dose.t) }}</span>
          <span class="row-main">{{ doseText(dose) }}</span>
        </div>
      </div>
    </section>

    <section>
      <p class="eyebrow section-label">Timeline</p>
      <div class="group">
        <div v-for="(entry, i) in run.log" :key="i" class="row log" :class="`tone-${entry.tone}`">
          <span class="mono log-t">{{ fmtClock(entry.t) }}</span>
          <span class="row-main">{{ toneMark(entry.tone) }}{{ entry.text }}</span>
        </div>
      </div>
    </section>

    <div class="actions">
      <button type="button" class="btn btn--key btn--tall btn--block" @click="again">
        Run it again
      </button>
      <button type="button" class="btn btn--block" @click="router.push('/')">Scenarios</button>
    </div>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
}
.hero-title {
  margin: 0;
  font-size: var(--type-display);
  line-height: var(--leading-tight);
  text-wrap: balance;
}
.hero-sub {
  margin: 0;
  color: var(--color-text-secondary);
  max-width: 60ch;
}
.section-label {
  margin: 0 0 var(--sp-2) var(--sp-4);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-lg);
  background: var(--color-card-bg);
}
.stat-val {
  font-size: var(--type-display);
  font-weight: var(--weight-bold);
  line-height: 1.1;
}
.stat-sub {
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
  min-height: 1.3em;
}
.step {
  align-items: flex-start;
  gap: var(--sp-3);
}
.step-n {
  flex: none;
  width: 24px;
  color: var(--color-text-tertiary);
  font-weight: var(--weight-bold);
}
.step-text {
  display: block;
  font-weight: var(--weight-medium);
}
.step-state {
  flex: none;
  max-width: 34%;
  text-align: right;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.step-at {
  font-weight: var(--weight-regular);
  color: var(--color-text-tertiary);
}
.step.is-done .step-state {
  color: var(--color-good);
}
.step.is-partial .step-state {
  color: var(--color-warn);
}
.step.is-missed .step-state {
  color: var(--color-danger);
}
/* An add-on the run did not need is information, not a miss. */
.step.is-missed.is-optional .step-state {
  color: var(--color-text-tertiary);
}
.step.is-out .step-text,
.step.is-na .step-text {
  color: var(--color-text-tertiary);
  font-weight: var(--weight-regular);
}
.parts {
  display: block;
}
.part {
  display: block;
  margin-top: 4px;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.part.is-done {
  color: var(--color-good);
}
.part.is-missed {
  color: var(--color-danger);
}
.take .row-title {
  display: block;
}
.open {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-left: var(--sp-4);
  color: var(--color-accent);
  font-size: var(--type-footnote);
}
.gos {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--sp-5);
}
.go {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-accent);
  font-size: var(--type-footnote);
}
.log {
  min-height: 44px;
  padding-block: var(--sp-2);
}
.log-t {
  flex: none;
  width: 44px;
  color: var(--color-text-tertiary);
}
.tone-good .row-main {
  color: var(--color-good);
}
.tone-bad .row-main {
  color: var(--color-danger);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-bottom: var(--sp-5);
}
</style>
