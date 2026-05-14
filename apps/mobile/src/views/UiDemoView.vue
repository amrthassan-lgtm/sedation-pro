<script setup lang="ts">
import { computed, ref } from 'vue';

import {
  CLINICAL_LIB_VERSION,
  DEFAULT_FORMULARY,
  bmiFromImperial,
  classifyBp,
  classifySpo2,
  ivSedationStatus,
  versedCeilingMg,
} from '@sedation-pro/clinical';
import {
  UI_LIB_VERSION,
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiDrugButton,
  UiDrugSwatch,
  UiField,
  UiNumberInput,
  UiPercentBar,
  UiRow,
  UiSelect,
  UiStack,
  UiStatusPill,
  UiTextInput,
  UiTimerPill,
} from '@sedation-pro/ui';
import type { ActionState, BpValue } from '@sedation-pro/ui';

// Local component state — synthetic only, no clinical persistence.
const patientName = ref('Jane Doe');
const weightLb = ref<number | null>(180);
const heightIn = ref<number | null>(70);
const bp = ref<BpValue>({ sbp: 134, dbp: 82 });
const npoConfirmed = ref(false);
const airwayRisk = ref(true);
const asaClass = ref<string>('II');
const versedState = ref<ActionState>('idle');
const versedLoggedAt = ref<string | undefined>(undefined);

// Live engine readouts.
const bmi = computed(() => bmiFromImperial(weightLb.value ?? 0, heightIn.value ?? 0));
const bpResult = computed(() => classifyBp(bp.value.sbp ?? 0, bp.value.dbp ?? 0));
const spo2 = computed(() => classifySpo2(96));
const ceilingWithOpioid = computed(() => versedCeilingMg(true));
const sedation = computed(() => ivSedationStatus(7.5, 50));
const localPct = 73;

const asaOptions = [
  { value: 'I', label: 'ASA I — Healthy' },
  { value: 'II', label: 'ASA II — Mild systemic disease' },
  { value: 'III', label: 'ASA III — Severe systemic disease' },
  { value: 'IV', label: 'ASA IV — Life-threatening disease' },
];

function fireVersed() {
  versedState.value = 'locked';
  setTimeout(() => {
    versedState.value = 'logged';
    versedLoggedAt.value = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, 1200);
}
</script>

<template>
  <main class="home">
    <header class="hero">
      <p class="caption">Phase 2 · UI Primitives</p>
      <h1 class="title-display">Sedation Pro</h1>
      <p class="body muted">
        Headless Vue primitives consumed by the mobile shell. Clinical math comes from
        @sedation-pro/clinical (v{{ CLINICAL_LIB_VERSION }}); display comes from @sedation-pro/ui
        (v{{ UI_LIB_VERSION }}).
      </p>
    </header>

    <UiStack :gap="5">
      <!-- Cards & phase tints -->
      <section class="demo-section">
        <h2 class="title">Cards · phase tint</h2>
        <UiRow :gap="3" wrap>
          <UiCard tint="ph1" active>
            <p class="caption">Phase 1 · Active</p>
            <p class="heading">Patient Identification</p>
          </UiCard>
          <UiCard tint="ph2">
            <p class="caption">Phase 2 · Idle</p>
            <p class="heading">Oral Premedication</p>
          </UiCard>
          <UiCard tint="ph3">
            <p class="caption">Phase 3 · Idle</p>
            <p class="heading">IV Sedation</p>
          </UiCard>
          <UiCard tint="ph4" completed>
            <p class="caption">Phase 4 · Completed</p>
            <p class="heading">Recovery</p>
          </UiCard>
        </UiRow>
      </section>

      <!-- Buttons -->
      <section class="demo-section">
        <h2 class="title">Buttons</h2>
        <UiRow :gap="3" wrap>
          <UiButton tone="neutral">Stamp Pre‑Op Vitals</UiButton>
          <UiButton tone="primary">Start IV</UiButton>
          <UiButton tone="success">Confirm Discharge</UiButton>
          <UiButton tone="danger">Release Patient</UiButton>
          <UiButton tone="neutral" disabled>Disabled</UiButton>
        </UiRow>
        <UiRow :gap="3" wrap class="mt-3">
          <UiButton tone="neutral" state="locked">Locked (10s cooldown)</UiButton>
          <UiButton tone="primary" state="logged" logged-at="11:23">N₂O/O₂ ON</UiButton>
        </UiRow>
      </section>

      <!-- Drug buttons -->
      <section class="demo-section">
        <h2 class="title">Drug buttons</h2>
        <p class="body muted demo-hint">
          Live tap to see the cooldown → logged transition. The state is driven by the parent — the
          button never owns its own timer.
        </p>
        <UiRow :gap="2" wrap>
          <UiDrugButton
            tone="versed"
            name="Versed"
            dose="1 mg"
            sub="0.2 ml"
            :state="versedState"
            :logged-at="versedLoggedAt"
            @click="fireVersed"
          />
          <UiDrugButton tone="versed" name="Versed" dose="2 mg" sub="0.4 ml" />
          <UiDrugButton tone="fentanyl" name="Fentanyl" dose="25 mcg" sub="0.5 ml" />
          <UiDrugButton tone="fentanyl" name="Fentanyl" dose="50 mcg" sub="1.0 ml" />
          <UiDrugButton tone="zofran" name="Zofran" dose="4 mg" sub="2.0 ml" />
          <UiDrugButton tone="flumazenil" name="Flumazenil" dose="0.2 mg" sub="benzo reversal" />
          <UiDrugButton tone="naloxone" name="Naloxone" dose="0.4 mg" sub="opioid reversal" />
        </UiRow>
        <UiRow :gap="2" wrap class="mt-3">
          <UiDrugButton tone="oral" name="Triazolam" dose="0.25" sub="mg PO" />
          <UiDrugButton tone="bedtime" name="Diazepam" dose="5" sub="mg PO" disabled />
          <UiDrugButton tone="lidocaine" name="Lidocaine" dose="2%" sub="1:100k epi" />
          <UiDrugButton tone="septocaine-gold" name="Septocaine" dose="4%" sub="1:100k epi" />
          <UiDrugButton tone="septocaine-silver" name="Septocaine" dose="4%" sub="1:200k epi" />
          <UiDrugButton tone="marcaine" name="Marcaine" dose="0.25%" sub="1:200k epi" />
          <UiDrugButton tone="mepivacaine" name="Mepivacaine" dose="3%" sub="no epi" />
        </UiRow>
      </section>

      <!-- Form -->
      <section class="demo-section">
        <h2 class="title">Form</h2>
        <UiStack :gap="3">
          <UiField label="Patient name" required>
            <UiTextInput v-model="patientName" placeholder="Patient name" block />
          </UiField>
          <UiRow :gap="3" wrap>
            <UiField label="Weight" hint="lbs" required>
              <UiNumberInput v-model="weightLb" placeholder="lbs" />
            </UiField>
            <UiField label="Height" hint="in" required>
              <UiNumberInput v-model="heightIn" placeholder="in" />
            </UiField>
            <UiField label="Baseline BP" hint="mmHg" required>
              <UiBpInput v-model="bp" />
            </UiField>
          </UiRow>
          <UiField label="ASA classification" required>
            <UiSelect v-model="asaClass" :options="asaOptions" placeholder="Select ASA…" block />
          </UiField>
          <UiStack :gap="1">
            <UiCheckbox
              v-model="npoConfirmed"
              required
              label="NPO confirmed"
              hint="Solids ≥6h · clear liquids ≥2h"
            />
            <UiCheckbox
              v-model="airwayRisk"
              tone="danger"
              label="Airway risk acknowledged"
              hint="Mallampati III/IV · OSA · BMI ≥30"
            />
          </UiStack>
        </UiStack>
      </section>

      <!-- Display -->
      <section class="demo-section">
        <h2 class="title">Display</h2>
        <UiStack :gap="3">
          <UiCard>
            <p class="heading">Live engine readouts</p>
            <dl class="kv">
              <dt class="caption">BMI</dt>
              <dd class="body mono">
                {{ bmi?.value.toFixed(1) ?? '—' }}
                <span class="muted"> · {{ bmi?.category ?? '—' }}</span>
              </dd>

              <dt class="caption">Baseline BP</dt>
              <dd class="body">
                <span class="mono">{{ bp.sbp ?? '—' }}/{{ bp.dbp ?? '—' }}</span>
                <span class="muted"> · {{ bpResult?.category ?? '—' }}</span>
              </dd>

              <dt class="caption">SpO₂ 96 %</dt>
              <dd class="body">
                <UiStatusPill :severity="spo2?.severity ?? 'safe'" />
              </dd>

              <dt class="caption">Versed ceiling w/ opioid</dt>
              <dd class="body mono">{{ ceilingWithOpioid.toFixed(1) }} mg</dd>

              <dt class="caption">7.5 mg V + 50 mcg F</dt>
              <dd class="body">
                <span class="mono">{{ sedation.combined.percent.toFixed(0) }}%</span>
                <span class="muted"> · {{ sedation.combined.severity }}</span>
              </dd>
            </dl>
          </UiCard>

          <UiCard>
            <p class="heading">Malamed combined-percent · sample</p>
            <p class="caption demo-hint">Live tap drug buttons feed this in a real session.</p>
            <UiRow :gap="3" align="center">
              <UiDrugSwatch tone="lidocaine" />
              <span class="body">Lidocaine 2% · 1 carp</span>
              <span class="muted body mono" style="margin-left: auto">36 mg</span>
            </UiRow>
            <UiPercentBar :percent="localPct" thickness="lg" />
            <UiRow :gap="2" justify="between">
              <span class="caption">73% combined · capped at 100%</span>
              <UiStatusPill severity="caution" />
            </UiRow>
          </UiCard>

          <UiRow :gap="3" wrap>
            <UiTimerPill
              label="Versed"
              count="1:23"
              hint="wait · 1:37"
              tone="versed"
              status="cooling"
            />
            <UiTimerPill label="Fentanyl" count="✓" hint="ready" tone="fentanyl" status="ready" />
          </UiRow>

          <UiBanner tone="caution" title="Elevated baseline BP" icon="⚠">
            BP 134/82 mmHg falls in Stage 1 hypertension. Evaluate cardiovascular risk before
            proceeding with sedation.
          </UiBanner>
          <UiBanner tone="info" title="Formulary status" icon="ℹ">
            {{ DEFAULT_FORMULARY.iv.length }} IV drugs · {{ DEFAULT_FORMULARY.locals.length }} local
            anesthetics loaded from <code class="mono">DEFAULT_FORMULARY</code>. Practices can ship
            overrides.
          </UiBanner>
        </UiStack>
      </section>
    </UiStack>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-5) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.demo-section h2 {
  margin: 0;
  letter-spacing: 0.2px;
}

.demo-hint {
  margin-bottom: var(--sp-2);
}

.kv {
  margin: var(--sp-3) 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-2) var(--sp-4);
  align-items: baseline;
}
.kv dt {
  color: var(--color-text-tertiary);
}
.kv dd {
  margin: 0;
  color: var(--color-text-primary);
}
</style>
