<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { unlockAlarms } from '@/audio/alarm';
import { findScenario } from '@/scenarios';
import { settings } from '@/session';
import { fmtStoryClock } from '@/time';

const props = defineProps<{ id: string }>();
const router = useRouter();

const scenario = computed(() => findScenario(props.id));

const HOW: ReadonlyArray<string> = [
  'The clock runs in real time. It does not stop while you draw something up.',
  'Open a drawer of the cart, or type what you would call out.',
  'For a drug you choose the syringe, the volume, the label and the route.',
  'The debrief marks each step of your own protocols as done or missed.',
];

function start(): void {
  // Sound can only be switched on from inside a tap, and this is the last one before the run.
  if (settings.sound) unlockAlarms();
  void router.push(`/room/${props.id}`);
}
</script>

<template>
  <main v-if="scenario" class="page">
    <header class="hero">
      <p class="eyebrow">Briefing</p>
      <h1 class="hero-title">“{{ scenario.title }}”</h1>
      <p class="hero-sub mono">{{ fmtStoryClock(scenario.startsAtMin, 0, false) }} · Operatory</p>
    </header>

    <section>
      <p class="eyebrow section-label">Patient (invented)</p>
      <div class="group">
        <div class="row">
          <span class="row-main">
            <span class="row-title">{{ scenario.patient.name }}</span>
            <span class="row-sub">{{ scenario.patient.summary }}</span>
          </span>
        </div>
        <div v-for="line in scenario.setup" :key="line" class="row">
          <span class="row-main">{{ line }}</span>
        </div>
      </div>
    </section>

    <section>
      <p class="eyebrow section-label">How it works</p>
      <div class="group">
        <div v-for="line in HOW" :key="line" class="row">
          <span class="row-main row-sub">{{ line }}</span>
        </div>
      </div>
    </section>

    <p v-if="settings.takeYourTime || settings.coached" class="practice">
      Practice run: {{ settings.takeYourTime ? 'take your time' : ''
      }}{{ settings.takeYourTime && settings.coached ? ' and ' : ''
      }}{{ settings.coached ? 'coaching' : '' }} is on, so this run is not kept as a record.
    </p>

    <div class="actions">
      <button type="button" class="btn btn--key btn--tall btn--block" @click="start">Start</button>
      <button type="button" class="btn btn--block" @click="router.push('/')">Back</button>
    </div>
  </main>
  <main v-else class="page">
    <p>That scenario does not exist.</p>
    <button type="button" class="btn" @click="router.push('/')">Back</button>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding-top: var(--sp-3);
}
.hero-title {
  margin: 0;
  font-size: var(--type-display);
}
.hero-sub {
  margin: 0;
  color: var(--color-text-secondary);
}
.section-label {
  margin: 0 0 var(--sp-2) var(--sp-4);
}
.practice {
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--train-soft);
  color: var(--train);
  font-size: var(--type-footnote);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-bottom: var(--sp-5);
}
</style>
