<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { useEventLogStore } from '@/stores/event-log';
import { haptic } from '@/composables/useHaptics';
import {
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiDrugButton,
  UiField,
  UiModal,
  UiNumberInput,
  UiRow,
  UiSelect,
  UiStack,
  UiStatCard,
  UiTextInput,
} from '@sedation-pro/ui';
import {
  DEFAULT_FORMULARY,
  diazepamGate,
  lastExamCheck,
  nicotineProtocol,
  type Severity,
} from '@sedation-pro/clinical';

const patient = usePatientStore();
const undo = useUndoStore();
const eventLog = useEventLogStore();

const {
  name,
  mrn,
  provider,
  procedure,
  careName,
  carePhone,
  weightLb,
  heightIn,
  age,
  lastExamDate,
  baselineBp,
  baselineSpo2,
  medsVerified,
  osaStatus,
  smokingStatus,
  mallampati,
  asaClass,
  npoConfirmed,
  consentObtained,
  diabetic,
  baselineGlucose,
  bmi,
  bp,
  spo2,
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

// -------- Live derived UI bits ---------------------------------------------

const bmiCard = computed(() => {
  if (!bmi.value) {
    return { value: '—', category: undefined, severity: 'empty' as const, detail: undefined };
  }
  const severity: Severity =
    bmi.value.category === 'severe'
      ? 'limit'
      : bmi.value.category === 'obese'
        ? 'caution'
        : bmi.value.category === 'overweight'
          ? 'caution'
          : bmi.value.category === 'underweight'
            ? 'caution'
            : 'safe';
  const labels: Record<typeof bmi.value.category, string> = {
    underweight: 'Underweight',
    normal: 'Normal',
    overweight: 'Overweight',
    obese: 'Obese',
    severe: 'Class III',
  };
  return {
    value: bmi.value.value.toFixed(1),
    category: labels[bmi.value.category],
    severity,
    detail: `${weightLb.value ?? '—'} lb · ${heightIn.value ?? '—'} in`,
  };
});

const bpCard = computed(() => {
  if (!bp.value) {
    return { value: '—', category: undefined, severity: 'empty' as const };
  }
  const labels: Record<typeof bp.value.category, string> = {
    normal: 'Normal',
    elevated: 'Elevated',
    'stage-1': 'Stage 1',
    'stage-2': 'Stage 2',
    crisis: 'Crisis',
  };
  return {
    value: `${bp.value.sbp}/${bp.value.dbp}`,
    category: labels[bp.value.category],
    severity: bp.value.severity,
  };
});

const spo2Card = computed(() => {
  if (!spo2.value) {
    return { value: '—', category: undefined, severity: 'empty' as const };
  }
  const labels: Record<typeof spo2.value.category, string> = {
    normal: 'Normal',
    mild: 'Mild hypoxemia',
    severe: 'Severe hypoxemia',
  };
  return {
    value: spo2.value.value.toString(),
    category: labels[spo2.value.category],
    severity: spo2.value.severity,
  };
});

const lastExam = computed(() => {
  if (!lastExamDate.value || age.value === null) return null;
  const examDate = new Date(lastExamDate.value);
  if (Number.isNaN(examDate.getTime())) return null;
  return lastExamCheck(examDate, age.value, new Date());
});

const nicotineRec = computed(() => {
  if (smokingStatus.value !== 'current') return null;
  return nicotineProtocol(20); // legacy default; will hook to cigs/day input in later phase
});

// -------- Diazepam interlock modal -----------------------------------------

const diazepamModalOpen = ref(false);
const pendingDiazepamDose = ref<string | null>(null);
const diazepamOptions = DEFAULT_FORMULARY.bedtime[0];

function startDiazepam(doseMg: number) {
  const decision = diazepamGate(osaStatus.value === '' ? null : osaStatus.value);
  pendingDiazepamDose.value = `${doseMg} mg`;
  if (decision === 'block-missing-osa') {
    diazepamModalOpen.value = true;
    return;
  }
  if (decision === 'requires-override-osa') {
    diazepamModalOpen.value = true;
    return;
  }
  logDiazepam(doseMg);
}

function logDiazepam(doseMg: number) {
  haptic('medium');
  undo.stamp({
    event: 'Bedtime Premedication',
    details: {
      Drug: diazepamOptions?.name ?? 'Diazepam',
      Dose: `${doseMg} mg`,
      Route: 'PO swallowed',
      Timing: 'Night before',
    },
    toast: {
      label: `✓ Diazepam ${doseMg} mg PO (bedtime)`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'caution',
    },
  });
  pendingDiazepamDose.value = null;
}

function confirmDiazepamOverride() {
  const decision = diazepamGate(osaStatus.value === '' ? null : osaStatus.value);
  diazepamModalOpen.value = false;
  if (decision === 'requires-override-osa' && pendingDiazepamDose.value) {
    const mg = parseFloat(pendingDiazepamDose.value);
    if (Number.isFinite(mg)) logDiazepam(mg);
  }
  // For 'block-missing-osa' (no OSA value yet), we never log — the modal is informational.
  pendingDiazepamDose.value = null;
}

function cancelDiazepamModal() {
  diazepamModalOpen.value = false;
  pendingDiazepamDose.value = null;
}

const diazepamModalCopy = computed(() => {
  const decision = diazepamGate(osaStatus.value === '' ? null : osaStatus.value);
  if (decision === 'block-missing-osa') {
    return {
      title: 'OSA history required',
      body: 'Select the patient’s OSA / CPAP status before prescribing bedtime diazepam — the gate exists because OSA changes the airway-risk math.',
      tone: 'primary' as const,
      confirmLabel: 'Got it',
      hideCancel: true,
    };
  }
  return {
    title: '⚠️ OSA contraindication',
    body: 'Documented OSA or CPAP. Diazepam carries significant airway risk at bedtime — prescribe only with explicit clinical justification.',
    tone: 'danger' as const,
    confirmLabel: 'Prescribe anyway',
    hideCancel: false,
  };
});

// -------- Stamp full Phase 1 assessment ------------------------------------

function stampAssessment() {
  undo.stamp({
    event: 'Phase 1 — Pre-Sedation Assessment',
    details: {
      Patient: name.value || '—',
      Provider: provider.value || '—',
      ASA: asaClass.value || '—',
      Mallampati: mallampati.value || '—',
      BMI: bmi.value ? bmi.value.value.toFixed(1) : '—',
      BP: bp.value ? `${bp.value.sbp}/${bp.value.dbp}` : '—',
      'SpO₂': spo2.value ? `${spo2.value.value}%` : '—',
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
        Fill the required fields to unlock Phase 2 / 3 / 4. BMI, BP, and SpO₂ classify live as you
        type. Sticky bar and nav drawer read from the same store — they can&apos;t drift.
      </p>
    </header>

    <UiBanner v-if="isPhase1Complete" tone="safe" title="Phase 1 complete" icon="✓">
      All required fields filled. Phases 2 / 3 / 4 unlocked. The sticky bar shows the ready badge.
    </UiBanner>
    <UiBanner v-else tone="info" title="Clearance progress" icon="ℹ">
      <strong>{{ completeness.done }}</strong> of {{ completeness.total }} required fields filled.
      <template v-if="completeness.missing.length">
        Missing:
        {{ completeness.missing.map((m) => m.label).join(' · ') }}.
      </template>
    </UiBanner>

    <UiCard tint="ph1" active>
      <p class="heading">Patient Identification</p>
      <UiStack :gap="3" class="mt-2">
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
        <UiField label="Procedure" hint="optional">
          <UiTextInput v-model="procedure" placeholder="e.g. EXT #19, root canal #14" />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Caregiver</p>
      <UiRow :gap="3" wrap class="mt-2">
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
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="Weight" hint="lbs" required>
            <UiNumberInput v-model="weightLb" placeholder="lbs" />
          </UiField>
          <UiField label="Height" hint="in" required>
            <UiNumberInput v-model="heightIn" placeholder="in" />
          </UiField>
          <UiField label="Age" hint="yrs" required>
            <UiNumberInput v-model="age" placeholder="yrs" />
          </UiField>
        </UiRow>
        <UiRow :gap="3" wrap>
          <UiField label="Baseline BP" hint="mmHg">
            <UiBpInput v-model="baselineBp" />
          </UiField>
          <UiField label="Baseline SpO₂" hint="%">
            <UiNumberInput v-model="baselineSpo2" placeholder="%" :min="0" :max="100" />
          </UiField>
        </UiRow>
        <UiField label="Date of last exam" required>
          <UiTextInput v-model="lastExamDate" type="date" />
        </UiField>
      </UiStack>

      <!-- Live readouts — Apple Health-style stat cards. -->
      <div class="stat-grid">
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

      <UiBanner
        v-if="lastExam && !lastExam.valid"
        tone="caution"
        title="Out-of-date physical exam"
        icon="⚠"
      >
        Patient is {{ age }} y/o — requires an exam within the last
        <strong>{{ lastExam.cutoffMonths }}</strong> months. Last exam recorded:
        {{ lastExam.elapsedMonths }} months ago. Update before sedation.
      </UiBanner>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Medical History</p>
      <UiStack :gap="3" class="mt-2">
        <UiCheckbox
          v-model="medsVerified"
          required
          label="Drug interactions checked in Epocrates"
          hint="Print + scan to chart before sedation"
        />
        <UiField label="OSA / CPAP history" required>
          <UiSelect v-model="osaStatus" :options="osaOptions" placeholder="Select…" block />
        </UiField>
        <UiCheckbox v-model="diabetic" label="Diabetic" hint="Reveals baseline glucose field" />
        <UiField v-if="diabetic" label="Baseline glucose" hint="mg/dL" required>
          <UiNumberInput v-model="baselineGlucose" placeholder="mg/dL" />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Social Screening</p>
      <UiStack :gap="3" class="mt-2">
        <UiField label="Smoking status" required>
          <UiSelect v-model="smokingStatus" :options="smokingOptions" placeholder="Select…" block />
        </UiField>
        <UiBanner v-if="nicotineRec" tone="caution" title="Pre-op nicotine protocol" icon="🚬">
          {{ nicotineRec.instruction }} ({{ nicotineRec.hoursBefore }} hr before appointment).
          Adjust if reported cigs/day differs.
        </UiBanner>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Safety Checklist</p>
      <UiStack :gap="3" class="mt-2">
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
        <UiCheckbox
          v-model="consentObtained"
          required
          label="Informed consent obtained"
          hint="Risks / benefits / alternatives discussed and consent signed"
        />
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Bedtime Premedication <span class="muted body">· optional</span></p>
      <p class="body muted">
        Diazepam at bedtime the night before. Locked until OSA status is selected; a documented OSA
        / CPAP patient requires explicit override.
      </p>
      <div class="drug-grid mt-2">
        <UiDrugButton
          tone="bedtime"
          name="Diazepam"
          dose="2.5"
          sub="mg PO"
          :disabled="!osaStatus"
          @click="startDiazepam(2.5)"
        />
        <UiDrugButton
          tone="bedtime"
          name="Diazepam"
          dose="5"
          sub="mg PO"
          :disabled="!osaStatus"
          @click="startDiazepam(5)"
        />
        <UiDrugButton
          tone="bedtime"
          name="Diazepam"
          dose="10"
          sub="mg PO"
          :disabled="!osaStatus"
          @click="startDiazepam(10)"
        />
      </div>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Confirm Assessment</p>
      <p class="body muted">
        Stamps the full pre-sedation assessment into the chronological event log with an undo toast
        for 8 seconds.
      </p>
      <UiButton
        tone="success"
        :disabled="!isPhase1Complete"
        block
        class="mt-2"
        @click="stampAssessment"
      >
        Stamp Pre-Sedation Assessment
      </UiButton>
      <p class="caption mt-2">
        Event log size: <strong>{{ events.length }}</strong>
      </p>
    </UiCard>

    <UiModal
      :open="diazepamModalOpen"
      :title="diazepamModalCopy.title"
      :tone="diazepamModalCopy.tone"
      :confirm-label="diazepamModalCopy.confirmLabel"
      :cancel-label="diazepamModalCopy.hideCancel ? '' : 'Cancel'"
      @confirm="confirmDiazepamOverride"
      @cancel="cancelDiazepamModal"
    >
      {{ diazepamModalCopy.body }}
    </UiModal>
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
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.drug-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
}
@media (max-width: 480px) {
  .drug-grid {
    grid-template-columns: 1fr;
  }
}
</style>
