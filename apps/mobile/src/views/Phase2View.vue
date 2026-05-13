<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { haptic } from '@/composables/useHaptics';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
import { UiBanner, UiCard, UiDrugButton, UiRow, UiStatCard } from '@sedation-pro/ui';
import { lorazepamMax, triazolamMax } from '@sedation-pro/clinical';

const patient = usePatientStore();
const undo = useUndoStore();

const { weightLb } = storeToRefs(patient);

const triazolam = computed(() => (weightLb.value ? triazolamMax(weightLb.value) : null));
const lorazepam = computed(() => (weightLb.value ? lorazepamMax(weightLb.value) : null));

function logOral(drug: string, doseMg: number, unit: string = 'mg') {
  haptic('medium');
  undo.stamp({
    event: 'Preoperative Oral Dose',
    details: {
      Drug: drug,
      Dose: `${doseMg} ${unit}`,
      Route: 'PO swallowed',
    },
    toast: {
      label: `✓ ${drug} ${doseMg} ${unit} PO`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'safe',
    },
  });
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 2 · Oral Sedation</p>
      <h1 class="title-display">Pre-Op Anxiolytic</h1>
      <p class="body muted">
        Optional pre-op anxiolytic 30 minutes before IV start. Max-dose hints update live from the
        entered weight.
      </p>
    </header>

    <UiBanner v-if="!weightLb" tone="caution" title="Weight required" icon="⚖️">
      Enter patient weight in Phase 1 so max-dose hints can compute against the entered patient.
    </UiBanner>

    <div v-if="weightLb" class="stat-grid">
      <UiStatCard
        label="Triazolam max"
        :value="triazolam ? triazolam.mg.toFixed(2) : '—'"
        unit="mg PO"
        category="weight/100"
        severity="safe"
        :detail="`Up to ${triazolam?.tablets ?? '—'} × 0.25 mg tabs`"
      />
      <UiStatCard
        label="Lorazepam max"
        :value="lorazepam ? lorazepam.mg.toFixed(1) : '—'"
        unit="mg PO"
        category="weight/25"
        severity="safe"
        :detail="`Up to ${lorazepam?.tablets ?? '—'} × 2 mg tabs`"
      />
    </div>

    <UiCard tint="ph2" active>
      <p class="heading">Triazolam · Halcion</p>
      <p class="body muted">
        Most common pre-op anxiolytic. 30-90 min before appointment. Counts as a CNS depressant —
        use conservative IV titration if also using Versed.
      </p>
      <UiRow :gap="2" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.125"
          sub="mg PO"
          @click="logOral('Triazolam', 0.125)"
        />
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.25"
          sub="mg PO"
          @click="logOral('Triazolam', 0.25)"
        />
        <UiDrugButton
          tone="oral"
          name="Triazolam"
          dose="0.5"
          sub="mg PO"
          @click="logOral('Triazolam', 0.5)"
        />
      </UiRow>
    </UiCard>

    <UiCard tint="ph2">
      <p class="heading">Lorazepam · Ativan</p>
      <p class="body muted">
        Alternative when patient takes a CYP3A4 inhibitor (erythromycin, clarithromycin,
        antifungals, HIV antivirals) that would interact with triazolam.
      </p>
      <UiRow :gap="2" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="0.5"
          sub="mg PO"
          @click="logOral('Lorazepam', 0.5)"
        />
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="1"
          sub="mg PO"
          @click="logOral('Lorazepam', 1)"
        />
        <UiDrugButton
          tone="oral"
          name="Lorazepam"
          dose="2"
          sub="mg PO"
          @click="logOral('Lorazepam', 2)"
        />
      </UiRow>
    </UiCard>

    <UiCard tint="ph2">
      <p class="heading">Hydroxyzine · Vistaril</p>
      <p class="body muted">
        Non-benzodiazepine alternative — antihistamine with sedative properties. Use for benzo-abuse
        history, severe respiratory compromise, or chronic nausea.
        <strong>No reversal agent</strong> — effects must wear off naturally over 4-6 hours.
      </p>
      <UiRow :gap="2" wrap class="mt-2">
        <UiDrugButton
          tone="oral"
          name="Hydroxyzine"
          dose="25"
          sub="mg PO"
          @click="logOral('Hydroxyzine', 25)"
        />
        <UiDrugButton
          tone="oral"
          name="Hydroxyzine"
          dose="50"
          sub="mg PO"
          @click="logOral('Hydroxyzine', 50)"
        />
      </UiRow>
    </UiCard>

    <PhaseFooterNav
      :back="{ label: 'Phase 1 · Assessment', route: '/phase/1' }"
      :forward="{ label: 'Phase 3 · IV Sedation', route: '/phase/3' }"
    />
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
.mt-2 {
  margin-top: var(--sp-3);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2);
}
</style>
