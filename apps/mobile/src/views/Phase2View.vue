<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useEventLogStore } from '@/stores/event-log';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { haptic } from '@/composables/useHaptics';
import { nowClock } from '@/composables/format';
import { lastLogged } from '@/composables/lastLogged';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import VitalsStatGrid from '@/components/VitalsStatGrid.vue';
import { UiBanner, UiCard, UiDrugButton, UiRow } from '@sedation-pro/ui';

const patient = usePatientStore();
const undo = useUndoStore();
const log = useEventLogStore();

const { weightLb } = storeToRefs(patient);

const ORAL_DOSE = 'Preoperative Oral Dose';

/** The time on a dose button once it was given; these stay tappable for a second dose. */
function givenAt(drug: string, doseMg: number): string | undefined {
  return lastLogged(log.events, ORAL_DOSE, { Drug: drug, Dose: `${doseMg} mg` });
}

function logOral(drug: string, doseMg: number, unit: string = 'mg') {
  haptic('medium');
  // The dose and the route, as given. No ceiling goes into the record: a
  // limit the app worked out reads there as the doctor's (owner, Nov 2026).
  undo.stamp({
    event: ORAL_DOSE,
    details: {
      Drug: drug,
      Dose: `${doseMg} ${unit}`,
      Route: 'PO swallowed',
    },
    toast: {
      label: `✓ ${drug} ${doseMg} ${unit} PO`,
      sub: nowClock(),
      tone: 'safe',
    },
  });
}
</script>

<template>
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 2 · Oral Sedation</p>
      <h1 class="title-display">Pre-Op Anxiolytic</h1>
    </header>

    <UiBanner v-if="!weightLb" tone="caution" title="Weight required">
      Enter patient weight in Phase 1.
    </UiBanner>

    <UiCard tint="ph2">
      <p class="heading">Triazolam · Halcion</p>
      <UiRow :gap="2" align="stretch" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.125"
          sub="mg PO"
          :last-at="givenAt('Triazolam', 0.125)"
          @click="logOral('Triazolam', 0.125)"
        />
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.25"
          sub="mg PO"
          :last-at="givenAt('Triazolam', 0.25)"
          @click="logOral('Triazolam', 0.25)"
        />
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.5"
          sub="mg PO"
          :last-at="givenAt('Triazolam', 0.5)"
          @click="logOral('Triazolam', 0.5)"
        />
      </UiRow>
    </UiCard>

    <UiCard tint="ph2">
      <p class="heading">Lorazepam · Ativan</p>
      <UiRow :gap="2" align="stretch" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="0.5"
          sub="mg PO"
          :last-at="givenAt('Lorazepam', 0.5)"
          @click="logOral('Lorazepam', 0.5)"
        />
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="1"
          sub="mg PO"
          :last-at="givenAt('Lorazepam', 1)"
          @click="logOral('Lorazepam', 1)"
        />
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="2"
          sub="mg PO"
          :last-at="givenAt('Lorazepam', 2)"
          @click="logOral('Lorazepam', 2)"
        />
      </UiRow>
    </UiCard>

    <UiCard tint="ph2">
      <p class="heading">Hydroxyzine · Vistaril</p>
      <UiRow :gap="2" align="stretch" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Hydroxyzine"
          dose="25"
          sub="mg PO"
          :last-at="givenAt('Hydroxyzine', 25)"
          @click="logOral('Hydroxyzine', 25)"
        />
        <UiDrugButton
          tone="oral"
          name="Hydroxyzine"
          dose="50"
          sub="mg PO"
          :last-at="givenAt('Hydroxyzine', 50)"
          @click="logOral('Hydroxyzine', 50)"
        />
      </UiRow>
    </UiCard>

    <PhaseFooterNav
      :back="{ label: 'Assessment', route: '/phase/1', tint: 'ph1' }"
      :forward="{ label: 'IV Sedation', route: '/phase/3', tint: 'ph3' }"
    />

    <template #rail>
      <PatientSummaryCard />
      <VitalsStatGrid />
    </template>
  </PhaseLayout>
</template>
