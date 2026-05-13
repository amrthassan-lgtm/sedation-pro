<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useVitalCards } from '@/composables/useVitalCards';
import { UiStatCard } from '@sedation-pro/ui';

const { bmi, bp, spo2 } = storeToRefs(usePatientStore());
const { bmiCard, bpCard, spo2Card } = useVitalCards();
</script>

<template>
  <div class="vitals-stat-grid">
    <UiStatCard
      label="BMI"
      :value="bmiCard.value"
      :unit="bmi ? 'kg/m²' : undefined"
      :category="bmiCard.category"
      :severity="bmiCard.severity"
      :detail="bmiCard.detail"
    />
    <UiStatCard
      label="Baseline BP"
      :value="bpCard.value"
      :unit="bp ? 'mmHg' : undefined"
      :category="bpCard.category"
      :severity="bpCard.severity"
    />
    <UiStatCard
      label="SpO₂"
      :value="spo2Card.value"
      :unit="spo2 ? '%' : undefined"
      :category="spo2Card.category"
      :severity="spo2Card.severity"
    />
  </div>
</template>

<style scoped>
.vitals-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-2);
}
</style>
