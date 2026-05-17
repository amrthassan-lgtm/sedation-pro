<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { haptic } from '@/composables/useHaptics';
import DrugAttributes from '@/components/DrugAttributes.vue';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import VitalsStatGrid from '@/components/VitalsStatGrid.vue';
import { UiBanner, UiCard, UiDrugButton, UiRow, UiStatCard } from '@sedation-pro/ui';
import { DEFAULT_FORMULARY, lorazepamMax, triazolamMax } from '@sedation-pro/clinical';

const patient = usePatientStore();
const undo = useUndoStore();

const { weightLb } = storeToRefs(patient);

const triazolam = computed(() => (weightLb.value ? triazolamMax(weightLb.value) : null));
const lorazepam = computed(() => (weightLb.value ? lorazepamMax(weightLb.value) : null));

function oralAttrs(id: string) {
  return DEFAULT_FORMULARY.oral.find((d) => d.id === id)?.attributes ?? [];
}

/**
 * Weight-based ceiling for the drug, captured at the moment of
 * administration. Stamping it into the dose event (rather than recomputing
 * at note time) keeps the medicolegal record point-in-time accurate — it
 * documents the limit the clinician was actually working against, against
 * the weight on file then. Hydroxyzine is a fixed-dose antihistamine with
 * no weight ceiling, so it returns null and the row is simply omitted.
 */
function weightBasedMaxLabel(drug: string): string | null {
  const w = weightLb.value;
  if (!w) return null;
  const m = drug === 'Triazolam' ? triazolamMax(w) : drug === 'Lorazepam' ? lorazepamMax(w) : null;
  if (!m) return null;
  return `${m.mg.toFixed(2)} mg (≤${m.tablets} × ${m.tabletMg} mg tab @ ${w} lb)`;
}

function logOral(drug: string, doseMg: number, unit: string = 'mg') {
  haptic('medium');
  const max = weightBasedMaxLabel(drug);
  undo.stamp({
    event: 'Preoperative Oral Dose',
    details: {
      Drug: drug,
      Dose: `${doseMg} ${unit}`,
      Route: 'PO swallowed',
      ...(max ? { 'Weight-based max': max } : {}),
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
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 2 · Oral Sedation</p>
      <h1 class="title-display">Pre-Op Anxiolytic</h1>
    </header>

    <UiBanner v-if="!weightLb" tone="caution" title="Weight required" icon="⚖️">
      Enter patient weight in Phase 1.
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
      <DrugAttributes :attributes="oralAttrs('triazolam')" />
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
      <DrugAttributes :attributes="oralAttrs('lorazepam')" />
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
      <DrugAttributes :attributes="oralAttrs('hydroxyzine')" />
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
      :back="{ label: 'Phase 1 · Assessment', route: '/phase/1', tint: 'ph1' }"
      :forward="{ label: 'Phase 3 · IV Sedation', route: '/phase/3', tint: 'ph3' }"
    />

    <template #rail>
      <PatientSummaryCard />
      <VitalsStatGrid />
    </template>
  </PhaseLayout>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2);
}
</style>
