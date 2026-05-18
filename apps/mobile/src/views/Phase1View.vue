<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { useAssessmentAudit } from '@/composables/useAssessmentAudit';
import { useGateFeedback } from '@/composables/useGateFeedback';
import { haptic } from '@/composables/useHaptics';
import DrugAttributes from '@/components/DrugAttributes.vue';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import VitalsStatGrid from '@/components/VitalsStatGrid.vue';
import {
  UiBanner,
  UiBpInput,
  UiCard,
  UiCheckbox,
  UiDrugButton,
  UiField,
  UiHeightInput,
  UiModal,
  UiNumberInput,
  UiRow,
  UiSelect,
  UiStack,
  UiTextarea,
  UiTextInput,
} from '@sedation-pro/ui';
import {
  DEFAULT_FORMULARY,
  diazepamGate,
  lastExamCheck,
  nicotineProtocol,
  type DrugAttribute,
} from '@sedation-pro/clinical';

const router = useRouter();
const patient = usePatientStore();
const undo = useUndoStore();

useAssessmentAudit();

const {
  name,
  mrn,
  provider,
  assistants,
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
  medicationsList,
  allergiesList,
  hospitalisations,
  surgeries,
  familyHistory,
  anesthesiaHistory,
  alcoholPerWeek,
  recreationalDrugs,
  cigarettesPerDay,
  ekgPlaced,
  emergencyDrugsAvailable,
  monitoringEquipmentChecked,
  safetyAlerts,
  completeness,
  isPhase1Complete,
  phase1ValidationAttempted,
} = storeToRefs(patient);

/**
 * Set of clinical-engine ids for every still-missing required field. The keys
 * (`pt`, `mrn`, `npo_confirmed`, …) come from `PHASE1_REQUIRED_FIELDS` in
 * `@sedation-pro/clinical`. Pairing this with `phase1ValidationAttempted`
 * lets each UiField paint its red ring on demand, not on first render.
 */
// Shared gate-feedback idiom (same as Phase 4's discharge gate). The
// engine orders `missing` by registry order, so that *is* document order.
// Phase 1's attempted flag stays in the patient store (persisted, also
// flipped by the router guard) — the composable just consumes it.
const phase1Gate = useGateFeedback({
  entries: computed(() =>
    completeness.value.missing.map((m) => ({ anchorId: `field-${m.id}`, failing: true })),
  ),
  attempted: phase1ValidationAttempted,
});

// Thin wrappers keep the existing call sites (every UiField `:invalid`,
// the watcher, advanceOrShowMissing) unchanged.
function isMissing(id: string): boolean {
  return phase1Gate.isInvalid(`field-${id}`);
}
async function scrollToFirstMissing(): Promise<void> {
  await phase1Gate.scrollToFirst();
}

// A blocked navigation (router guard) flips the flag false→true; scroll then.
// Repeat taps of the bottom button while already-attempted don't change the
// flag, so the button handler scrolls explicitly too (see advanceOrShowMissing).
watch(phase1ValidationAttempted, (attempted) => {
  if (attempted) void scrollToFirstMissing();
});

const missingCount = computed(() => completeness.value.total - completeness.value.done);

/**
 * Bottom-of-page advance button — the single required-field handler. When
 * Phase 1 is complete it routes to Phase 2. When fields are still missing it
 * paints the red rings (via the validation flag) and scrolls to the first
 * missing field. The scroll runs on EVERY tap, not just the first: the flag
 * is already `true` on a second tap so the watcher wouldn't re-fire — calling
 * it here directly fixes the "second click doesn't scroll" bug.
 */
function advanceOrShowMissing(): void {
  if (isPhase1Complete.value) {
    haptic('light');
    void router.push('/phase/2');
    return;
  }
  patient.markValidationAttempted();
  haptic('warning');
  void scrollToFirstMissing();
}

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

const lastExam = computed(() => {
  if (!lastExamDate.value || age.value === null) return null;
  const examDate = new Date(lastExamDate.value);
  if (Number.isNaN(examDate.getTime())) return null;
  return lastExamCheck(examDate, age.value, new Date());
});

const nicotineRec = computed(() => {
  if (smokingStatus.value !== 'current') return null;
  // Fall back to 20 cigs/day (legacy default) when the user hasn't filled the
  // field yet — keeps the banner from disappearing while the form is partial.
  const cigs = cigarettesPerDay.value ?? 20;
  return nicotineProtocol(cigs);
});

// -------- Diazepam interlock modal -----------------------------------------

const diazepamModalOpen = ref(false);
const pendingDiazepamDose = ref<string | null>(null);
const diazepamOptions = DEFAULT_FORMULARY.bedtime[0];

/**
 * Diazepam card attributes. The intrinsic timing fact always shows; the
 * OSA / CPAP airway-risk caution is appended only once OSA status has been
 * assessed *as a risk* — a no-OSA patient never sees an irrelevant red
 * warning, and before assessment the disabled buttons + modal own the gate.
 */
const diazepamAttributes = computed<ReadonlyArray<DrugAttribute>>(() => {
  const base = diazepamOptions?.attributes ?? [];
  const osaRisk = osaStatus.value === 'osa-diagnosed' || osaStatus.value === 'cpap-prescribed';
  if (!osaRisk) return base;
  return [
    ...base,
    {
      label: 'Caution',
      value: 'Documented OSA / CPAP — airway risk; requires explicit override',
      tone: 'limit',
    },
  ];
});

/**
 * Larger ASA-I patients often clear benzodiazepines fast enough that the
 * default 5 mg bedtime dose underwhelms; the legacy app surfaced a yellow
 * hint suggesting 10 mg. Only fires for healthy patients — anything ASA II+
 * is too heterogeneous to nudge from weight alone.
 */
const heavyAsa1DiazepamHint = computed(
  () => weightLb.value !== null && weightLb.value > 200 && asaClass.value === 'I',
);

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
</script>

<template>
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 1 · Pre-Sedation Assessment</p>
      <h1 class="title-display">Patient Clearance</h1>
    </header>

    <UiCard tint="ph1">
      <p class="heading">Patient Identification</p>
      <UiStack :gap="3" class="mt-2">
        <UiField id="field-pt" label="Patient name" required :invalid="isMissing('pt')">
          <UiTextInput v-model="name" placeholder="Patient name" block />
        </UiField>
        <UiRow :gap="3" wrap>
          <UiField id="field-mrn" label="MRN" required :invalid="isMissing('mrn')">
            <UiTextInput v-model="mrn" placeholder="MRN" inputmode="numeric" />
          </UiField>
          <UiField id="field-prov" label="Provider" required :invalid="isMissing('prov')">
            <UiTextInput v-model="provider" placeholder="Dr. Hassan" />
          </UiField>
        </UiRow>
        <UiField label="Dental assistant(s)" hint="comma-separated">
          <UiTextInput
            v-model="assistants"
            placeholder="e.g. Raycha Dobbins EFDA, Yvette Vega EFDA"
            block
          />
        </UiField>
        <UiField label="Procedure" hint="optional">
          <UiTextInput v-model="procedure" placeholder="e.g. EXT #19, root canal #14" />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Caregiver</p>
      <UiRow :gap="3" wrap class="mt-2">
        <UiField
          id="field-care_name"
          label="Caregiver name"
          required
          :invalid="isMissing('care_name')"
        >
          <UiTextInput v-model="careName" placeholder="Caregiver" />
        </UiField>
        <UiField
          id="field-care_phone"
          label="Caregiver phone"
          required
          :invalid="isMissing('care_phone')"
        >
          <UiTextInput v-model="carePhone" placeholder="(###) ###-####" inputmode="tel" />
        </UiField>
      </UiRow>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Vitals & Metrics</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField
            id="field-weight"
            label="Weight"
            hint="lbs"
            required
            :invalid="isMissing('weight')"
          >
            <UiNumberInput v-model="weightLb" placeholder="lbs" />
          </UiField>
          <UiField
            id="field-height"
            label="Height"
            hint="ft &prime; in"
            required
            :invalid="isMissing('height')"
          >
            <UiHeightInput v-model="heightIn" />
          </UiField>
          <UiField
            id="field-patient_age"
            label="Age"
            hint="yrs"
            required
            :invalid="isMissing('patient_age')"
          >
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
        <UiField
          id="field-last_exam"
          label="Date of last exam"
          required
          :invalid="isMissing('last_exam')"
        >
          <UiTextInput v-model="lastExamDate" type="date" />
        </UiField>
      </UiStack>

      <!-- Live readouts — Apple Health-style stat cards. On iPad landscape
           these move to the right rail (see <template #rail> below) so the
           inline copy is hidden via .narrow-only. -->
      <VitalsStatGrid class="mt-2 narrow-only" />

      <UiBanner
        v-if="lastExam && !lastExam.valid"
        tone="caution"
        title="Out-of-date physical exam"
        icon="⚠"
        class="mt-2"
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
          id="field-meds_verified"
          v-model="medsVerified"
          required
          :invalid="isMissing('meds_verified')"
          label="Drug interactions checked in Epocrates"
          hint="Print + scan to chart before sedation"
        />
        <UiField
          id="field-osa_history"
          label="OSA / CPAP history"
          required
          :invalid="isMissing('osa_history')"
        >
          <UiSelect v-model="osaStatus" :options="osaOptions" placeholder="Select…" block />
        </UiField>
        <UiCheckbox v-model="diabetic" label="Diabetic" hint="Reveals baseline glucose field" />
        <UiField
          v-if="diabetic"
          id="field-baseline_glucose"
          label="Baseline glucose"
          hint="mg/dL"
          required
          :invalid="isMissing('baseline_glucose')"
        >
          <UiNumberInput v-model="baselineGlucose" placeholder="mg/dL" />
        </UiField>

        <UiField label="Current medications" hint="comma-separated; include dose + frequency">
          <UiTextarea
            v-model="medicationsList"
            placeholder="e.g. Lisinopril 10 mg qd, Metformin 500 mg bid"
            :rows="3"
            block
          />
        </UiField>
        <UiField label="Allergies" hint="drug + reaction">
          <UiTextarea
            v-model="allergiesList"
            placeholder="e.g. Penicillin → hives; Codeine → nausea"
            :rows="2"
            block
          />
        </UiField>
        <UiField label="Past hospitalisations" hint="year + reason">
          <UiTextarea
            v-model="hospitalisations"
            placeholder="e.g. 2022 — pneumonia; 2018 — MVA"
            :rows="2"
            block
          />
        </UiField>
        <UiField label="Past surgeries" hint="year + procedure">
          <UiTextarea
            v-model="surgeries"
            placeholder="e.g. 2021 — appendectomy; 2015 — wisdom teeth"
            :rows="2"
            block
          />
        </UiField>
        <UiField label="Anesthesia history" hint="prior reactions to anesthesia / sedation">
          <UiTextarea
            v-model="anesthesiaHistory"
            placeholder="e.g. PONV with general; uneventful with IV sedation 2023"
            :rows="2"
            block
          />
        </UiField>
        <UiField label="Family history" hint="relevant cardiac / anesthesia / bleeding">
          <UiTextarea
            v-model="familyHistory"
            placeholder="e.g. Father — MI age 58; no known MH"
            :rows="2"
            block
          />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Social Screening</p>
      <UiStack :gap="3" class="mt-2">
        <UiField
          id="field-smoking_status"
          label="Smoking status"
          required
          :invalid="isMissing('smoking_status')"
        >
          <UiSelect v-model="smokingStatus" :options="smokingOptions" placeholder="Select…" block />
        </UiField>
        <UiField
          v-if="smokingStatus === 'current'"
          label="Cigarettes per day"
          hint="drives nicotine protocol timing"
        >
          <UiNumberInput v-model="cigarettesPerDay" placeholder="cigs/day" :min="0" :max="100" />
        </UiField>
        <UiBanner v-if="nicotineRec" tone="caution" title="Pre-op nicotine protocol" icon="🚬">
          {{ nicotineRec.instruction }} ({{ nicotineRec.hoursBefore }} hr before appointment). Based
          on <strong>{{ cigarettesPerDay ?? 20 }}</strong> cigs/day.
        </UiBanner>
        <UiRow :gap="3" wrap>
          <UiField label="Alcohol" hint="drinks per week">
            <UiNumberInput v-model="alcoholPerWeek" placeholder="drinks/wk" :min="0" />
          </UiField>
        </UiRow>
        <UiField label="Recreational drugs" hint="substance + frequency; leave blank if none">
          <UiTextarea
            v-model="recreationalDrugs"
            placeholder="e.g. Cannabis — weekends; cocaine — denies"
            :rows="2"
            block
          />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Safety Checklist</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField
            id="field-mallampati"
            label="Mallampati"
            required
            :invalid="isMissing('mallampati')"
          >
            <UiSelect v-model="mallampati" :options="mallampatiOptions" placeholder="Select…" />
          </UiField>
          <UiField
            id="field-asa_class"
            label="ASA class"
            required
            :invalid="isMissing('asa_class')"
          >
            <UiSelect v-model="asaClass" :options="asaOptions" placeholder="Select…" />
          </UiField>
        </UiRow>
        <UiCheckbox
          id="field-npo_confirmed"
          v-model="npoConfirmed"
          required
          :invalid="isMissing('npo_confirmed')"
          label="NPO confirmed"
          hint="Solids ≥6h · clear liquids ≥2h"
        />
        <UiCheckbox
          id="field-consent_obtained"
          v-model="consentObtained"
          required
          :invalid="isMissing('consent_obtained')"
          label="Informed consent obtained"
          hint="Risks / benefits / alternatives discussed and consent signed"
        />
        <UiCheckbox
          id="field-ekg_placed"
          v-model="ekgPlaced"
          required
          :invalid="isMissing('ekg_placed')"
          label="EKG leads placed"
          hint="3-lead — verify rhythm and waveform"
        />
        <UiCheckbox
          id="field-emergency_drugs_available"
          v-model="emergencyDrugsAvailable"
          required
          :invalid="isMissing('emergency_drugs_available')"
          label="Emergency drugs accessible"
          hint="Flumazenil · Naloxone · Epinephrine · Atropine all in reach"
        />
        <UiCheckbox
          id="field-monitoring_equipment_checked"
          v-model="monitoringEquipmentChecked"
          required
          :invalid="isMissing('monitoring_equipment_checked')"
          label="Monitors functional"
          hint="SpO₂ · BP · EtCO₂ · pulse-ox tested and reading"
        />
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Bedtime Premedication <span class="muted body">· optional</span></p>
      <DrugAttributes :attributes="diazepamAttributes" />
      <UiBanner
        v-if="heavyAsa1DiazepamHint"
        tone="caution"
        title="Heavier ASA I patient"
        icon="⚖"
        class="mt-2"
      >
        Over 200 lb and ASA I — consider <strong>10 mg</strong> at bedtime; 5 mg often underdoses.
      </UiBanner>
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

    <div class="phase-nav">
      <button
        type="button"
        class="phase-advance"
        :class="{
          'phase-advance--ready': isPhase1Complete,
          'phase-advance--locked': !isPhase1Complete,
        }"
        @click="advanceOrShowMissing"
      >
        <template v-if="isPhase1Complete">
          <span class="phase-advance-icon" aria-hidden="true">→</span>
          <span class="phase-advance-text">Continue to Phase 2 — Oral Sedation</span>
        </template>
        <template v-else>
          <span class="phase-advance-icon" aria-hidden="true">🔒</span>
          <span class="phase-advance-text">
            {{ missingCount }} required field{{ missingCount === 1 ? '' : 's' }} missing — show me
          </span>
        </template>
      </button>
    </div>

    <template #rail>
      <PatientSummaryCard />
      <VitalsStatGrid />
      <UiBanner
        v-for="alert in safetyAlerts"
        :key="alert.code"
        :tone="alert.tone === 'danger' ? 'limit' : 'caution'"
        :title="alert.label"
        icon="⚠"
      />
    </template>
  </PhaseLayout>
</template>

<style scoped>
/* Inline copy of VitalsStatGrid inside Vitals & Metrics. The right rail
   takes ownership at iPad-landscape widths, so we hide the inline copy
   there to avoid a duplicate. */
@media (min-width: 1024px) {
  .narrow-only {
    display: none;
  }
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

/* Bottom-of-page advance button. Two tones:
   - ready: tinted with the destination phase's color (Phase 2 = purple) so
     the button visually previews where it leads, matching PhaseFooterNav.
   - locked: warn-yellow because it doesn't actually navigate — clicks
     trigger the "show me what's missing" validation feedback path. */
.phase-nav {
  margin-top: var(--sp-4);
  display: flex;
  justify-content: flex-end;
}
.phase-advance {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 20px;
  border-radius: var(--r-md);
  font-size: var(--type-body);
  font-weight: var(--weight-bold);
  letter-spacing: 0.2px;
  cursor: pointer;
  border: 1px solid transparent;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    border-color var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
  min-height: 52px;
}
.phase-advance:active {
  transform: scale(0.98);
}
.phase-advance--ready {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
}
.phase-advance--ready:hover {
  background: var(--color-surface-elevated);
}
.phase-advance--locked {
  background: var(--color-warn-soft);
  border-color: var(--color-warn);
  color: var(--color-warn);
}
.phase-advance--locked:hover {
  background: var(--color-warn-soft);
}
.phase-advance-icon {
  font-size: 18px;
  line-height: 1;
}
</style>
