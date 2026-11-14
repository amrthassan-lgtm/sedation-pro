<script setup lang="ts">
import { PROTOCOLS_REVIEWED } from '@sedation-pro/clinical';
import { useRouter } from 'vue-router';

import { SCENARIOS } from '@/scenarios';
import { recordsFor, saveSettings, settings, type Settings } from '@/session';
import { voiceAvailable } from '@/audio/voice';

const router = useRouter();
const version = __TRAINER_VERSION__;

function last(id: string): string {
  const record = recordsFor(id).at(-1);
  if (!record) return 'Not run yet';
  return `Last run ${record.done} of ${record.of} steps`;
}

function flip(key: keyof Settings): void {
  settings[key] = !settings[key];
  saveSettings();
}

interface Toggle {
  readonly key: keyof Settings;
  readonly title: string;
  readonly sub: string;
}

const TOGGLES: ReadonlyArray<Toggle> = [
  { key: 'sound', title: 'Monitor alarms', sub: 'Alarms only. There is no pulse beep.' },
  { key: 'voice', title: 'Spoken lines', sub: 'The team speaks as well as being captioned.' },
  {
    key: 'takeYourTime',
    title: 'Take your time',
    sub: 'The clock stops while a drawer is open and the patient cannot be lost. Practice only.',
  },
  {
    key: 'coached',
    title: 'Coaching',
    sub: 'The assistant suggests the next step when the team stalls. Practice only.',
  },
];
</script>

<template>
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Apex Dental · Emergency drills</p>
      <h1 class="hero-title">Sedation Trainer</h1>
      <p class="hero-sub">
        A patient, a monitor and your own cart. The clock runs in real time, and the debrief quotes
        your written protocols line by line.
      </p>
    </header>

    <section>
      <p class="eyebrow section-label">Scenarios</p>
      <div class="group">
        <button
          v-for="s in SCENARIOS"
          :key="s.id"
          type="button"
          class="row"
          @click="router.push(`/brief/${s.id}`)"
        >
          <span class="row-main">
            <span class="row-title">“{{ s.title }}”</span>
            <span class="row-sub">{{ s.tagline }}</span>
          </span>
          <span class="row-end">{{ last(s.id) }}</span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <section>
      <p class="eyebrow section-label">Sound and pace</p>
      <div class="group">
        <button
          v-for="t in TOGGLES"
          :key="t.key"
          type="button"
          class="row"
          role="switch"
          :aria-checked="settings[t.key]"
          :disabled="t.key === 'voice' && !voiceAvailable()"
          @click="flip(t.key)"
        >
          <span class="row-main">
            <span class="row-title">{{ t.title }}</span>
            <span class="row-sub">{{ t.sub }}</span>
          </span>
          <span class="switch" :class="{ 'is-on': settings[t.key] }" aria-hidden="true"></span>
        </button>
      </div>
    </section>

    <footer class="foot">
      <p>No patient information is entered or stored here. The patients are invented.</p>
      <p>{{ PROTOCOLS_REVIEWED }} · Trainer v{{ version }}</p>
      <a class="foot-link" href="../">Open Sedation Pro</a>
    </footer>
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
  letter-spacing: var(--tracking-tight);
}
.hero-sub {
  margin: 0;
  color: var(--color-text-secondary);
  max-width: 56ch;
}
.section-label {
  margin: 0 0 var(--sp-2) var(--sp-4);
}
.chev {
  color: var(--color-text-tertiary);
  font-size: var(--type-title);
}
.row:disabled {
  color: var(--color-text-disabled);
}
.switch {
  flex: none;
  width: 52px;
  height: 32px;
  border-radius: var(--r-pill);
  background: var(--color-surface-overlay);
  position: relative;
  transition: background var(--dur-150) var(--ease-standard);
}
.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-text-primary);
  transition: transform var(--dur-150) var(--ease-standard);
}
.switch.is-on {
  background: var(--color-good);
}
.switch.is-on::after {
  transform: translateX(20px);
}
.foot {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: 0 var(--sp-4) var(--sp-5);
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}
.foot p {
  margin: 0;
}
.foot-link {
  color: var(--color-accent);
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
