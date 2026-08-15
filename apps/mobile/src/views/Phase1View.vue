<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

import { alcoholBucketValue, usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { useAssessmentAudit } from '@/composables/useAssessmentAudit';
import { useInventoryStatus } from '@/composables/useInventoryStatus';
import { useGateFeedback } from '@/composables/useGateFeedback';
import { useOtherableSelect } from '@/composables/useOtherableSelect';
import { useMrnResolve } from '@/composables/useMrnResolve';
import { usePullHistory } from '@/composables/usePullHistory';
import ChartHistoryPanel from '@/components/ChartHistoryPanel.vue';
import { haptic } from '@/composables/useHaptics';
import DrugAttributes from '@/components/DrugAttributes.vue';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import VitalsStatGrid from '@/components/VitalsStatGrid.vue';
import {
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiChipGroup,
  UiDrugButton,
  UiField,
  UiHeightInput,
  UiModal,
  UiChipMultiSelect,
  UiNumberInput,
  UiQuickAddChips,
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

/**
 * Live kit check behind the "Emergency drugs accessible" attestation.
 * Mount-time snapshot (day granularity). `limit` tone only when stock is
 * truly expired; unknown-date-only problems soften to `caution`.
 */
const kitStatus = useInventoryStatus();
const kitAlert = computed<{ tone: 'limit' | 'caution'; detail: string } | null>(() => {
  const bad = kitStatus.needsAttention;
  if (bad.length === 0) return null;
  const trulyExpired = bad.some((c) => c.status.valid && c.status.daysLeft < 0);
  const names = bad.slice(0, 3).map((c) => c.item.drug);
  const more = bad.length > names.length ? ` +${bad.length - names.length} more` : '';
  const onOrder = kitStatus.summary.onOrder;
  const orderNote =
    onOrder > 0 ? ` · ${onOrder} replacement${onOrder === 1 ? '' : 's'} on order` : '';
  return {
    tone: trulyExpired ? 'limit' : 'caution',
    detail: `${names.join(', ')}${more} — expired or missing a readable date${orderNote}.`,
  };
});

const {
  name,
  mrn,
  provider,
  assistants,
  procedure,
  careName,
  carePhone,
  careRelation,
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
  medicalProblems,
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

// Provider: a per-practice roster from the formulary, with an "Other…"
// escape so a covering/locum dentist is still chartable (required +
// medicolegal). Store seeds the first roster entry as the default.
const {
  options: providerOptions,
  isOther: providerIsOther,
  selectValue: providerValue,
} = useOtherableSelect(provider, DEFAULT_FORMULARY.picklists.providers);

// Dental assistants: a per-practice roster from the formulary (swapped at
// setup), not free text. `assistants` stays a single string so the clinical
// note contract is untouched; we join with "; " because the names embed a
// ", Title" and would otherwise be unsplittable. Selection mirrors formulary
// order for a stable, readable record.
const ASSISTANT_SEP = '; ';
const assistantRoster = DEFAULT_FORMULARY.picklists.dentalAssistants;
const selectedAssistants = computed<ReadonlySet<string>>(
  () =>
    new Set(
      assistants.value
        .split(ASSISTANT_SEP)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
);
function isAssistantOn(nameTitle: string): boolean {
  return selectedAssistants.value.has(nameTitle);
}
function toggleAssistant(nameTitle: string): void {
  const next = new Set(selectedAssistants.value);
  if (next.has(nameTitle)) next.delete(nameTitle);
  else next.add(nameTitle);
  assistants.value = assistantRoster.filter((a) => next.has(a)).join(ASSISTANT_SEP);
}

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

// Sticky-bar clearance counter taps arrive as a counter bump so every tap
// re-scrolls even while the attempted flag is already raised.
watch(
  () => patient.phase1ScrollRequests,
  () => void scrollToFirstMissing(),
);

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

/**
 * ASA chip row — Roman numeral on the chip, descriptive subtitle below
 * via `show-caption` on UiChipGroup. Lets the chips stay tight + uniform
 * regardless of the active class's tail length.
 */
const asaOptions = [
  { value: 'I', label: 'I', caption: 'Healthy' },
  { value: 'II', label: 'II', caption: 'Mild systemic disease' },
  { value: 'III', label: 'III', caption: 'Severe systemic disease' },
  { value: 'IV', label: 'IV', caption: 'Life-threatening' },
];
const mallampatiOptions = [
  { value: 'I', label: 'I' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
];
const osaOptions = [
  { value: 'none', label: 'None' },
  { value: 'osa-diagnosed', label: 'OSA' },
  { value: 'cpap-prescribed', label: 'CPAP' },
];
const smokingOptions = [
  { value: 'never', label: 'Never' },
  { value: 'current', label: 'Current' },
  { value: 'former', label: 'Former' },
];

// Drinks per week as bucket chips. Above ~21/wk is already "very heavy"
// and the exact number stops changing management, so 4 bands cover the
// clinically meaningful range. The stored ref keeps the bucket midpoint
// (or lower bound for the open-ended top bucket) so the printed note +
// audit log can describe the patient's drinking band even though we no
// longer collect an exact weekly count. Legacy stored exact values like
// "9 drinks/wk" still highlight the correct chip on next load and get
// saved as the bucket midpoint on the next edit.
const alcoholOptions = [
  { value: 0, label: '0' },
  { value: 4, label: '1–7' },
  { value: 11, label: '8–14' },
  { value: 15, label: '15+' },
];
const alcoholValue = computed<number>({
  get: () => alcoholBucketValue(alcoholPerWeek.value) ?? -1,
  set: (v) => {
    // -1 is the chip-group's "deselect" sentinel — map it back to the
    // store's "no answer" null so a re-render doesn't relight a stale chip.
    alcoholPerWeek.value = v === -1 ? null : v;
  },
});

// Same bucket idiom for cigarettes/day. Exact count above ~20/day stops
// shifting nicotine-protocol math meaningfully, so 4 bands cover the
// clinically useful range. Storage = bucket midpoint (or lower bound for
// the open-ended top). Legacy exact stored values map to the right bucket.
const cigaretteOptions = [
  { value: 5, label: '<10' },
  { value: 15, label: '10–20' },
  { value: 30, label: '20–40' },
  { value: 40, label: '40+' },
];
function cigaretteBucketValue(n: number | null): number {
  if (n === null) return -1;
  if (n < 10) return 5;
  if (n <= 20) return 15;
  if (n <= 40) return 30;
  return 40;
}
function cigaretteBucketLabel(n: number | null): string {
  const b = cigaretteBucketValue(n);
  if (b === 5) return '<10';
  if (b === 15) return '10–20';
  if (b === 30) return '20–40';
  if (b === 40) return '40+';
  return '—';
}
const cigaretteValue = computed<number>({
  get: () => cigaretteBucketValue(cigarettesPerDay.value),
  set: (v) => {
    cigarettesPerDay.value = v === -1 ? null : v;
  },
});

// Quick-add term lists for the medical-history textareas. Every patient
// gets these fields charted; the chips let one tap drop the
// overwhelmingly-most-common answer in without typing. Free-text in the
// textarea below is still the source of truth — chips just append (with a
// case-insensitive dedup so double-tapping is a no-op). Medication chips
// cover the most-prescribed chronic drugs in US adults beyond a "None"
// baseline (statin / hypothyroid / two antihypertensives / diabetes).
const allergyTerms = ['NKDA', 'Penicillin', 'Sulfa', 'Latex'];
const medicationTerms = [
  'None',
  'Metformin',
  'Insulin',
  'Lisinopril',
  'Atorvastatin',
  'Levothyroxine',
  'Amlodipine',
];
const hospitalisationTerms = ['None'];
const surgeryTerms = ['None', 'Tonsillectomy', 'Wisdom teeth'];
const anesthesiaHistoryTerms = ['None', 'Uneventful', 'Prior IV sedation'];
const familyHistoryTerms = [
  'Non-contributory',
  'MH (malignant hyperthermia)',
  'Cardiac',
  'Respiratory',
];
const recreationalDrugTerms = ['Denies', 'Cannabis'];

// Medical problems chip cloud — common chronic conditions for moderate IV
// sedation pre-assessment. Multi-select; tap toggles. Picking "Diabetes"
// here is bidirectionally synced with the `Diabetic` checkbox below so
// the chart stays consistent regardless of which control the provider
// touched (store watchers handle the sync).
const medicalProblemOptions = [
  { value: 'CVD', label: 'CVD' },
  { value: 'Hypertension', label: 'Hypertension' },
  { value: 'Diabetes', label: 'Diabetes' },
  { value: 'Asthma', label: 'Asthma' },
  { value: 'Psychological', label: 'Psychological' },
  { value: 'Pregnancy', label: 'Pregnancy' },
  { value: 'Hypothyroidism', label: 'Hypothyroidism' },
  { value: 'GERD', label: 'GERD' },
  { value: 'Liver disease', label: 'Liver disease' },
  { value: 'Chronic pain', label: 'Chronic pain' },
  { value: 'Restless Leg Syndrome', label: 'RLS' },
];

/**
 * Chart lookup. Both of these are inert with no Open Dental keys stored: no
 * timer, no request, no extra UI — Phase 1 is exactly the form it was.
 * Neither ever gates the case; a lookup that fails or times out costs the
 * clinician nothing but the offer.
 */
const mrnLookup = useMrnResolve();
const chartHistory = usePullHistory(medicalProblemOptions.map((o) => o.value));

function pullHistory(): void {
  const patNum = patient.resolvedIdentity?.patNum;
  if (patNum !== undefined) void chartHistory.pull(patNum);
}

/**
 * Morning-of-sedation guidance for diabetic patients. NPO removes the
 * meal the morning doses anticipate, so we hold whatever the patient
 * takes (orals and injected insulin alike). Insulin pump is the lone
 * exception: leave it running on basal rate because suspending it
 * during NPO is the path to ketoacidosis. Three short rules read
 * faster at the chair than a typed split that said almost the same
 * thing for both types.
 */
const diabetesGuidance = computed(() => {
  if (!diabetic.value) return null;
  return {
    title: 'Diabetic · morning of sedation',
    lines: [
      'NPO ≥ 6 h before appointment.',
      'Hold morning diabetes meds: oral agents (Metformin, Januvia, etc.) and any injected insulin.',
      'Insulin pump: leave on basal rate. Suspending while NPO risks DKA.',
    ],
  };
});

// Caregiver relation — same picklist Phase 4's discharge companion uses.
// Phase 4 auto-fills its companion fields from these caregiver entries on
// mount so the responsible adult is typically only named once at intake.
const careRelationOptions = DEFAULT_FORMULARY.picklists.companionRelations.map((r) => ({
  value: r,
  label: r,
}));

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
      value: 'Documented OSA / CPAP · airway risk; requires explicit override',
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
      tone: 'safe',
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
      body: 'Select the patient’s OSA / CPAP status before prescribing bedtime diazepam. OSA changes the airway-risk math.',
      tone: 'primary' as const,
      confirmLabel: 'Got it',
      hideCancel: true,
    };
  }
  return {
    title: 'OSA contraindication',
    body: 'Documented OSA or CPAP. Diazepam carries significant airway risk at bedtime. Prescribe only with explicit clinical justification.',
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
      <p class="heading">Case Staff</p>
      <UiStack :gap="3" class="mt-2">
        <UiField id="field-prov" label="Provider" :invalid="isMissing('prov')">
          <UiSelect v-model="providerValue" :options="providerOptions" block />
          <UiTextInput v-if="providerIsOther" v-model="provider" class="mt-2" />
        </UiField>
        <UiField label="Dental assistant(s)">
          <UiStack :gap="2">
            <UiCheckbox
              v-for="a in assistantRoster"
              :key="a"
              :model-value="isAssistantOn(a)"
              :label="a"
              @update:model-value="toggleAssistant(a)"
            />
          </UiStack>
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Patient Identification</p>
      <UiStack :gap="3" class="mt-2">
        <p class="caption">Patient</p>
        <UiField id="field-mrn" label="MRN" required :invalid="isMissing('mrn')">
          <UiTextInput v-model="mrn" inputmode="numeric" @blur="mrnLookup.resolveNow" />
        </UiField>

        <!-- Chart identity. The MRN leads the form now, so both cross-check
             fields are blank when this resolves and neither can disagree with
             the chart it came from — which makes the clinician reading this
             against the person in the chair the actual wrong-patient guard.
             It is presented to be read, not glanced past. Advisory in every
             state, including not-found: walk-ins exist and the number can be
             corrected later. Nothing here blocks typing or progress. -->
        <div v-if="mrnLookup.enabled.value" class="mrn-check">
          <p v-if="mrnLookup.status.value === 'checking'" class="mrn-line mrn-muted">
            Checking chart…
          </p>

          <div
            v-else-if="mrnLookup.status.value === 'resolved'"
            class="ident"
            :class="mrnLookup.identityConfirmed.value ? 'ident-done' : 'ident-ask'"
          >
            <p class="ident-name">{{ mrnLookup.chartName.value }}</p>
            <p class="ident-meta">
              <template v-if="mrnLookup.chartBirthdate.value"
                >DOB {{ mrnLookup.chartBirthdate.value }}</template
              ><template v-if="mrnLookup.chartAge.value !== null">
                · {{ mrnLookup.chartAge.value }}y</template
              >
              · ID {{ mrn }}
            </p>
            <UiButton
              v-if="!mrnLookup.identityConfirmed.value"
              tone="primary"
              block
              class="mt-2"
              @click="mrnLookup.confirmIdentity()"
            >
              Yes, this is the patient
            </UiButton>
            <p v-else class="ident-ok">✓ Confirmed</p>
          </div>

          <p v-else-if="mrnLookup.status.value === 'not-found'" class="mrn-line mrn-warn">
            ✕ No patient with ID {{ mrn }}
          </p>
          <p v-else-if="mrnLookup.status.value === 'unavailable'" class="mrn-line mrn-muted">
            Couldn't verify — {{ mrnLookup.unavailableReason.value || 'offline' }}
          </p>

          <p v-if="mrnLookup.autoFilled.value.length > 0" class="mrn-line mrn-muted">
            Filled {{ mrnLookup.autoFilled.value.join(' and ') }} from the chart — check it against
            the patient.
          </p>

          <!-- Still live once the name is edited by hand: an auto-filled name
               that gets corrected is compared again immediately. -->
          <div v-for="m in mrnLookup.mismatches.value" :key="m.kind" class="mrn-mismatch">
            <span>{{ m.message }}</span>
            <button
              type="button"
              class="mrn-fix"
              @click="m.kind === 'name' ? mrnLookup.applyChartName() : mrnLookup.applyChartAge()"
            >
              {{ m.kind === 'name' ? 'Use chart spelling' : `Use ${m.chartValue}` }}
            </button>
          </div>

          <button
            v-if="mrnLookup.identityConfirmed.value && chartHistory.canPull.value"
            type="button"
            class="mrn-fix mrn-pull"
            :disabled="chartHistory.status.value === 'loading'"
            @click="pullHistory"
          >
            {{
              chartHistory.status.value === 'loading' ? 'Reading chart…' : 'Pull history from chart'
            }}
          </button>
        </div>

        <UiField id="field-pt" label="Patient name" required :invalid="isMissing('pt')">
          <UiTextInput v-model="name" block />
        </UiField>

        <!-- Own full-width textarea: procedures are naturally phrases and
             this was the last clipping single-line free-text field. -->
        <UiField label="Procedure">
          <UiTextarea v-model="procedure" :rows="2" />
        </UiField>

        <p class="caption mt-1">Clearance</p>
        <UiField
          id="field-last_exam"
          label="Date of last medical exam"
          required
          :invalid="isMissing('last_exam')"
        >
          <UiTextInput v-model="lastExamDate" type="date" block />
        </UiField>
        <UiBanner
          v-if="lastExam && !lastExam.valid"
          tone="caution"
          title="Out-of-date medical exam"
          icon="⚠"
        >
          Patient is {{ age }} y/o. Requires an exam within the last
          <strong>{{ lastExam.cutoffMonths }}</strong> months. Last exam recorded:
          {{ lastExam.elapsedMonths }} months ago. Update before sedation.
        </UiBanner>

        <p class="caption mt-1">Caregiver</p>
        <UiRow :gap="3" wrap>
          <UiField id="field-care_name" label="Name" required :invalid="isMissing('care_name')">
            <UiTextInput v-model="careName" />
          </UiField>
          <UiField label="Relation">
            <UiSelect
              v-model="careRelation"
              :options="careRelationOptions"
              placeholder="Select…"
              block
            />
          </UiField>
          <UiField id="field-care_phone" label="Phone" required :invalid="isMissing('care_phone')">
            <UiTextInput v-model="carePhone" inputmode="tel" />
          </UiField>
        </UiRow>
      </UiStack>
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
            <UiNumberInput v-model="weightLb" />
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
            <UiNumberInput v-model="age" />
          </UiField>
        </UiRow>
        <UiRow :gap="3" wrap>
          <UiField label="Baseline BP" hint="mmHg">
            <UiBpInput v-model="baselineBp" />
          </UiField>
          <UiField label="Baseline SpO₂" hint="%">
            <UiNumberInput v-model="baselineSpo2" :min="0" :max="100" />
          </UiField>
        </UiRow>
      </UiStack>

      <!-- Live readouts — Apple Health-style stat cards. On iPad landscape
           these move to the right rail (see <template #rail> below) so the
           inline copy is hidden via .narrow-only. -->
      <VitalsStatGrid class="mt-2 narrow-only" />
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Medical History</p>
      <UiStack :gap="3" class="mt-2">
        <p class="caption">Airway assessment</p>
        <UiField
          id="field-mallampati"
          label="Mallampati"
          required
          :invalid="isMissing('mallampati')"
        >
          <UiChipGroup v-model="mallampati" :options="mallampatiOptions" size="tap-target" />
        </UiField>
        <UiField id="field-asa_class" label="ASA class" required :invalid="isMissing('asa_class')">
          <UiChipGroup v-model="asaClass" :options="asaOptions" show-caption size="tap-target" />
        </UiField>

        <p class="caption mt-1">Conditions</p>
        <ChartHistoryPanel :history="chartHistory" class="mb-2" />
        <UiField label="Medical problems">
          <UiChipMultiSelect
            v-model="medicalProblems"
            :options="medicalProblemOptions"
            allow-custom
            custom-placeholder="Type a condition"
          />
        </UiField>
        <UiBanner v-if="diabetesGuidance" tone="caution" :title="diabetesGuidance.title">
          <ul class="diabetes-guidance">
            <li v-for="line in diabetesGuidance.lines" :key="line">{{ line }}</li>
          </ul>
        </UiBanner>
        <UiField
          v-if="diabetic"
          id="field-baseline_glucose"
          label="Baseline glucose"
          hint="mg/dL"
          required
          :invalid="isMissing('baseline_glucose')"
        >
          <UiNumberInput v-model="baselineGlucose" />
        </UiField>
        <UiField
          id="field-osa_history"
          label="OSA / CPAP history"
          required
          :invalid="isMissing('osa_history')"
        >
          <UiChipGroup v-model="osaStatus" :options="osaOptions" size="tap-target" />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Patient History</p>
      <UiStack :gap="3" class="mt-2">
        <p class="caption">Current</p>
        <UiField label="Current medications">
          <UiQuickAddChips v-model="medicationsList" :terms="medicationTerms" />
          <UiTextarea v-model="medicationsList" :rows="3" block />
        </UiField>
        <UiField label="Allergies">
          <UiQuickAddChips v-model="allergiesList" :terms="allergyTerms" />
          <UiTextarea v-model="allergiesList" :rows="2" block />
        </UiField>

        <p class="caption mt-1">Past</p>
        <UiField label="Past hospitalisations">
          <UiQuickAddChips v-model="hospitalisations" :terms="hospitalisationTerms" />
          <UiTextarea v-model="hospitalisations" :rows="2" block />
        </UiField>
        <UiField label="Past surgeries">
          <UiQuickAddChips v-model="surgeries" :terms="surgeryTerms" />
          <UiTextarea v-model="surgeries" :rows="2" block />
        </UiField>
        <UiField label="Anesthesia history">
          <UiQuickAddChips v-model="anesthesiaHistory" :terms="anesthesiaHistoryTerms" />
          <UiTextarea v-model="anesthesiaHistory" :rows="2" block />
        </UiField>

        <p class="caption mt-1">Family</p>
        <UiField label="Family history">
          <UiQuickAddChips v-model="familyHistory" :terms="familyHistoryTerms" />
          <UiTextarea v-model="familyHistory" :rows="2" block />
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
          inline
          :invalid="isMissing('smoking_status')"
        >
          <UiChipGroup v-model="smokingStatus" :options="smokingOptions" />
        </UiField>
        <UiField v-if="smokingStatus === 'current'" label="Cigarettes" hint="per day" inline>
          <UiChipGroup
            v-model="cigaretteValue"
            :options="cigaretteOptions"
            allow-deselect
            :deselect-value="-1"
          />
        </UiField>
        <UiBanner v-if="nicotineRec" tone="caution" title="Pre-op nicotine protocol">
          {{ nicotineRec.instruction }} ({{ nicotineRec.hoursBefore }} hr before appointment). Based
          on <strong>{{ cigaretteBucketLabel(cigarettesPerDay) }}</strong> cigs/day.
        </UiBanner>
        <UiRow :gap="3" wrap>
          <UiField label="Alcohol" hint="drinks per week" inline>
            <UiChipGroup
              v-model="alcoholValue"
              :options="alcoholOptions"
              allow-deselect
              :deselect-value="-1"
            />
          </UiField>
        </UiRow>
        <UiField label="Recreational drugs">
          <UiQuickAddChips v-model="recreationalDrugs" :terms="recreationalDrugTerms" />
          <UiTextarea v-model="recreationalDrugs" :rows="2" block />
        </UiField>
      </UiStack>
    </UiCard>

    <UiCard tint="ph1">
      <p class="heading">Safety Checklist</p>
      <UiStack :gap="3" class="mt-2">
        <UiCheckbox
          id="field-npo_confirmed"
          v-model="npoConfirmed"
          required
          :invalid="isMissing('npo_confirmed')"
          label="NPO confirmed"
          hint="Solids ≥6h · clear liquids ≥2h"
        />
        <UiCheckbox
          id="field-meds_verified"
          v-model="medsVerified"
          required
          :invalid="isMissing('meds_verified')"
          label="Drug interactions checked in Epocrates"
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
          hint="3-lead · verify rhythm and waveform"
        />
        <UiCheckbox
          id="field-emergency_drugs_available"
          v-model="emergencyDrugsAvailable"
          required
          :invalid="isMissing('emergency_drugs_available')"
          label="Emergency drugs accessible"
          hint="Flumazenil · Naloxone · Epinephrine · Atropine · Albuterol · Nitroglycerin · Dextrose · all in reach"
        />
        <!-- Warn-don't-block (owner decision): the checkbox stays a clinical
             attestation; the app just refuses to stay silent when its own
             inventory data contradicts what's being attested. -->
        <UiBanner
          v-if="kitAlert"
          :tone="kitAlert.tone"
          icon="⚠"
          title="Emergency kit has expired or unverified stock"
        >
          {{ kitAlert.detail }}
          <div class="kit-alert-actions">
            <button type="button" class="kit-alert-btn" @click="void router.push('/inventory')">
              Review inventory
            </button>
          </div>
        </UiBanner>
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
        class="mt-2"
      >
        Over 200 lb and ASA I. Consider <strong>10 mg</strong> at bedtime; 5 mg often underdoses.
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
          <span class="phase-advance-text">Continue to Phase 2 · Oral Sedation</span>
        </template>
        <template v-else>
          <span class="phase-advance-icon" aria-hidden="true">🔒</span>
          <span class="phase-advance-text">
            {{ missingCount }} required field{{ missingCount === 1 ? '' : 's' }} missing · show me
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
/* Diabetes morning-of-sedation guidance — tight bullet list inside a
   UiBanner. Matches the banner body's voice without forcing a heavier
   `.body` paragraph treatment. */
.diabetes-guidance {
  margin: 0;
  padding-left: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.diabetes-guidance li {
  font-size: var(--type-footnote);
  line-height: 1.45;
}

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

/* Kit-alert action — same idiom as the launch banner's buttons. */
.kit-alert-actions {
  margin-top: var(--sp-2);
}
.kit-alert-btn {
  min-height: 44px;
  padding: 8px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.kit-alert-btn:active {
  transform: scale(0.97);
}

/* Inline chart identity under the MRN field. Advisory styling on purpose:
   nothing here is an error state that stops the case. */
.mrn-check {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: -4px;
}
.mrn-line {
  font-size: var(--type-footnote);
}
.mrn-ok {
  color: var(--color-safe, #047857);
}
.mrn-warn {
  color: var(--color-limit, #be123c);
}
.mrn-muted {
  color: var(--color-text-secondary);
}
.mrn-mismatch {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2);
  font-size: var(--type-footnote);
  color: var(--color-caution, #b45309);
}
.mrn-fix {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent, #2563eb);
  text-decoration: underline;
  cursor: pointer;
}
.mrn-pull {
  align-self: flex-start;
  margin-top: 2px;
}
.mrn-fix:disabled {
  color: var(--color-text-secondary);
  cursor: default;
  text-decoration: none;
}

/* The identity is the wrong-patient guard now that the MRN leads the form,
   so it is sized to be read rather than skimmed. */
.ident {
  border-radius: var(--radius-md, 10px);
  padding: var(--sp-3);
  border: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
}
.ident-ask {
  border-color: var(--color-accent, #2563eb);
}
.ident-name {
  font-size: var(--type-title);
  font-weight: 700;
  line-height: 1.2;
}
.ident-meta {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.ident-ok {
  margin-top: var(--sp-2);
  font-size: var(--type-footnote);
  color: var(--color-safe, #047857);
}
</style>
