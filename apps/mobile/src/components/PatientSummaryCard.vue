<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useEventLogStore } from '@/stores/event-log';

/**
 * Patient summary card surfaced in the iPad-landscape right rail. Mirrors
 * the visual grammar of the nav drawer's header (`NavDrawer.vue:255-286`)
 * so operators read the same avatar / name / MRN / pills layout in two
 * places — drawer for navigation, rail for at-a-glance reference while
 * filling the form.
 *
 * Reads the patient + event-log stores directly. No props — the card has
 * one canonical source of truth and one way to render it.
 */
const patient = usePatientStore();
const eventLog = useEventLogStore();

const { name: patientName, mrn, age, completeness, isPhase1Complete } = storeToRefs(patient);
const { count: eventCount } = storeToRefs(eventLog);

const initial = computed(() => {
  const raw = patientName.value.trim();
  if (!raw) return 'PT';
  const parts = raw.split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});
</script>

<template>
  <section class="patient-summary" aria-label="Patient summary">
    <div class="ps-top">
      <div class="ps-avatar" aria-hidden="true">{{ initial }}</div>
      <div class="ps-identity">
        <div class="ps-name">{{ patientName.trim() || 'No patient' }}</div>
        <div class="ps-meta">
          <template v-if="mrn || age">
            <span v-if="mrn">MRN {{ mrn }}</span>
            <span v-if="mrn && age"> · </span>
            <span v-if="age">{{ age }} y/o</span>
          </template>
          <span v-else>Enter patient details to begin</span>
        </div>
      </div>
    </div>
    <div class="ps-pills">
      <div class="ps-pill">
        <div class="ps-pill-label">Clearance</div>
        <div class="ps-pill-value">{{ completeness.percent }}%</div>
      </div>
      <div class="ps-pill">
        <div class="ps-pill-label">Events</div>
        <div class="ps-pill-value">{{ eventCount }}</div>
      </div>
      <div class="ps-pill">
        <div class="ps-pill-label">Status</div>
        <div class="ps-pill-value" :class="{ good: isPhase1Complete }">
          {{ isPhase1Complete ? 'Ready' : 'Hold' }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.patient-summary {
  padding: 14px 16px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.04), var(--color-surface));
}
.ps-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.ps-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), var(--color-purple));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
  letter-spacing: -0.3px;
}
.ps-identity {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.ps-name {
  font-size: var(--type-body);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ps-meta {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-top: 2px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ps-pills {
  display: flex;
  gap: 6px;
}
.ps-pill {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-sm);
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.ps-pill-label {
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-disabled);
}
.ps-pill-value {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.ps-pill-value.good {
  color: var(--color-good);
}
</style>
