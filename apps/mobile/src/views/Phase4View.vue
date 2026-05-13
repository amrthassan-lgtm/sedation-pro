<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { useRouter } from 'vue-router';

import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useUndoStore } from '@/stores/undo';
import { useNow } from '@/composables/useNow';
import { haptic } from '@/composables/useHaptics';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
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
import { dismissalSafety, releaseEligibility } from '@sedation-pro/clinical';
import type { ActionState, BpValue } from '@sedation-pro/ui';

const router = useRouter();

const iv = useIVStore();
const patient = usePatientStore();
const recovery = useRecoveryStore();
const undo = useUndoStore();
const now = useNow(1000);

const { lastIvMedAt, lastFlumazenilAt } = storeToRefs(iv);
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

// Provider signature lives here in-app. The companion's signature is captured
// on a separate paper form per practice protocol — so we pass
// `companionSigned: true` to dismissalSafety to skip that gate.
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
    lastMedicationAt: lastIvMedAt.value,
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
  if (releaseStatus.value.reason === 'no-medication-given') return 'info';
  if (releaseStatus.value.eligible) return 'safe';
  return 'caution';
});

const ivOutChipHeadline = computed(() => {
  if (releaseStatus.value.reason === 'no-medication-given') {
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
    companionSigned: true,
  }),
);

const dischargeState = computed<ActionState>(() => 'idle');

function releasePatient() {
  if (dismissal.value.blocked || !releaseStatus.value.eligible) {
    haptic('error');
    return;
  }
  haptic('success');
  undo.stamp({
    event: 'Patient Released',
    details: {
      Companion: `${companionName.value} (${companionRelation.value})`,
    },
    toast: { label: '✓ Patient released', tone: 'safe' },
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
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 4 · Recovery & Discharge</p>
      <h1 class="title-display">Recovery & Release</h1>
      <p class="body muted">
        Recovery vitals → IV-out countdown → discharge checklist → release. The release button stays
        disabled until the IV-out gate clears AND every dismissal-safety check passes. The signature
        pad + generated clinical note land in the next push.
      </p>
    </header>

    <!-- Card 11 — Recovery Vitals -->

    <UiCard tint="ph4" active>
      <p class="heading">11 · Recovery Vitals</p>
      <p class="body muted">Stamp once stable, alert, oriented ×3, vitals back to baseline.</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="HR" hint="bpm">
            <UiNumberInput v-model="endHr" placeholder="HR" />
          </UiField>
          <UiField label="BP" hint="mmHg">
            <UiBpInput v-model="endBp" />
          </UiField>
          <UiField label="SpO₂" hint="%">
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

    <UiCard tint="ph4">
      <p class="heading">12 · IV Out</p>
      <p class="body muted">
        Live countdown using <code class="mono">releaseEligibility</code>. Standard wait is 20
        minutes from the last IV med. After flumazenil, the engine extends the wait to 120 minutes
        for post-reversal monitoring.
      </p>

      <UiBanner :tone="ivOutChipTone" icon="⏱" class="mt-2">
        <strong>{{ ivOutChipHeadline }}</strong>
        <template v-if="!releaseStatus.eligible && releaseStatus.reason !== 'no-medication-given'">
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
      <p class="heading">13 · Discharge Checklist</p>
      <UiStack :gap="3" class="mt-2">
        <UiStack :gap="1">
          <UiCheckbox
            v-model="ambulatory"
            label="Patient ambulatory at discharge"
            hint="Steady walking, no support needed"
            required
          />
          <UiCheckbox
            v-model="orientedX3"
            label="Oriented ×3"
            hint="Person · place · time"
            required
          />
          <UiCheckbox
            v-model="nauseaOrVomiting"
            tone="danger"
            label="Nausea or vomiting noted"
            hint="Defer discharge if checked"
          />
          <UiCheckbox
            v-model="excessiveBleeding"
            tone="danger"
            label="Excessive bleeding observed"
          />
        </UiStack>

        <p class="caption mt-1">Companion</p>
        <UiRow :gap="3" wrap>
          <UiField label="Companion name" required>
            <UiTextInput v-model="companionName" placeholder="Accompanying adult" />
          </UiField>
          <UiField label="Relation" required>
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
          <UiCheckbox
            :model-value="!!discharge.pulseOxPrinted"
            label="Pulse-ox printout filed"
            @update:model-value="(v) => recovery.setDischarge('pulseOxPrinted', v)"
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
        <UiField label="Sign to complete the record" required>
          <UiSignaturePad v-model="providerSignatureDataUrl" />
        </UiField>
        <p class="body muted footnote-note">
          Companion signs the printed post-op-instruction form by hand — not captured in-app.
        </p>
      </UiStack>
    </UiCard>

    <!-- Card 13b — Provider Sign-off / Procedure Notes -->

    <UiCard tint="ph4">
      <p class="heading">13b · Provider Sign-off</p>
      <p class="body muted">
        Rate the sedation course, capture complications, and document any procedure-relevant
        observations. All fields flow into the printed clinical note.
      </p>

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
      <p class="heading">14 · Release Patient</p>

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
        All discharge checks pass — waiting on the IV-out countdown above before release.
      </UiBanner>

      <UiBanner v-else tone="safe" icon="✓" class="mt-2">
        All discharge gates clear. Tapping below logs <strong>Patient Released</strong> to the
        chrono log; the generated clinical note ships next push.
      </UiBanner>

      <UiButton
        tone="success"
        block
        :state="dischargeState"
        :cooldown-ms="0"
        :disabled="dismissal.blocked || !releaseStatus.eligible"
        class="mt-2"
        @click="releasePatient"
      >
        🏠 Release Patient
      </UiButton>
      <UiButton tone="primary" block class="mt-2" @click="goToClinicalNote">
        📄 Generate Clinical Note
      </UiButton>
    </UiCard>

    <!-- Case summary teaser -->

    <UiCard>
      <p class="heading">Case summary</p>
      <p class="body muted">
        Quick read-out — full printable clinical note lands with the signature pad in the next push.
      </p>
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

    <PhaseFooterNav :back="{ label: 'Phase 3 · IV Sedation', route: '/phase/3' }" />
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
.mt-1 {
  margin-top: var(--sp-2);
}
.mt-2 {
  margin-top: var(--sp-3);
}
.blocker-list {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--type-footnote);
  line-height: 1.5;
}
.footnote-note {
  font-size: var(--type-footnote);
  font-style: italic;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2);
}
</style>
