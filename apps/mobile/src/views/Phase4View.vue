<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';

import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useUndoStore } from '@/stores/undo';
import { useEventLogStore } from '@/stores/event-log';
import { useNow } from '@/composables/useNow';
import { useGateFeedback, type GateEntry } from '@/composables/useGateFeedback';
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
  UiChipGroup,
  UiField,
  UiNumberInput,
  UiPercentBar,
  UiQuickAddChips,
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
  DEFAULT_FORMULARY,
  dismissalSafety,
  releaseEligibility,
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
  bathroomBreaks,
  returnVisitPlan,
  returnVisitDate,
  ivOutAt,
  releasedAt,
  releaseAttempted,
  companionDocumented,
} = storeToRefs(recovery);

/**
 * Sedation rating as a chip row — short single-word tokens carry the
 * grade; the descriptive subtitle that was the dropdown label is shown
 * beneath the row via `show-caption` when active. Keeps the chip widths
 * even regardless of the active rating's tail length.
 */
const sedationRatingChipOptions = [
  { value: 'excellent', label: 'Excellent', caption: 'Pt cooperative, no movement' },
  { value: 'good', label: 'Good', caption: 'Minor adjustments needed' },
  { value: 'fair', label: 'Fair', caption: 'Required extra titration' },
  { value: 'poor', label: 'Poor', caption: 'Significant intervention required' },
];

const returnVisitOptions = [
  { value: 'prn', label: 'PRN · return as needed' },
  { value: 'scheduled', label: 'Scheduled · date below' },
];

const bathroomBreakOptions = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
];

// Yes/No chips for the negative-polarity discharge-observation fields
// (nausea, bleeding). Replaces UiCheckbox+tone='danger' — chips force an
// explicit answer instead of relying on "didn't tick the box ≈ no
// problem" which was easy to misread under time pressure.
const yesNoOptions = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
];

const companionRelationOptions = DEFAULT_FORMULARY.picklists.companionRelations.map((r) => ({
  value: r,
  label: r,
}));

// Quick-add chips for the complication fields. Tapping appends the term to
// the free-text — the textarea stays the canonical, note-bound field so the
// chart reads as a narrative and the medicolegal contract is untouched.
// "Other" is just typing in the box. The term vocab is formulary data so a
// practice tunes it at setup without touching the UI.
const sedationComplicationOptions = DEFAULT_FORMULARY.picklists.sedationComplications;
const venipunctureComplicationOptions = DEFAULT_FORMULARY.picklists.venipunctureComplications;

// The companion signs a separate paper consent (post-op instructions), so
// the engine no longer carries a companion-signature gate. Only the provider
// signature is captured in-app.
const providerSigned = computed(() => providerSignatureDataUrl.value !== null);

// Response state — short chip labels, full clinical phrases stay as the
// stored values so the printed note + audit log read clinically. Verbal
// and Tactile dropped from the picker (matches Phase 3 — three states
// cover the at-the-chair scoring the provider actually uses); legacy
// records that stored those longer values still display correctly.
const responseOptions = [
  { value: 'Alert', label: 'Alert' },
  { value: 'Relaxed', label: 'Relaxed' },
  { value: 'Concern', label: 'Concern' },
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
    return 'No sedative given. Observation not required.';
  }
  if (releaseStatus.value.eligible) {
    return releaseStatus.value.reason === 'flumazenil-reversal'
      ? `Post-reversal monitoring complete (${releaseStatus.value.waitMin} min).`
      : `${releaseStatus.value.waitMin}-minute observation complete.`;
  }
  return releaseStatus.value.reason === 'flumazenil-reversal'
    ? `Post-flumazenil monitoring · ${releaseStatus.value.remainingMin} min remaining (120 min total).`
    : `${releaseStatus.value.remainingMin} min remaining of the 20-min observation wait.`;
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
  isAssessment.value ? 'Complete Assessment' : 'Release Patient',
);

const dischargeState = computed<ActionState>(() => (releasedAt.value !== null ? 'logged' : 'idle'));

// Gate entries in document order — this list *is* the blocker→anchor
// mapping, colocated so a new gate can't drift out of sync with the
// scroll. Assessment-only was never sedated, so only the signature can
// block; the recovery / IV-out gates simply aren't in the list.
const gateBlockers = computed(() => new Set(dismissal.value.blockers.map((b) => b.code)));
const gateEntries = computed<GateEntry[]>(() => {
  if (isAssessment.value) {
    return [{ anchorId: 'gate-signature', failing: !providerSigned.value }];
  }
  const b = gateBlockers.value;
  return [
    { anchorId: 'gate-bp', failing: b.has('bp-crisis') },
    { anchorId: 'gate-spo2', failing: b.has('low-spo2') },
    { anchorId: 'gate-ivout', failing: !releaseStatus.value.eligible },
    { anchorId: 'gate-ambulatory', failing: b.has('not-ambulatory') },
    { anchorId: 'gate-oriented', failing: b.has('not-oriented') },
    { anchorId: 'gate-pulseox', failing: b.has('no-pulse-ox-printout') },
    { anchorId: 'gate-nausea', failing: b.has('nausea-vomiting') },
    { anchorId: 'gate-bleeding', failing: b.has('excessive-bleeding') },
    { anchorId: 'gate-companion', failing: b.has('no-companion') },
    { anchorId: 'gate-signature', failing: b.has('no-provider-signature') },
  ];
});
const gate = useGateFeedback({ entries: gateEntries, attempted: releaseAttempted });

function releasePatient() {
  if (!canConclude.value) {
    void gate.attempt();
    haptic('error');
    return;
  }
  haptic('success');
  recovery.stampReleased();
  undo.stamp({
    event: isAssessment.value ? 'Assessment Completed · sedation deferred' : 'Patient Released',
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

const { name: patientName, weightLb, diabetic, careName, careRelation } = storeToRefs(patient);

// Pre-fill the discharge companion with the caregiver the clinician
// already named in Phase 1 — usually the same person; still fully
// editable. Seed only when blank so a deliberate companion (or a
// cleared field) is never overwritten.
onMounted(() => {
  if (companionName.value.trim() === '' && careName.value.trim() !== '') {
    companionName.value = careName.value;
  }
  if (companionRelation.value.trim() === '' && careRelation.value.trim() !== '') {
    companionRelation.value = careRelation.value;
  }
});
const { versedTotalMg, fentanylTotalMcg } = storeToRefs(iv);

const blockerCount = computed(() => dismissal.value.blockers.length);
</script>

<template>
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 4 · Recovery & Discharge</p>
      <h1 class="title-display">Recovery & Release</h1>
    </header>

    <!-- Cards 11–12 are sedation-recovery only — an assessment-only visit
         was never sedated, so they don't apply. Cards 13–16 still render —
         15 carries the return-visit plan a deferred sedation needs and 16
         carries the provider signature the assessment note needs. -->

    <!-- Card 11 — Recovery Vitals -->

    <UiCard v-if="!isAssessment" tint="ph4">
      <p class="heading"><span class="heading-step">11</span>Recovery Vitals</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="HR" hint="bpm">
            <UiNumberInput v-model="endHr" />
          </UiField>
          <UiField id="gate-bp" label="BP" hint="mmHg" :invalid="gate.isInvalid('gate-bp')">
            <UiBpInput v-model="endBp" />
          </UiField>
          <UiField id="gate-spo2" label="SpO₂" hint="%" :invalid="gate.isInvalid('gate-spo2')">
            <UiNumberInput v-model="endSpo2" :min="0" :max="100" />
          </UiField>
          <UiField label="EtCO₂" hint="mmHg">
            <UiNumberInput v-model="endEtco2" />
          </UiField>
          <UiField v-if="diabetic" label="Glucose" hint="mg/dL">
            <UiNumberInput v-model="endGlucose" :min="0" />
          </UiField>
        </UiRow>
        <UiField label="Patient response">
          <UiChipGroup v-model="endResponse" :options="responseOptions" size="tap-target" />
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

    <UiCard v-if="!isAssessment" tint="ph4" id="gate-ivout">
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

    <!-- Card 13 — Discharge Readiness (release-blocker gates + companion) -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">13</span>Discharge Readiness</p>
      <UiStack :gap="3" class="mt-2">
        <p class="caption">Patient readiness</p>
        <UiStack :gap="1">
          <UiCheckbox
            id="gate-ambulatory"
            v-model="ambulatory"
            label="Patient ambulatory at discharge"
            required
            :invalid="gate.isInvalid('gate-ambulatory')"
          />
          <UiCheckbox
            id="gate-oriented"
            v-model="orientedX3"
            label="Oriented ×3"
            required
            :invalid="gate.isInvalid('gate-oriented')"
          />
          <UiCheckbox
            id="gate-pulseox"
            :model-value="!!discharge.pulseOxPrinted"
            label="Pulse-ox printout filed"
            required
            :invalid="gate.isInvalid('gate-pulseox')"
            @update:model-value="(v) => recovery.setDischarge('pulseOxPrinted', v)"
          />
        </UiStack>

        <p class="caption mt-1">Recovery observations</p>
        <UiStack :gap="2">
          <UiField
            id="gate-nausea"
            label="Nausea or vomiting"
            hint="Yes blocks discharge"
            :invalid="gate.isInvalid('gate-nausea')"
          >
            <UiChipGroup v-model="nauseaOrVomiting" :options="yesNoOptions" size="tap-target" />
          </UiField>
          <UiField
            id="gate-bleeding"
            label="Excessive bleeding"
            hint="Yes blocks discharge"
            :invalid="gate.isInvalid('gate-bleeding')"
          >
            <UiChipGroup v-model="excessiveBleeding" :options="yesNoOptions" size="tap-target" />
          </UiField>
        </UiStack>

        <p class="caption mt-1">Companion</p>
        <UiRow :gap="3" wrap>
          <UiField
            id="gate-companion"
            label="Companion name"
            required
            :invalid="gate.isInvalid('gate-companion')"
          >
            <UiTextInput v-model="companionName" />
          </UiField>
          <UiField label="Relation" required :invalid="gate.isInvalid('gate-companion')">
            <UiSelect
              v-model="companionRelation"
              :options="companionRelationOptions"
              placeholder="Select…"
              block
            />
          </UiField>
        </UiRow>
      </UiStack>
    </UiCard>

    <!-- Card 14 — Discharge Handoff (post-op confirmations + prescriptions) -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">14</span>Discharge Handoff</p>
      <UiStack :gap="3" class="mt-2">
        <p class="caption">Post-op confirmations</p>
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
        <UiField label="Rx handed to patient">
          <UiTextInput v-model="prescriptions" block />
        </UiField>
      </UiStack>
    </UiCard>

    <!-- Card 15 — Provider Sign-off / Procedure Notes -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">15</span>Provider Sign-off</p>

      <UiStack :gap="3" class="mt-2">
        <p class="caption">Quality</p>
        <UiField label="Sedation quality rating">
          <UiChipGroup
            v-model="sedationRating"
            :options="sedationRatingChipOptions"
            show-caption
            allow-deselect
            deselect-value=""
            size="tap-target"
          />
        </UiField>

        <UiField label="Bathroom breaks" inline>
          <UiChipGroup v-model="bathroomBreaks" :options="bathroomBreakOptions" />
        </UiField>

        <p class="caption mt-1">Complications</p>
        <UiField label="Sedation complications">
          <UiQuickAddChips v-model="sedationComplications" :terms="sedationComplicationOptions" />
          <UiTextarea v-model="sedationComplications" :rows="2" block />
        </UiField>

        <UiField label="Venipuncture complications">
          <UiQuickAddChips
            v-model="venipunctureComplications"
            :terms="venipunctureComplicationOptions"
          />
          <UiTextarea v-model="venipunctureComplications" :rows="2" block />
        </UiField>

        <UiField label="Procedure notes">
          <UiTextarea v-model="procedureNotes" :rows="3" block />
        </UiField>

        <p class="caption mt-1">Follow-up</p>
        <UiRow :gap="3" wrap>
          <UiField label="Return visit">
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

    <!-- Card 16 — Provider Signature -->

    <UiCard tint="ph4">
      <p class="heading"><span class="heading-step">16</span>Provider Signature</p>
      <UiStack :gap="3" class="mt-2">
        <UiField
          id="gate-signature"
          label="Sign to complete the record"
          required
          :invalid="gate.isInvalid('gate-signature')"
        >
          <UiSignaturePad v-model="providerSignatureDataUrl" />
        </UiField>
      </UiStack>
    </UiCard>

    <!-- Card 17 — Release Patient (gated) -->

    <UiCard tint="ph4">
      <p class="heading">
        <span class="heading-step">17</span
        >{{ isAssessment ? 'Complete Assessment' : 'Release Patient' }}
      </p>

      <template v-if="isAssessment">
        <UiBanner v-if="!providerSigned" tone="caution" class="mt-2">
          Pre-sedation assessment · provider signature required. Sedation deferred to a later date.
        </UiBanner>
        <UiBanner v-else tone="info" class="mt-2">
          Pre-sedation assessment complete · sedation deferred to a later date.
        </UiBanner>
      </template>

      <template v-else>
        <UiBanner v-if="dismissal.blocked" tone="limit" class="mt-2">
          <strong
            >Cannot release yet · {{ blockerCount }} item{{
              blockerCount === 1 ? '' : 's'
            }}
            outstanding:</strong
          >
          <ul class="blocker-list">
            <li v-for="b in dismissal.blockers" :key="b.code">
              {{ b.label
              }}<span v-if="b.detail">
                · <em>{{ b.detail }}</em></span
              >
            </li>
          </ul>
        </UiBanner>

        <UiBanner v-else-if="!releaseStatus.eligible" tone="caution" icon="⏱" class="mt-2">
          Discharge checks complete. Finishing the post-sedation observation window.
        </UiBanner>

        <UiBanner v-else tone="safe" icon="✓" class="mt-2"> All discharge criteria met. </UiBanner>
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
      <UiButton tone="neutral" block class="mt-2" @click="goToClinicalNote">
        Generate Clinical Note
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
/* (parked) — Card 14 used to host a "Monitor recording" sub-section
   for the HL7 bridge integration. Both the markup and these styles
   moved out when the bridge was parked to tools/parked/bridge; revive
   here when the bridge ships.
.monitor-row { ... }
.monitor-row-icon { ... }
.monitor-row-body { ... }
.monitor-row-label { ... }
.monitor-row-detail { ... }
.monitor-row--attached .monitor-row-icon { ... }
.monitor-row--recording .monitor-row-icon { ... }
.monitor-row--waiting .monitor-row-icon { ... }
*/

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
