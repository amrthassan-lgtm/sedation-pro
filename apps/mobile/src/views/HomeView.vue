<script setup lang="ts">
import { computed } from 'vue';

import {
  CLINICAL_LIB_VERSION,
  DEFAULT_FORMULARY,
  bmiFromImperial,
  ivSedationStatus,
  versedCeilingMg,
} from '@sedation-pro/clinical';

const bmi = computed(() => bmiFromImperial(180, 70));
const ceilingWithOpioid = computed(() => versedCeilingMg(true));
const sedation = computed(() => ivSedationStatus(7.5, 50));
const ivCount = DEFAULT_FORMULARY.iv.length;
const localCount = DEFAULT_FORMULARY.locals.length;
</script>

<template>
  <main class="home">
    <header class="hero">
      <p class="caption">Phase 1 · Clinical Engine</p>
      <h1 class="title-display">Sedation Pro</h1>
      <p class="body muted">
        Pure-TS clinical engine: formulary, dosing math, gates, vitals. UI lands in Phase 2+.
      </p>
    </header>

    <section class="card">
      <p class="heading">Live engine sample</p>
      <dl class="kv">
        <dt class="caption">clinical lib</dt>
        <dd class="body mono">v{{ CLINICAL_LIB_VERSION }}</dd>

        <dt class="caption">formulary</dt>
        <dd class="body">{{ ivCount }} IV · {{ localCount }} local</dd>

        <dt class="caption">BMI 180 lb / 70 in</dt>
        <dd class="body">
          <span class="mono">{{ bmi?.value.toFixed(1) ?? '—' }}</span>
          <span class="muted"> · {{ bmi?.category ?? '—' }}</span>
        </dd>

        <dt class="caption">Versed ceiling w/ opioid</dt>
        <dd class="body mono">{{ ceilingWithOpioid.toFixed(1) }} mg</dd>

        <dt class="caption">7.5 mg V + 50 mcg F</dt>
        <dd class="body">
          <span class="mono">{{ sedation.combined.percent.toFixed(0) }}%</span>
          <span class="muted"> · {{ sedation.combined.severity }}</span>
        </dd>
      </dl>
    </section>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-5) var(--sp-7);
  max-width: 480px;
  margin-inline: auto;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.muted {
  color: var(--color-text-secondary);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  padding: var(--sp-4) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.kv {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-2) var(--sp-4);
  align-items: baseline;
}

.kv dt {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.kv dd {
  margin: 0;
  color: var(--color-text-primary);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
