<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';

import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useUndoStore } from '@/stores/undo';
import { useEventLogStore } from '@/stores/event-log';
import { useNow } from '@/composables/useNow';
import { haptic } from '@/composables/useHaptics';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import {
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiField,
  UiNumberInput,
  UiPercentBar,
  UiRow,
  UiSelect,
  UiSignaturePad,
  UiStack,
  UiStatCard,
  UiTextarea,
  UiTextInput,
} from '@sedation-pro/ui';
import {
  classifyEncounter,
  dismissalSafety,
  releaseEligibility,
  type DismissalBlockerCode,
} from '@sedation-pro/clinical';
import type { ActionState, BpValue } from '@sedation-pro/ui';

const router = useRouter();

const iv = useIVStore();
const patient = usePatientStore();
const recovery = useRecoveryStore();
const undo = useUndoStore();
const now = useNow(1000);

const eventLog = useEventLogStore();
const { events } = storeToRefs(eventLog);
const { lastIvMedAt, lastFlumazenilAt } = storeToRefs(iv);

// Last in-office sedative across *any* route. Oral pre-med lives only in
// the event log; bedtime ('Bedtime Premedication') is take-home and is
// deliberately not counted. This feeds both the observation countdown and
// the encounter classification.
const lastOralPremedAt = computed<number | null>(() => {
  let latest: number | null = null;
  for (const e of events.value) {
    if (e.event === 'Preoperative Oral Dose' && (latest === null || e.timestamp > latest)) {
      latest = e.timestamp;
    }
  }
  return latest;
});
const lastSedativeAt = computed<number | null>(() => {
  const oral = lastOralPremedAt.value;
  const iv = lastIvMedAt.value;
  if (oral === null) return iv;
  if (iv === null) return oral;
  return Math.max(oral, iv);
});
const encounterKind = computed(() =>
  classifyEncounter({
    oralPremedGiven: lastOralPremedAt.value !== null,
    ivMedGiven: lastIvMedAt.value !== null,
  }),
);
const isAssessment = computed(() => encounterKind.value === 'assessment');
const {
  endGlucose,
  endHr,
  endBpSys,
  endBpDia,
  endSpo2,
  endEtco2,
  endResponse,
  endStampedAt,
  ambulatory,
  orientedX3,
  nauseaOrVomiting,
  excessiveBleeding,
  companionName,
  companionRelation,
  providerSignatureDataUrl,
  discharge,
  prescriptions,
  sedationRating,
  sedationComplications,
  venipunctureComplications,
  procedureNotes,
  returnVisitPlan,
  returnVisitDate,
  ivOutAt,
  releasedAt,
  companionDocumented,
} = storeToRefs(recovery);

const sedationRatingOptions = [
  { value: 'excellent', label: 'Excellent — pt cooperative, no movement' },
  { value: 'good', label: 'Good — minor adjustments needed' },
  { value: 'fair', label: 'Fair — required extra titration' },
  { value: 'poor', label: 'Poor — significant intervention required' },
];

const returnVisitOptions = [
  { value: 'prn', label: 'PRN — return as needed' },
  { value: 'scheduled', label: 'Scheduled — date below' },
];

// The companion signs a separate paper consent (post-op instructions), so
// the engine no longer carries a companion-signature gate. Only the provider
// signature is captured in-app.
const providerSigned = computed(() => providerSignatureDataUrl.value !== null);

const responseOptions = [
  { value: 'Alert', label: 'Alert' },
  { value: 'Relaxed', label: 'Relaxed' },
  { value: 'Responds to verbal', label: 'Responds to verbal' },
  { value: 'Responds to tactile', label: 'Responds to tactile' },
  { value: 'Concern', label: '⚠️ Concern' },
];

const endBp = computed<BpValue>({
  get: () => ({ sbp: endBpSys.value, dbp: endBpDia.value }),
  set: (v) => {
    endBpSys.value = v.sbp;
    endBpDia.value = v.dbp;
  },
});

function fmtClock(ms: number | null): string | undefined {
  if (ms === null) return undefined;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// -------- Recovery vitals (card 11) ----------------------------------------

const endVitalsState = computed<ActionState>(() =>
  endStampedAt.value !== null ? 'logged' : 'idle',
);

function stampRecoveryVitals() {
  recovery.stampRecoveryVitals();
  undo.stamp({
    event: 'Procedure End / Recovery Vitals',
    details: {
      HR: endHr.value !== null ? `${endHr.value} bpm` : '—',
      BP:
        endBpSys.value !== null && endBpDia.value !== null
          ? `${endBpSys.value}/${endBpDia.value}`
          : '—',
      SpO2: endSpo2.value !== null ? `${endSpo2.value}%` : '—',
      EtCO2: endEtco2.value !== null ? `${endEtco2.value} mmHg` : '—',
      ...(diabetic.value && endGlucose.value !== null
        ? { Glucose: `${endGlucose.value} mg/dL` }
        : {}),
      Response: endResponse.value,
    },
    toast: { label: '✓ Recovery vitals stamped', tone: 'safe' },
    revert: () => recovery.clearRecoveryStamp(),
  });
}

// -------- IV-out chip (card 12) --------------------------------------------

const releaseStatus = computed(() =>
  releaseEligibility({
    lastSedativeAt: lastSedativeAt.value,
    lastFlumazenilAt: lastFlumazenilAt.value,
    now: now.value,
  }),
);

const ivOutState = computed<ActionState>(() => (ivOutAt.value !== null ? 'logged' : 'idle'));

function stampIvOut() {
  recovery.stampIvOut();
  undo.stamp({
    event: 'IV Out',
    details: {},
    toast: { label: '✓ IV catheter removed', tone: 'safe' },
    revert: () => recovery.clearIvOut(),
  });
}

const ivOutChipTone = computed(() => {
  if (releaseStatus.value.reason === 'no-sedative-given') return 'info';
  if (releaseStatus.value.eligible) return 'safe';
  return 'caution';
});

const ivOutChipHeadline = computed(() => {
  if (releaseStatus.value.reason === 'no-sedative-given') {
    return 'No IV medication recorded yet — IV-out gate inactive.';
  }
  if (releaseStatus.value.eligible) {
    return releaseStatus.value.reason === 'flumazenil-reversal'
      ? `Post-reversal monitoring complete (${releaseStatus.value.waitMin} min). Safe to remove IV.`
      : `${releaseStatus.value.waitMin}-minute wait complete. Safe to remove IV.`;
  }
  return releaseStatus.value.reason === 'flumazenil-reversal'
    ? `Post-flumazenil monitoring — ${releaseStatus.value.remainingMin} min remaining (120 min total).`
    : `${releaseStatus.value.remainingMin} min remaining of the 20-min IV-out wait.`;
});

// -------- Discharge safety guard (card 13) ---------------------------------

const dismissal = computed(() =>
  dismissalSafety({
    ambulatory: ambulatory.value,
    orientedX3: orientedX3.value,
    nauseaOrVomiting: nauseaOrVomiting.value,
    excessiveBleeding: excessiveBleeding.value,
    spo2: endSpo2.value,
    bp: { sbp: endBpSys.value, dbp: endBpDia.value },
    companionDocumented: companionDocumented.value,
    providerSigned: providerSigned.value,
    pulseOxPrintoutFiled: !!discharge.value.pulseOxPrinted,
  }),
);

// Blocker rings stay hidden until the clinician actually attempts release
// (mirrors Phase 1's validation-attempted gate) so Phase 4 doesn't open
// "all red". After an attempt each active blocker lights its own field.
const releaseAttempted = ref(false);

// Two-axis conclude gate. A sedation encounter needs the full recovery
// checklist + observation countdown clear. An assessment-only encounter
// was never sedated — the recovery checks don't apply — so only the
// medicolegal provider signature gates concluding it.
const canConclude = computed(() =>
  isAssessment.value
    ? providerSigned.value
    : !dismissal.value.blocked && releaseStatus.value.eligible,
);
const terminalLabel = computed(() =>
  isAssessment.value ? '✅ Complete Assessment' : '🏠 Release Patient',
);

const activeBlockers = computed(() => new Set(dismissal.value.blockers.map((b) => b.code)));
function isBlocking(code: DismissalBlockerCode): boolean {
  if (!releaseAttempted.value) return false;
  // Assessment-only: the recovery checklist is N/A; only the signature
  // field can be a blocker.
  if (isAssessment.value) return code === 'no-provider-signature' && !providerSigned.value;
  return activeBlockers.value.has(code);
}

const dischargeState = computed<ActionState>(() => (releasedAt.value !== null ? 'logged' : 'idle'));

// First blocking field in document order — a blocked release scrolls
// there so the clinician is taken straight to what to fix, the same way
// Phase 1's advance button scrolls to the first missing field.
const GATE_ANCHORS: ReadonlyArray<{ code: DismissalBlockerCode; id: string }> = [
  { code: 'bp-crisis', id: 'gate-bp' },
  { code: 'low-spo2', id: 'gate-spo2' },
  { code: 'not-ambulatory', id: 'gate-ambulatory' },
  { code: 'not-oriented', id: 'gate-oriented' },
  { code: 'no-pulse-ox-printout', id: 'gate-pulseox' },
  { code: 'nausea-vomiting', id: 'gate-nausea' },
  { code: 'excessive-bleeding', id: 'gate-bleeding' },
  { code: 'no-companion', id: 'gate-companion' },
  { code: 'no-provider-signature', id: 'gate-signature' },
];

async function scrollToFirstBlocker(): Promise<void> {
  await nextTick();
  // Assessment-only: the signature is the only thing that can block.
  if (isAssessment.value) {
    if (!providerSigned.value) {
      document
        .getElementById('gate-signature')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  const codes = activeBlockers.value;
  const field = GATE_ANCHORS.find((a) => codes.has(a.code));
  // A dismissal field first; if only the IV-out countdown is pending it
  // isn't a field, so point at the IV-out card instead.
  const id = field ? field.id : !releaseStatus.value.eligible ? 'gate-ivout' : null;
  if (id === null) return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function releasePatient() {
  if (!canConclude.value) {
    releaseAttempted.value = true;
    haptic('error');
    void scrollToFirstBlocker();
    return;
  }
  haptic('success');
  recovery.stampReleased();
  undo.stamp({
    event: isAssessment.value ? 'Assessment Completed — sedation deferred' : 'Patient Released',
    details: isAssessment.value
      ? {}
      : { Companion: `${companionName.value} (${companionRelation.value})` },
    toast: {
      label: isAssessment.value ? '✓ Assessment completed' : '✓ Patient released',
      tone: 'safe',
    },
    revert: () => recovery.clearReleased(),
  });
}

function goToClinicalNote() {
  void router.push('/clinical-note');
}

// -------- Drug summary stats (for clinical-note teaser) --------------------

const { name: patientName, weightLb, diabetic } = storeToRefs(patient);
const { versedTotalMg, fentanylTotalMcg } = storeToRefs(iv);

const blockerCount = computed(() => dismissal.value.blockers.length);
</script>

<template>
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 4 · Recovery & Discharge</p>
      <h1 class="title-display">Recovery & Release</h1>
    </header>

    <!-- Card 11 — Recovery Vitals -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">11</span>Recovery Vitals</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="HR" hint="bpm">
            <UiNumberInput v-model="endHr" placeholder="HR" />
          </UiField>
          <UiField id="gate-bp" label="BP" hint="mmHg" :invalid="isBlocking('bp-crisis')">
            <UiBpInput v-model="endBp" />
          </UiField>
          <UiField id="gate-spo2" label="SpO₂" hint="%" :invalid="isBlocking('low-spo2')">
            <UiNumberInput v-model="endSpo2" :min="0" :max="100" placeholder="%" />
          </UiField>
          <UiField label="EtCO₂" hint="mmHg">
            <UiNumberInput v-model="endEtco2" placeholder="EtCO₂" />
          </UiField>
          <UiField v-if="diabetic" label="Glucose" hint="mg/dL · diabetic">
            <UiNumberInput v-model="endGlucose" placeholder="Glucose" :min="0" />
          </UiField>
        </UiRow>
        <UiField label="Patient response">
          <UiSelect v-model="endResponse" :options="responseOptions" block />
        </UiField>
        <UiButton
          tone="primary"
          block
          :state="endVitalsState"
          :logged-at="fmtClock(endStampedAt)"
          :cooldown-ms="0"
          @click="stampRecoveryVitals"
        >
          Stamp Recovery Vitals
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 12 — IV Out -->

    <UiCard tint="ph4" id="gate-ivout">
      <p class="heading"><span class="heading-step">12</span>IV Out</p>

      <UiBanner :tone="ivOutChipTone" icon="⏱" class="mt-2">
        <strong>{{ ivOutChipHeadline }}</strong>
        <template v-if="!releaseStatus.eligible && releaseStatus.reason !== 'no-sedative-given'">
          <UiPercentBar
            :percent="
              releaseStatus.waitMin > 0
                ? ((releaseStatus.waitMin - releaseStatus.remainingMin) / releaseStatus.waitMin) *
                  100
                : 0
            "
            :severity="releaseStatus.reason === 'flumazenil-reversal' ? 'caution' : 'caution'"
            thickness="md"
            class="mt-2"
          />
        </template>
      </UiBanner>

      <UiButton
        tone="primary"
        block
        :state="ivOutState"
        :logged-at="fmtClock(ivOutAt)"
        :cooldown-ms="0"
        :disabled="!releaseStatus.eligible"
        class="mt-2"
        @click="stampIvOut"
      >
        IV Out
      </UiButton>
    </UiCard>

    <!-- Card 13 — Discharge Checklist & Companion -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">13</span>Discharge Checklist</p>
      <UiStack :gap="3" class="mt-2">
        <UiStack :gap="1">
          <UiCheckbox
            id="gate-ambulatory"
            v-model="ambulatory"
            label="Patient ambulatory at discharge"
            hint="Steady walking, no support needed"
            required
            :invalid="isBlocking('not-ambulatory')"
          />
          <UiCheckbox
            id="gate-oriented"
            v-model="orientedX3"
            label="Oriented ×3"
            hint="Person · place · time"
            required
            :invalid="isBlocking('not-oriented')"
          />
          <UiCheckbox
            id="gate-pulseox"
            :model-value="!!discharge.pulseOxPrinted"
            label="Pulse-ox printout filed"
            hint="SpO₂ trend copied + stapled to the sedation visit document"
            required
            :invalid="isBlocking('no-pulse-ox-printout')"
            @update:model-value="(v) => recovery.setDischarge('pulseOxPrinted', v)"
          />
          <UiCheckbox
            id="gate-nausea"
            v-model="nauseaOrVomiting"
            tone="danger"
            label="Nausea or vomiting noted"
            hint="Defer discharge if checked"
            :invalid="isBlocking('nausea-vomiting')"
          />
          <UiCheckbox
            id="gate-bleeding"
            v-model="excessiveBleeding"
            tone="danger"
            label="Excessive bleeding observed"
            :invalid="isBlocking('excessive-bleeding')"
          />
        </UiStack>

        <p class="caption mt-1">Companion</p>
        <UiRow :gap="3" wrap>
          <UiField
            id="gate-companion"
            label="Companion name"
            required
            :invalid="isBlocking('no-companion')"
          >
            <UiTextInput v-model="companionName" placeholder="Accompanying adult" />
          </UiField>
          <UiField label="Relation" required :invalid="isBlocking('no-companion')">
            <UiTextInput v-model="companionRelation" placeholder="e.g. spouse, parent" />
          </UiField>
        </UiRow>

        <p class="caption mt-1">Post-op confirmations</p>
        <UiStack :gap="1">
          <UiCheckbox
            :model-value="!!discharge.escortedToVehicle"
            label="Escorted to vehicle"
            @update:model-value="(v) => recovery.setDischarge('escortedToVehicle', v)"
          />
          <UiCheckbox
            :model-value="!!discharge.verbalInstructionsGiven"
            label="Verbal post-op instructions given"
            @update:model-value="(v) => recovery.setDischarge('verbalInstructionsGiven', v)"
          />
          <UiCheckbox
            :model-value="!!discharge.writtenInstructionsGiven"
            label="Written instructions handed off"
            @update:model-value="(v) => recovery.setDischarge('writtenInstructionsGiven', v)"
          />
          <UiCheckbox
            :model-value="!!discharge.propertyReturned"
            label="Patient property returned"
            @update:model-value="(v) => recovery.setDischarge('propertyReturned', v)"
          />
        </UiStack>

        <p class="caption mt-1">Prescriptions given</p>
        <UiField label="Rx handed to patient" hint="e.g. Ibuprofen 600 mg #20 q6h prn pain">
          <UiTextInput
            v-model="prescriptions"
            placeholder="None — or list drug, strength, count, sig"
            block
          />
        </UiField>

        <p class="caption mt-1">Provider signature</p>
        <UiField
          id="gate-signature"
          label="Sign to complete the record"
          required
          :invalid="isBlocking('no-provider-signature')"
        >
          <UiSignaturePad v-model="providerSignatureDataUrl" />
        </UiField>
      </UiStack>
    </UiCard>

    <!-- Card 13b — Provider Sign-off / Procedure Notes -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">13b</span>Provider Sign-off</p>

      <UiStack :gap="3" class="mt-2">
        <UiField label="Sedation quality rating" hint="provider impression">
          <UiSelect
            v-model="sedationRating"
            :options="sedationRatingOptions"
            placeholder="Rate the case…"
            block
          />
        </UiField>

        <UiField
          label="Sedation complications"
          hint="apnea episodes · paradoxical reaction · oversedation · etc."
        >
          <UiTextarea
            v-model="sedationComplications"
            placeholder="None — or describe and link to corrective action"
            :rows="2"
            block
          />
        </UiField>

        <UiField
          label="Venipuncture complications"
          hint="missed stick · infiltration · hematoma · vasospasm"
        >
          <UiTextarea
            v-model="venipunctureComplications"
            placeholder="None — or describe site / corrective action"
            :rows="2"
            block
          />
        </UiField>

        <UiField label="Procedure notes" hint="anything else worth charting">
          <UiTextarea
            v-model="procedureNotes"
            placeholder="e.g. Local infiltration uneventful; pt tolerated extraction well."
            :rows="3"
            block
          />
        </UiField>

        <UiRow :gap="3" wrap>
          <UiField label="Return visit" hint="plan for follow-up">
            <UiSelect
              v-model="returnVisitPlan"
              :options="returnVisitOptions"
              placeholder="Select…"
            />
          </UiField>
          <UiField v-if="returnVisitPlan === 'scheduled'" label="Scheduled date">
            <UiTextInput v-model="returnVisitDate" type="date" />
          </UiField>
        </UiRow>
      </UiStack>
    </UiCard>

    <!-- Card 14 — Release Patient (gated) -->

    <UiCard tint="ph4">
      <p class="heading">
        <span class="heading-step">14</span
        >{{ isAssessment ? 'Conclude Assessment' : 'Release Patient' }}
      </p>

      <template v-if="isAssessment">
        <UiBanner v-if="!providerSigned" tone="caution" icon="✍️" class="mt-2">
          Pre-sedation assessment — provider signature required to finalise the note. Sedation
          deferred to a later date.
        </UiBanner>
        <UiBanner v-else tone="info" icon="🗒" class="mt-2">
          Pre-sedation assessment complete — sedation deferred. The note prints now and keeps
          building if the case is carried out later.
        </UiBanner>
      </template>

      <template v-else>
        <UiBanner v-if="dismissal.blocked" tone="limit" icon="🚧" class="mt-2">
          <strong
            >Cannot release yet — {{ blockerCount }} blocker{{
              blockerCount === 1 ? '' : 's'
            }}
            active:</strong
          >
          <ul class="blocker-list">
            <li v-for="b in dismissal.blockers" :key="b.code">
              {{ b.label
              }}<span v-if="b.detail">
                — <em>{{ b.detail }}</em></span
              >
            </li>
          </ul>
        </UiBanner>

        <UiBanner v-else-if="!releaseStatus.eligible" tone="caution" icon="⏱" class="mt-2">
          All discharge checks pass — waiting on the observation countdown above before release.
        </UiBanner>

        <UiBanner v-else tone="safe" icon="✓" class="mt-2"> All discharge gates clear. </UiBanner>
      </template>

      <UiButton
        :tone="canConclude ? 'success' : 'neutral'"
        block
        :state="dischargeState"
        :logged-at="fmtClock(releasedAt)"
        :cooldown-ms="0"
        class="mt-2"
        @click="releasePatient"
      >
        {{ terminalLabel }}
      </UiButton>
      <UiButton tone="primary" block class="mt-2" @click="goToClinicalNote">
        📄 Generate Clinical Note
      </UiButton>
    </UiCard>

    <PhaseFooterNav :back="{ label: 'Phase 3 · IV Sedation', route: '/phase/3', tint: 'ph3' }" />

    <template #rail>
      <PatientSummaryCard />
      <UiCard>
        <p class="heading">Case summary</p>
        <div class="stat-grid mt-2">
          <UiStatCard
            label="Patient"
            :value="patientName?.trim() || '—'"
            severity="safe"
            :detail="weightLb !== null && weightLb !== undefined ? `${weightLb} lb` : undefined"
          />
          <UiStatCard
            label="Versed total"
            :value="versedTotalMg > 0 ? versedTotalMg.toFixed(1) : '—'"
            :unit="versedTotalMg > 0 ? 'mg' : undefined"
            severity="safe"
          />
          <UiStatCard
            label="Fentanyl total"
            :value="fentanylTotalMcg > 0 ? fentanylTotalMcg.toFixed(0) : '—'"
            :unit="fentanylTotalMcg > 0 ? 'mcg' : undefined"
            severity="safe"
          />
        </div>
      </UiCard>
    </template>
  </PhaseLayout>
</template>

<style scoped>
.blocker-list {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--type-footnote);
  line-height: 1.5;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2);
}
</style>
