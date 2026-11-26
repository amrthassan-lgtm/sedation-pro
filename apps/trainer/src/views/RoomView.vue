<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import ActionDock from '@/components/ActionDock.vue';
import BagPad from '@/components/BagPad.vue';
import BenchSheet from '@/components/BenchSheet.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import DeviceSheet from '@/components/DeviceSheet.vue';
import DrawerSheet from '@/components/DrawerSheet.vue';
import DrugTraySheet from '@/components/DrugTraySheet.vue';
import MonitorPanel from '@/components/MonitorPanel.vue';
import PatientFigure from '@/components/PatientFigure.vue';
import { useRun } from '@/composables/useRun';
import { CART_ACTIONS, type ActionGroup, type CartEntry } from '@/engine/catalog';
import { findScenario, SCENARIOS } from '@/scenarios';
import { settings, saveSettings } from '@/session';
import { fmtClock, fmtStoryClock, toneMark } from '@/time';

/**
 * The room: one screen for the whole run. Eyes at the top (monitor), the
 * patient and the story in the middle, hands at the bottom. Nothing here
 * navigates away while the clock is running.
 */
const props = defineProps<{ id: string }>();
const router = useRouter();

// An unknown id falls back to the first scenario; the redirect below sends the player home.
const scenario = findScenario(props.id) ?? SCENARIOS[0]!;
const run = useRun(scenario);

type Sheet =
  | { kind: 'drawer'; group: ActionGroup }
  | { kind: 'tray' }
  | { kind: 'bench'; vialKey: string | null; syringeId: string | null }
  | { kind: 'device'; id: string }
  | { kind: 'timeline' };

const sheet = ref<Sheet | null>(null);
const intro = ref(true);

watch(sheet, (s) => {
  run.sheetOpen.value = s !== null;
});

onMounted(() => {
  if (!findScenario(props.id)) {
    void router.replace('/');
    return;
  }
  // A title card, then a quiet room: the monitor changes before anyone speaks.
  window.setTimeout(() => {
    intro.value = false;
    run.start();
  }, 1_800);
});

const storyClock = computed(() => fmtStoryClock(scenario.startsAtMin, run.t.value, true));
const cutFrom = computed(() => {
  const cut = run.cutCard.value;
  return cut ? fmtStoryClock(scenario.startsAtMin, cut.at, false) : '';
});
const cutTo = computed(() => {
  const cut = run.cutCard.value;
  return cut ? fmtStoryClock(scenario.startsAtMin, cut.at + cut.seconds, false) : '';
});

/** What is being done right now, in a few words each. */
const NOW_LABELS: Readonly<Record<string, string>> = {
  o2: '100% O₂',
  bvm: 'Bagging',
  cpap: 'Mask seal',
  jaw_thrust: 'Jaw thrust',
  larson: 'Notch pressure',
  npa: 'NPA in',
  lma: 'LMA in',
  king: 'King in',
  cpr: 'CPR',
  aed: 'AED on',
  pos_flat_legs_up: 'Flat, legs up',
  pos_sit_up: 'Sitting up',
  pos_side: 'On the side',
  stop: 'Procedure stopped',
  call_911: '911 called',
  saline: 'Saline running',
};

/** Done in a moment and over: nothing to show as still going on. */
const MOMENTARY: ReadonlySet<string> = new Set([
  'stimulate',
  'pulse_check',
  'suction',
  'encourage_cough',
  'back_blows',
  'abdominal_thrusts',
  'magill',
  'finger_sweep',
]);

const now = computed(() =>
  CART_ACTIONS.filter((a) => (a.kind === 'toggle' ? run.isOn(a.id) : run.done(a.id)))
    .filter((a) => !MOMENTARY.has(a.id))
    .map((a) => NOW_LABELS[a.id] ?? a.label),
);

const masked = computed(() => run.isOn('bvm') || run.isOn('cpap'));

/** The player's own hand on the bag: the chest then moves with each squeeze and not by itself. */
const squeezing = ref(false);
const bagInHand = computed(
  () => run.isOn('bvm') && run.bagHeldBy.value === 'player' && !run.ending.value,
);
/** A squeeze raises the chest only when the breath goes in. When it does not, he breathes as he was. */
const chestLift = computed(() =>
  bagInHand.value && run.breathGoesIn.value ? squeezing.value : null,
);

function pick(entry: CartEntry): void {
  if (entry.kind === 'action') run.act(entry.id);
  else if (entry.kind === 'device') openDevice(entry.id);
  else sheet.value = { kind: 'bench', vialKey: entry.id, syringeId: null };
}

function openDevice(id: string): void {
  if (run.remaining(id) === 0) return;
  sheet.value = { kind: 'device', id };
}

function toggleSound(): void {
  settings.sound = !settings.sound;
  saveSettings();
}

function leave(): void {
  run.stop();
  void router.push('/');
}

/**
 * Replaces the room in the history. Opening the room starts a run, so a room
 * left behind the debrief would start a new one on Back, untouched, and file
 * its arrest over the run the team had just finished.
 */
function toDebrief(): void {
  void router.replace('/debrief');
}

/** The run is over, so the one way forward takes the keyboard. */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
</script>

<template>
  <main class="room" :class="{ 'is-bagging': run.isOn('bvm') && !run.ending.value }">
    <header class="room-head">
      <span class="room-title">“{{ scenario.title }}”</span>
      <span v-if="run.practice" class="tag">Practice</span>
      <span class="room-clock mono" aria-label="Run clock">{{ fmtClock(run.t.value) }}</span>
      <button type="button" class="pill" :aria-pressed="settings.sound" @click="toggleSound">
        {{ settings.sound ? 'Sound on' : 'Sound off' }}
      </button>
      <button type="button" class="pill" @click="leave">Leave</button>
    </header>

    <MonitorPanel
      class="room-monitor"
      :monitor="run.monitor.value"
      :t="run.t.value"
      :clock="storyClock"
      :live="run.started.value && !run.ending.value && !run.cutCard.value"
      :alarm-paused="run.alarmPaused.value"
      @cuff="run.cycleCuff()"
      @pause-alarm="run.pauseAlarm()"
    />

    <p class="said" aria-live="polite">
      <template v-if="run.caption.value">
        <span class="eyebrow">{{ run.caption.value.who }}</span>
        <span class="said-line">{{ run.caption.value.line }}</span>
      </template>
    </p>

    <section class="scene">
      <PatientFigure
        class="scene-figure"
        :look="run.look.value"
        :rr="run.monitor.value.rr"
        :mask="masked"
        :lift="chestLift"
        :belly="run.belly.value"
      />
      <div class="scene-story">
        <p class="eyebrow">{{ scenario.patient.name }}</p>
        <p class="scene-text">{{ run.scene.value }}</p>
      </div>

      <div v-if="run.prompt.value" class="prompt" role="dialog" aria-label="Decision">
        <p class="prompt-line">
          <span class="eyebrow">{{ run.prompt.value.voice.who }}</span>
          {{ run.prompt.value.voice.line }}
        </p>
        <div class="prompt-options">
          <!-- One answer is the one way forward: the white button. -->
          <button
            v-for="o in run.prompt.value.options"
            :key="o.id"
            type="button"
            class="btn"
            :class="{ 'btn--key': run.prompt.value.options.length === 1 }"
            @click="run.answer(o.id)"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
    </section>

    <BagPad
      v-if="run.isOn('bvm') && !run.ending.value"
      :run="run"
      :coached="settings.coached"
      @squeezing="(down) => (squeezing = down)"
    />

    <button type="button" class="now" @click="sheet = { kind: 'timeline' }">
      <span v-for="label in now" :key="label" class="chip">{{ label }}</span>
      <span v-if="now.length === 0" class="now-empty">Nothing under way</span>
      <span class="now-more">Timeline</span>
    </button>

    <ActionDock
      :run="run"
      @drawer="(g) => (sheet = { kind: 'drawer', group: g })"
      @tray="sheet = { kind: 'tray' }"
      @pick="pick"
    />

    <DrawerSheet
      v-if="sheet?.kind === 'drawer'"
      :run="run"
      :group="sheet.group"
      @close="sheet = null"
    />
    <DrugTraySheet
      v-else-if="sheet?.kind === 'tray'"
      :run="run"
      @close="sheet = null"
      @vial="(key) => (sheet = { kind: 'bench', vialKey: key, syringeId: null })"
      @device="openDevice"
      @syringe="(id) => (sheet = { kind: 'bench', vialKey: null, syringeId: id })"
    />
    <BenchSheet
      v-else-if="sheet?.kind === 'bench'"
      :key="`${sheet.vialKey}:${sheet.syringeId}`"
      :run="run"
      :vial-key="sheet.vialKey"
      :syringe-id="sheet.syringeId"
      @close="sheet = null"
    />
    <DeviceSheet
      v-else-if="sheet?.kind === 'device'"
      :run="run"
      :device-id="sheet.id"
      @close="sheet = null"
    />
    <BottomSheet v-else-if="sheet?.kind === 'timeline'" title="Timeline" @close="sheet = null">
      <ol class="timeline">
        <li v-for="(entry, i) in run.log.value" :key="i" :class="`tone-${entry.tone}`">
          <span class="mono">{{ fmtClock(entry.t) }}</span>
          <span>{{ toneMark(entry.tone) }}{{ entry.text }}</span>
        </li>
        <li v-if="run.log.value.length === 0" class="row-sub">Nothing yet.</li>
      </ol>
    </BottomSheet>

    <div v-if="intro" class="card-layer">
      <div class="title-card">
        <p class="eyebrow">Scenario</p>
        <h1 class="title-name">“{{ scenario.title }}”</h1>
        <p class="title-when mono">
          {{ fmtStoryClock(scenario.startsAtMin, 0, false) }} · Operatory
        </p>
      </div>
    </div>

    <div v-else-if="run.cutCard.value" class="card-layer" role="status">
      <div class="title-card">
        <p class="eyebrow">Time cut</p>
        <h1 class="title-name">{{ run.cutCard.value.title }}</h1>
        <p class="title-when mono">{{ cutFrom }} → {{ cutTo }}</p>
      </div>
    </div>

    <div
      v-else-if="run.ending.value"
      class="card-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Scenario over"
    >
      <div class="title-card">
        <p class="eyebrow">Scenario over · {{ fmtClock(run.t.value) }}</p>
        <h1 class="title-name">{{ run.ending.value.title }}</h1>
        <p class="ending-text">{{ run.ending.value.text }}</p>
        <button v-focus type="button" class="btn btn--key btn--tall btn--block" @click="toDebrief">
          Debrief
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.room {
  height: 100dvh;
  max-width: 820px;
  margin: 0 auto;
  padding: calc(var(--band-h) + var(--sp-2)) var(--sp-3) var(--sp-3);
  display: grid;
  /* Without this the one column takes the call-out input's own width and the
     room is wider than a phone as soon as the 911 button grows. */
  grid-template-columns: minmax(0, 1fr);
  /* The bag's pad is a row only while the bag is on, so the rows after the monitor are not counted out. */
  grid-template-rows: auto minmax(236px, 1fr);
  grid-auto-rows: auto;
  gap: var(--sp-2);
}
/*
 * With the bag's pad up the scene takes the height that is left, and the
 * figure is drawn to fit it: smaller, never cut off.
 */
.room.is-bagging .scene {
  grid-template-rows: minmax(0, 1fr);
}
.room.is-bagging .scene-figure {
  align-self: stretch;
  min-height: 0;
}
/*
 * On a short screen the bag's pad has to fit without pushing the cart off
 * it. The room gives up height everywhere but the monitor, which is already
 * as short as it can be read. A narrow screen counts as short sooner: there
 * the line under the pad is two lines deep.
 */
@media (max-height: 900px), (max-width: 700px) and (max-height: 1000px) {
  .room.is-bagging .scene {
    min-height: 0;
    padding-block: var(--sp-2);
  }
  .room.is-bagging .scene-text {
    font-size: var(--type-body);
  }
  .room.is-bagging :deep(.tile) {
    min-height: 48px;
  }
}
.room-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.room-title {
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
}
.tag {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: var(--r-pill);
  background: var(--train-soft);
  color: var(--train);
}
.room-clock {
  margin-left: auto;
  font-size: var(--type-title);
  font-weight: var(--weight-bold);
}
.room-head .pill {
  padding: 0 var(--sp-3);
}
.room-monitor {
  min-height: 0;
}
.said {
  margin: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--color-surface);
  border-left: 3px solid var(--train);
}
.said-line {
  font-size: var(--type-heading);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
}
.scene {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(84px, 24%) minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: center;
  min-height: 150px;
  padding: var(--sp-3);
  border-radius: var(--r-lg);
  background: var(--color-card-bg);
  overflow: hidden;
}
.scene-story {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.scene-text {
  margin: 0;
  font-size: var(--type-heading);
  line-height: var(--leading-normal);
}
.prompt {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: var(--color-input-bg);
  border-radius: var(--r-lg);
  overflow-y: auto;
}
.prompt-line {
  margin: 0;
  font-size: var(--type-heading);
  font-weight: var(--weight-semibold);
}
.prompt-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
}
.now {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 44px;
  overflow-x: auto;
  text-align: left;
}
.chip {
  flex: none;
  padding: 6px 12px;
  border-radius: var(--r-pill);
  background: var(--color-good-soft);
  color: var(--color-good);
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.now-empty {
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}
.now-more {
  margin-left: auto;
  flex: none;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-secondary);
  padding-left: var(--sp-2);
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.timeline li {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: var(--sp-2);
}
.timeline .mono {
  color: var(--color-text-tertiary);
}
.tone-good {
  color: var(--color-good);
}
.tone-bad {
  color: var(--color-danger);
}
.card-layer {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: grid;
  place-items: center;
  padding: calc(var(--band-h) + var(--sp-4)) var(--sp-4) var(--sp-4);
  background: var(--card-scrim);
}
.title-card {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  text-align: center;
}
.title-name {
  margin: 0;
  font-size: var(--type-display);
  line-height: var(--leading-tight);
  text-wrap: balance;
}
.title-when {
  margin: 0;
  color: var(--color-text-secondary);
}
.ending-text {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-heading);
  line-height: var(--leading-normal);
  text-wrap: balance;
}
@media (max-height: 760px) {
  .room {
    height: auto;
    min-height: 100dvh;
  }
}
</style>
