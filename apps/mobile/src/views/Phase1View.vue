<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { useEventLogStore } from '@/stores/event-log';
import {
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiField,
  UiNumberInput,
  UiRow,
  UiSelect,
  UiStack,
  UiTextInput,
} from '@sedation-pro/ui';

const patient = usePatientStore();
const undo = useUndoStore();
const eventLog = useEventLogStore();

const {
  name,
  mrn,
  provider,
  careName,
  carePhone,
  weightLb,
  heightIn,
  age,
  lastExamDate,
  baselineBp,
  medsVerified,
  osaStatus,
  smokingStatus,
  mallampati,
  asaClass,
  npoConfirmed,
  completeness,
  isPhase1Complete,
} = storeToRefs(patient);

const { events } = storeToRefs(eventLog);

const asaOptions = [
  { value: 'I', label: 'ASA I — Healthy' },
  { value: 'II', label: 'ASA II — Mild systemic disease' },
  { value: 'III', label: 'ASA III — Severe systemic disease' },
  { value: 'IV', label: 'ASA IV — Life-threatening' },
];

const mallampatiOptions = [
  { value: 'I', label: 'Class I' },
  { value: 'II', label: 'Class II' },
  { value: 'III', label: 'Class III' },
  { value: 'IV', label: 'Class IV' },
];

const osaOptions = [
  { value: 'none', label: 'No history' },
  { value: 'osa-diagnosed', label: 'Yes — OSA diagnosed' },
  { value: 'cpap-prescribed', label: 'Yes — CPAP prescribed' },
];

const smokingOptions = [
  { value: 'never', label: 'Non-smoker' },
  { value: 'current', label: 'Current smoker' },
  { value: 'former', label: 'Former smoker' },
];

function stampAssessment() {
  undo.stamp({
    event: 'Phase 1 — Pre-Sedation Assessment',
    details: {
      Patient: name.value || '—',
      Provider: provider.value || '—',
      ASA: asaClass.value || '—',
      Mallampati: mallampati.value || '—',
    },
    toast: {
      label: '✓ Pre-Sedation Assessment recorded',
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'safe',
    },
  });
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 1 · Pre-Sedation Assessment</p>
      <h1 class="title-display">Patient Clearance</h1>
      <p class="body muted">
        Fill the required fields to unlock Phase 2 / 3 / 4. The clearance percent in the sticky bar
        updates live from the same Pinia store the nav drawer reads from.
      </p>
    </header>

    <UiBanner v-if="isPhase1Complete" tone="safe" title="Phase 1 complete" icon="✓">
      All required fields are filled. The nav drawer has unlocked Phases 2 / 3 / 4 and the sticky
      bar shows the ready badge.
    </UiBanner>
    <UiBanner v-else tone="info" title="Clearance progress" icon="ℹ">
      <strong>{{ completeness.done }}</strong> of {{ completeness.total }} required fields filled.
      Missing: {{ completeness.missing.map((m) => m.label).join(' · ') || 'none' }}.
    </UiBanner>

    <UiCard tint="ph1" active>
      <p class="heading">Patient Identification</p>
      <UiStack :gap="3">
        <UiField label="Patient name" required>
          <UiTextInput v-model="name" placeholder="Patient name" block />
        </UiField>
        <UiRow :gap="3" wrap>
          <UiField label="MRN" required>
            <UiTextInput v-model="mrn" placeholder="MRN" inputmode="numeric" />
          </UiField>
          <UiField label="Provider" required>
            <UiTextInput v-model="provider" placeholder="Dr. Hassan" />
          </UiField>
        </UiRow>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Caregiver</p>
      <UiRow :gap="3" wrap>
        <UiField label="Caregiver name" required>
          <UiTextInput v-model="careName" placeholder="Caregiver" />
        </UiField>
        <UiField label="Caregiver phone" required>
          <UiTextInput v-model="carePhone" placeholder="(###) ###-####" inputmode="tel" />
        </UiField>
      </UiRow>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Vitals & Metrics</p>
      <UiStack :gap="3">
        <UiRow :gap="3" wrap>
          <UiField label="Weight" hint="lbs" required>
            <UiNumberInput v-model="weightLb" placeholder="lbs" />
          </UiField>
          <UiField label="Height" hint="in" required>
            <UiNumberInput v-model="heightIn" placeholder="in" />
          </UiField>
          <UiField label="Age" required>
            <UiNumberInput v-model="age" placeholder="yrs" />
          </UiField>
        </UiRow>
        <UiField label="Date of last exam" required>
          <UiTextInput v-model="lastExamDate" type="date" />
        </UiField>
        <UiField label="Baseline BP" hint="mmHg">
          <UiBpInput v-model="baselineBp" />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Medical History</p>
      <UiStack :gap="3">
        <UiCheckbox
          v-model="medsVerified"
          required
          label="Drug interactions checked in Epocrates"
        />
        <UiField label="OSA / CPAP history" required>
          <UiSelect v-model="osaStatus" :options="osaOptions" placeholder="Select…" block />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Social Screening</p>
      <UiField label="Smoking status" required>
        <UiSelect v-model="smokingStatus" :options="smokingOptions" placeholder="Select…" block />
      </UiField>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Safety Checklist</p>
      <UiStack :gap="3">
        <UiRow :gap="3" wrap>
          <UiField label="Mallampati" required>
            <UiSelect v-model="mallampati" :options="mallampatiOptions" placeholder="Select…" />
          </UiField>
          <UiField label="ASA class" required>
            <UiSelect v-model="asaClass" :options="asaOptions" placeholder="Select…" />
          </UiField>
        </UiRow>
        <UiCheckbox
          v-model="npoConfirmed"
          required
          label="NPO confirmed"
          hint="Solids ≥6h · clear liquids ≥2h"
        />
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Confirm Assessment</p>
      <p class="body muted">
        Stamps a single entry into the chronological event log and shows an undo toast for 8
        seconds. Tap Undo (here or in the sticky bar) to reverse it.
      </p>
      <UiButton tone="success" :disabled="!isPhase1Complete" block @click="stampAssessment">
        Stamp Pre-Sedation Assessment
      </UiButton>
      <p class="caption mt-1">
        Event log size: <strong>{{ events.length }}</strong>
      </p>
    </UiCard>
  </main>
</template>

<style scoped>
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}
.phase-hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.muted {
  color: var(--color-text-secondary);
}
.mt-1 {
  margin-top: var(--sp-2);
}
</style>
