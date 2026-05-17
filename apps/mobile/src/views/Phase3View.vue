<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useIVStore } from '@/stores/iv';
import { useLocalAnestheticStore } from '@/stores/local';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { useSessionStore } from '@/stores/session';
import { useDockSentinel } from '@/composables/useDockVisibility';
import { useIvDosing } from '@/composables/useIvDosing';
import { useNow } from '@/composables/useNow';
import PatientSummaryCard from '@/components/PatientSummaryCard.vue';
import PhaseFooterNav from '@/components/PhaseFooterNav.vue';
import PhaseLayout from '@/components/PhaseLayout.vue';
import {
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiDrugButton,
  UiField,
  UiNumberInput,
  UiPercentBar,
  UiRow,
  UiSelect,
  UiStack,
  UiStatCard,
  UiSyringe,
  UiTextInput,
  UiTimerPill,
} from '@sedation-pro/ui';
import { DEFAULT_FORMULARY, premedWait } from '@sedation-pro/clinical';
import type { ActionState, BpValue, TimerPillStatus } from '@sedation-pro/ui';

const iv = useIVStore();
const local = useLocalAnestheticStore();
const patient = usePatientStore();
const undo = useUndoStore();
const now = useNow(1000);

const { weightLb, diabetic, safetyAlerts } = storeToRefs(patient);

// Wire the card-6 ("Additional Doses") IntersectionObserver — drives the
// SedationDock's auto-hide. While cards 5 (test dose) and 6 (additional
// doses) are in view, the in-card dose buttons cover the workflow; the
// dock only takes over once the user scrolls past them. See
// `useDockVisibility` for behavior.
const dockSentinelRef = ref<HTMLElement | null>(null);
useDockSentinel(dockSentinelRef);

const {
  n2oOn,
  o2OnlyOn,
  ivStarted,
  ivStartedAt,
  ivCatheterGauge,
  ivCatheterAttempts,
  ivSite,
  ivFluid,
  versedTotalMg,
  fentanylTotalMcg,
  lastVersedAt,
  lastFentanylAt,
  sedationStatus,
  preOpGlucose,
  preOpHr,
  preOpBpSys,
  preOpBpDia,
  preOpSpo2,
  preOpEtco2,
  preOpResponse,
  preOpStampedAt,
  sedGlucose,
  sedHr,
  sedBpSys,
  sedBpDia,
  sedSpo2,
  sedEtco2,
  sedResponse,
  sedStampedAt,
  procedureStartedAt,
} = storeToRefs(iv);

const session = useSessionStore();

/**
 * Furthest Phase 3 step the clinician has reached, derived from existing
 * store flags (latched timestamps where possible). Drives the sticky-bar
 * "Step N": it only advances as actions are logged, so it reads as calm
 * progress, not a scroll-jumpy cursor. Skipped/optional steps are fine —
 * it's the max completed, not a require-all-in-order gate.
 */
const phase3Step = computed<number | null>(() => {
  const steps: ReadonlyArray<readonly [number, boolean]> = [
    [1, preOpStampedAt.value !== null],
    [2, n2oOn.value || o2OnlyOn.value],
    [3, ivStarted.value],
    [4, o2OnlyOn.value],
    [5, lastVersedAt.value !== null],
    [6, lastFentanylAt.value !== null || versedTotalMg.value > 1],
    [7, sedStampedAt.value !== null],
    [8, procedureStartedAt.value !== null],
    [9, local.doses.length > 0],
    [10, iv.doses.some((d) => d.drug === 'flumazenil' || d.drug === 'naloxone')],
  ];
  let furthest: number | null = null;
  for (const [n, done] of steps) if (done) furthest = n;
  return furthest;
});
watch(phase3Step, (s) => session.setStep(s), { immediate: true });

const responseOptions = [
  { value: 'Alert', label: 'Alert' },
  { value: 'Relaxed', label: 'Relaxed' },
  { value: 'Responds to verbal', label: 'Responds to verbal' },
  { value: 'Responds to tactile', label: 'Responds to tactile' },
  { value: 'Concern', label: '⚠️ Concern' },
];

// Pre-op + sedation BP adapters — `UiBpInput` v-models a {sbp, dbp} pair, but
// each leg is persisted independently in the IV store.
const preOpBp = computed<BpValue>({
  get: () => ({ sbp: preOpBpSys.value, dbp: preOpBpDia.value }),
  set: (v) => {
    preOpBpSys.value = v.sbp;
    preOpBpDia.value = v.dbp;
  },
});
const sedBp = computed<BpValue>({
  get: () => ({ sbp: sedBpSys.value, dbp: sedBpDia.value }),
  set: (v) => {
    sedBpSys.value = v.sbp;
    sedBpDia.value = v.dbp;
  },
});

function fmtClock(ms: number | null): string | undefined {
  if (ms === null) return undefined;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Derived states — each stamp button is "logged" iff its store flag is set.
const preOpVitalsState = computed<ActionState>(() =>
  preOpStampedAt.value !== null ? 'logged' : 'idle',
);
const sedVitalsState = computed<ActionState>(() =>
  sedStampedAt.value !== null ? 'logged' : 'idle',
);
const procStartState = computed<ActionState>(() =>
  procedureStartedAt.value !== null ? 'logged' : 'idle',
);
const ivStartState = computed<ActionState>(() => (ivStarted.value ? 'logged' : 'idle'));
/**
 * Versed test dose is clinically a one-shot — once any Versed has been given,
 * subsequent doses belong on the Additional Doses card. Locking the button
 * stops a clinician from accidentally double-logging "test dose" instead of
 * "additional".
 */
const versedTestState = computed<ActionState>(() =>
  lastVersedAt.value !== null ? 'logged' : 'idle',
);

function stampPreOpVitals() {
  iv.setPreOpVitals({
    hr: preOpHr.value,
    bp: { sbp: preOpBpSys.value, dbp: preOpBpDia.value },
    spo2: preOpSpo2.value,
    etco2: preOpEtco2.value,
    glucose: diabetic.value ? preOpGlucose.value : null,
    response: preOpResponse.value,
    at: Date.now(),
  });
  undo.stamp({
    event: 'Pre-Op Vitals',
    details: {
      HR: preOpHr.value !== null ? `${preOpHr.value} bpm` : '—',
      BP:
        preOpBpSys.value !== null && preOpBpDia.value !== null
          ? `${preOpBpSys.value}/${preOpBpDia.value}`
          : '—',
      SpO2: preOpSpo2.value !== null ? `${preOpSpo2.value}%` : '—',
      EtCO2: preOpEtco2.value !== null ? `${preOpEtco2.value} mmHg` : '—',
      ...(diabetic.value && preOpGlucose.value !== null
        ? { Glucose: `${preOpGlucose.value} mg/dL` }
        : {}),
      Response: preOpResponse.value,
    },
    toast: {
      label: '✓ Pre-Op Vitals stamped',
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'safe',
    },
    revert: () => iv.clearPreOpStamp(),
  });
}

// -------- Gas flow ----------------------------------------------------------

function onN2oOn() {
  // Capture before mutation — undo must restore both booleans, not just the
  // one this setter touches. Without an explicit revert the stamp would only
  // remove the event-log entry and the toggle would stay flipped.
  const prevN2oOn = iv.n2oOn;
  const prevO2OnlyOn = iv.o2OnlyOn;
  iv.setN2oOn();
  undo.stamp({
    event: 'N₂O/O₂ ON',
    details: { Route: 'Inhalation' },
    toast: { label: '✓ N₂O/O₂ ON', tone: 'safe' },
    revert: () => iv.restoreGasState(prevN2oOn, prevO2OnlyOn),
  });
}

function onN2oOff() {
  const prevN2oOn = iv.n2oOn;
  const prevO2OnlyOn = iv.o2OnlyOn;
  iv.setN2oOff();
  undo.stamp({
    event: 'N₂O/O₂ OFF · O₂ 100% ON',
    details: { 'N₂O': 'Discontinued', 'O₂': '100% via nasal cannula' },
    toast: { label: '✓ N₂O off · O₂ 100% on', tone: 'safe' },
    revert: () => iv.restoreGasState(prevN2oOn, prevO2OnlyOn),
  });
}

// -------- IV start ----------------------------------------------------------

function onIvStart() {
  iv.startIV();
  undo.stamp({
    event: 'IV Start',
    details: {
      Catheter: `${ivCatheterGauge.value}g`,
      Site: ivSite.value,
      'Venipuncture attempts': String(ivCatheterAttempts.value),
      Fluids: ivFluid.value,
    },
    toast: { label: '✓ IV Started', tone: 'safe' },
    revert: () => iv.clearIvStart(),
  });
}

// -------- Pre-med wait chip (cosmetic — IV start isn't hard-blocked) -------

// Phase 2 oral premeds aren't tracked in their own store yet, but the event
// log has them. Scan for the most recent oral premed timestamp.
const lastPremedAt = computed(() => {
  // Phase 2 is a soft chip only — null is fine until we wire the oral store.
  return null;
});

const premedChip = computed(() => {
  if (lastPremedAt.value === null) return null;
  return premedWait({ lastPremedAt: lastPremedAt.value, now: now.value });
});

// -------- Drug dose handlers ----------------------------------------------
//
// Logging helpers live in `useIvDosing` so the in-card buttons and the
// bottom Sedation Dock both call the same code path. Anything the card
// does *on top of* logging (opening the reversal process panel) stays
// here as local UI state.

const { logIvVersed, logIvFentanyl, logIvZofran } = useIvDosing();

// -------- Live drug timer pills (use the engine + now ticker) ---------------

function fmtDuration(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const versedTimerView = computed(() => {
  if (lastVersedAt.value === null) {
    return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  }
  const t = iv.versedTimerAt(now.value);
  if (!t) return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  // Single timer only: the count-up elapsed time is the timer. The hint is
  // a plain status word — no second (count-down) clock, which read as a
  // competing timer and was distracting.
  const count = t.state === 'ready' ? '✓' : fmtDuration(t.elapsedSec);
  const hint = t.state === 'ready' ? 'Ready' : 'Waiting';
  return { count, hint, status: t.state };
});

const fentanylTimerView = computed(() => {
  if (lastFentanylAt.value === null) {
    return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  }
  const t = iv.fentanylTimerAt(now.value);
  if (!t) return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  const count = t.state === 'ready' ? '✓' : fmtDuration(t.elapsedSec);
  const hint = t.state === 'ready' ? 'Ready' : 'Waiting';
  return { count, hint, status: t.state };
});

// -------- IV-max stat cards ------------------------------------------------

const versedCard = computed(() => {
  const sed = sedationStatus.value;
  return {
    value: versedTotalMg.value > 0 ? versedTotalMg.value.toFixed(1) : '—',
    pct: sed.versed.percent,
    severity: sed.versed.severity,
    ceiling: sed.versed.ceiling,
    ceilingReducedByOpioid: fentanylTotalMcg.value > 0,
  };
});

const fentanylCard = computed(() => {
  const sed = sedationStatus.value;
  return {
    value: fentanylTotalMcg.value > 0 ? fentanylTotalMcg.value.toFixed(0) : '—',
    pct: sed.fentanyl.percent,
    severity: sed.fentanyl.severity,
    ceiling: sed.fentanyl.ceiling,
  };
});

const combinedCard = computed(() => sedationStatus.value.combined);

const versedCeilingFromFormulary = DEFAULT_FORMULARY.ceilings.versedMaxMg;

// -------- Sedation level vitals (card 7) -----------------------------------

function stampSedationVitals() {
  iv.setSedationVitals({
    hr: sedHr.value,
    bp: { sbp: sedBpSys.value, dbp: sedBpDia.value },
    spo2: sedSpo2.value,
    etco2: sedEtco2.value,
    glucose: diabetic.value ? sedGlucose.value : null,
    response: sedResponse.value,
    at: Date.now(),
  });
  undo.stamp({
    event: 'Sedation Level Achieved',
    details: {
      HR: sedHr.value !== null ? `${sedHr.value} bpm` : '—',
      BP:
        sedBpSys.value !== null && sedBpDia.value !== null
          ? `${sedBpSys.value}/${sedBpDia.value}`
          : '—',
      SpO2: sedSpo2.value !== null ? `${sedSpo2.value}%` : '—',
      EtCO2: sedEtco2.value !== null ? `${sedEtco2.value} mmHg` : '—',
      ...(diabetic.value && sedGlucose.value !== null
        ? { Glucose: `${sedGlucose.value} mg/dL` }
        : {}),
      Response: sedResponse.value,
    },
    toast: { label: '✓ Sedation level stamped', tone: 'safe' },
    revert: () => iv.clearSedationStamp(),
  });
}

// -------- Procedure start (card 8) -----------------------------------------

function onProcedureStart() {
  iv.startProcedure();
  undo.stamp({
    event: 'Procedure Start',
    details: {},
    toast: { label: '✓ Procedure started', tone: 'safe' },
    revert: () => iv.clearProcedureStart(),
  });
}

// -------- Local anesthesia (card 9) ----------------------------------------

function logLocal(drugId: string, displayName: string) {
  if (!weightLb.value) return;
  const record = local.logCarpule(drugId, 1);
  undo.stamp({
    event: 'Local Anesthesia',
    details: { Agent: displayName, Amount: '1 carpule' },
    toast: {
      label: `✓ ${displayName} · 1 carpule`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'caution',
    },
    revert: () => {
      local.removeById(record.id);
    },
  });
}

const localResult = computed(() => {
  if (!weightLb.value) return null;
  return local.combinedAt(weightLb.value, now.value);
});

// -------- Reversal (card 10) -----------------------------------------------

const flumazenilProcessOpen = ref(false);
const naloxoneProcessOpen = ref(false);

function onFlumazenil() {
  // Capture the panel state *before* mutating so undo restores both the
  // dose log and the process-panel visibility. Without this, the dose is
  // removed but the panel stays open — the same class of bug as the N₂O
  // toggle revert that the prior commit fixed.
  const prevPanelOpen = flumazenilProcessOpen.value;
  iv.logDose({ drug: 'flumazenil', mg: 0.2 });
  flumazenilProcessOpen.value = true;
  undo.stamp({
    event: 'Reversal Dose',
    details: { Drug: 'Flumazenil', Dose: '0.2 mg', Route: 'IV' },
    toast: {
      label: '✓ Flumazenil 0.2 mg IV (reversal)',
      sub: 'IV-out wait extended to 120 min',
      tone: 'caution',
    },
    revert: () => {
      const last = iv.doses[iv.doses.length - 1];
      if (last && last.drug === 'flumazenil') iv.removeDoseById(last.id);
      flumazenilProcessOpen.value = prevPanelOpen;
    },
  });
}

function onNaloxone() {
  const prevPanelOpen = naloxoneProcessOpen.value;
  iv.logDose({ drug: 'naloxone', mg: 0.4 });
  naloxoneProcessOpen.value = true;
  undo.stamp({
    event: 'Reversal Dose',
    details: { Drug: 'Naloxone', Dose: '0.4 mg', Route: 'IV' },
    toast: {
      label: '✓ Naloxone 0.4 mg IV (reversal)',
      sub: 'Monitor 1-2 hours for re-sedation',
      tone: 'limit',
    },
    revert: () => {
      const last = iv.doses[iv.doses.length - 1];
      if (last && last.drug === 'naloxone') iv.removeDoseById(last.id);
      naloxoneProcessOpen.value = prevPanelOpen;
    },
  });
}
</script>

<template>
  <PhaseLayout>
    <header class="phase-hero">
      <p class="caption">Phase 3 · IV Sedation & Procedure</p>
      <h1 class="title-display">Drug Administration</h1>
    </header>

    <!-- Card 1 — Pre-Op Vitals ------------------------------------------ -->

    <UiCard tint="ph3">
      <p class="heading">1 · Pre-Op Vitals</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="HR" hint="bpm">
            <UiNumberInput v-model="preOpHr" placeholder="HR" />
          </UiField>
          <UiField label="BP" hint="mmHg">
            <UiBpInput v-model="preOpBp" />
          </UiField>
          <UiField label="SpO₂" hint="%">
            <UiNumberInput v-model="preOpSpo2" :min="0" :max="100" placeholder="%" />
          </UiField>
          <UiField label="EtCO₂" hint="mmHg">
            <UiNumberInput v-model="preOpEtco2" placeholder="EtCO₂" />
          </UiField>
          <UiField v-if="diabetic" label="Glucose" hint="mg/dL · diabetic">
            <UiNumberInput v-model="preOpGlucose" placeholder="Glucose" :min="0" />
          </UiField>
        </UiRow>
        <UiField label="Patient response">
          <UiSelect v-model="preOpResponse" :options="responseOptions" block />
        </UiField>
        <UiButton
          tone="primary"
          block
          :state="preOpVitalsState"
          :logged-at="fmtClock(preOpStampedAt)"
          :cooldown-ms="0"
          @click="stampPreOpVitals"
        >
          Stamp Pre-Op Vitals
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 2 — N₂O / O₂ ON ------------------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">2 · N₂O / O₂ ON</p>
      <UiButton
        tone="primary"
        block
        :state="n2oOn ? 'logged' : 'idle'"
        logged-at="On"
        :cooldown-ms="0"
        class="mt-2"
        @click="onN2oOn"
      >
        N₂O / O₂ ON
      </UiButton>
    </UiCard>

    <!-- Card 3 — IV Start --------------------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">3 · IV Start</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="Catheter" hint="gauge">
            <UiTextInput v-model="ivCatheterGauge" inputmode="numeric" />
          </UiField>
          <UiField label="Attempts">
            <UiNumberInput v-model="ivCatheterAttempts" />
          </UiField>
          <UiField label="Site">
            <UiTextInput v-model="ivSite" />
          </UiField>
          <UiField label="Fluid">
            <UiTextInput v-model="ivFluid" />
          </UiField>
        </UiRow>
        <UiBanner v-if="premedChip" :tone="premedChip.eligible ? 'safe' : 'caution'" icon="⏱">
          Pre-med wait —
          <template v-if="premedChip.eligible"> ready to start IV. </template>
          <template v-else>
            {{ premedChip.remainingMin }} min remaining (clinical cushion, not a hard block).
          </template>
        </UiBanner>
        <UiButton
          tone="primary"
          block
          :state="ivStartState"
          :logged-at="fmtClock(ivStartedAt)"
          :cooldown-ms="0"
          @click="onIvStart"
        >
          {{ ivStarted ? 'IV Started' : 'Start IV' }}
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 4 — N₂O OFF -> O₂ 100% ------------------------------------ -->

    <UiCard tint="ph3">
      <p class="heading">4 · N₂O OFF → O₂ 100%</p>
      <UiButton
        tone="primary"
        block
        :state="o2OnlyOn ? 'logged' : 'idle'"
        logged-at="O₂ 100%"
        :cooldown-ms="0"
        :disabled="!n2oOn && !o2OnlyOn"
        class="mt-2"
        @click="onN2oOff"
      >
        N₂O OFF · O₂ 100% ON
      </UiButton>
    </UiCard>

    <!-- Card 5 — Initial test dose. -->

    <UiCard tint="ph3">
      <p class="heading">5 · Initial Test Dose</p>
      <div class="drug-grid mt-2">
        <UiDrugButton
          tone="versed"
          name="Versed · Test"
          dose="1 mg"
          sub="0.2 ml"
          :state="versedTestState"
          :logged-at="fmtClock(lastVersedAt)"
          @click="logIvVersed(1, 'test dose')"
        />
      </div>
    </UiCard>

    <!-- Card 6 — Additional IV doses with live timers + cumulative.
         Wrapper ref drives the SedationDock auto-hide: while this card is
         in viewport the dock stays tucked away (the in-card titration
         buttons cover the workflow); scrolling past reveals the dock. -->

    <div ref="dockSentinelRef">
      <UiCard tint="ph3">
        <p class="heading">6 · Additional Doses</p>
        <UiStack :gap="3" class="mt-2">
          <UiRow :gap="3" wrap>
            <UiTimerPill
              label="Versed timer"
              tone="versed"
              :count="versedTimerView.count"
              :hint="versedTimerView.hint"
              :status="versedTimerView.status"
            />
            <UiTimerPill
              label="Fentanyl timer"
              tone="fentanyl"
              :count="fentanylTimerView.count"
              :hint="fentanylTimerView.hint"
              :status="fentanylTimerView.status"
            />
          </UiRow>

          <p class="caption">Versed (Midazolam)</p>
          <div class="drug-grid">
            <UiDrugButton
              tone="versed"
              name="Versed"
              dose="1 mg"
              sub="0.2 ml"
              @click="logIvVersed(1, 'additional')"
            />
            <UiDrugButton
              tone="versed"
              name="Versed"
              dose="2 mg"
              sub="0.4 ml"
              @click="logIvVersed(2, 'additional')"
            />
          </div>

          <p class="caption">Fentanyl</p>
          <div class="drug-grid">
            <UiDrugButton
              tone="fentanyl"
              name="Fentanyl"
              dose="25 mcg"
              sub="0.5 ml"
              @click="logIvFentanyl(25, 'additional')"
            />
            <UiDrugButton
              tone="fentanyl"
              name="Fentanyl"
              dose="50 mcg"
              sub="1.0 ml"
              @click="logIvFentanyl(50, 'additional')"
            />
          </div>

          <p class="caption">Antiemetic</p>
          <div class="drug-grid">
            <UiDrugButton
              tone="zofran"
              name="Zofran"
              dose="4 mg"
              sub="2.0 ml · over 2-5 min"
              @click="logIvZofran(4)"
            />
          </div>

          <!-- IV max-dose stat cards. -->
          <div class="stat-grid">
            <UiStatCard
              label="Versed total"
              :value="versedCard.value"
              :unit="versedCard.value !== '—' ? `/ ${versedCard.ceiling.toFixed(1)} mg` : undefined"
              :category="versedCard.severity"
              :severity="versedCard.severity"
              :detail="
                versedCard.ceilingReducedByOpioid
                  ? `Synergy: ceiling reduced 30% (Fentanyl on board)`
                  : `Solo ceiling: ${versedCeilingFromFormulary} mg`
              "
            />
            <UiStatCard
              label="Fentanyl total"
              :value="fentanylCard.value"
              :unit="fentanylCard.value !== '—' ? `/ ${fentanylCard.ceiling} mcg` : undefined"
              :category="fentanylCard.severity"
              :severity="fentanylCard.severity"
            />
          </div>

          <!-- Combined sedation load — Apple Health-style with bar. -->
          <UiCard>
            <UiRow :gap="3" align="center" justify="between">
              <div>
                <p class="caption">Combined sedation load</p>
              </div>
              <p class="big-pct" :class="`big-pct--${combinedCard.severity}`">
                {{ combinedCard.percent.toFixed(0) }}%
              </p>
            </UiRow>
            <UiPercentBar :percent="combinedCard.percent" thickness="lg" class="mt-2" />
          </UiCard>
        </UiStack>
      </UiCard>
    </div>

    <!-- Card 7 — Sedation Level Vitals ---------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">7 · Sedation Level Achieved</p>
      <UiStack :gap="3" class="mt-2">
        <UiRow :gap="3" wrap>
          <UiField label="HR" hint="bpm">
            <UiNumberInput v-model="sedHr" placeholder="HR" />
          </UiField>
          <UiField label="BP" hint="mmHg">
            <UiBpInput v-model="sedBp" />
          </UiField>
          <UiField label="SpO₂" hint="%">
            <UiNumberInput v-model="sedSpo2" :min="0" :max="100" placeholder="%" />
          </UiField>
          <UiField label="EtCO₂" hint="mmHg">
            <UiNumberInput v-model="sedEtco2" placeholder="EtCO₂" />
          </UiField>
          <UiField v-if="diabetic" label="Glucose" hint="mg/dL · diabetic">
            <UiNumberInput v-model="sedGlucose" placeholder="Glucose" :min="0" />
          </UiField>
        </UiRow>
        <UiField label="Patient response">
          <UiSelect v-model="sedResponse" :options="responseOptions" block />
        </UiField>
        <UiButton
          tone="primary"
          block
          :state="sedVitalsState"
          :logged-at="fmtClock(sedStampedAt)"
          :cooldown-ms="0"
          @click="stampSedationVitals"
        >
          Stamp Sedation Level
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 8 — Procedure Start ----------------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">8 · Procedure Start</p>
      <UiButton
        tone="primary"
        block
        :state="procStartState"
        :logged-at="fmtClock(procedureStartedAt)"
        :cooldown-ms="0"
        class="mt-2"
        @click="onProcedureStart"
      >
        Start Procedure
      </UiButton>
    </UiCard>

    <!-- Card 9 — Local Anesthesia + live Malamed combined-% -------------- -->

    <UiCard tint="ph3">
      <p class="heading">9 · Local Anesthesia</p>

      <UiBanner v-if="!weightLb" tone="caution" icon="⚖️" class="mt-2">
        Patient weight is required for the per-drug max-dose math. Fill weight in Phase 1.
      </UiBanner>

      <div class="drug-grid mt-2">
        <UiDrugButton
          tone="lidocaine"
          name="Lidocaine"
          dose="2%"
          sub="1:100k epi · 1 carp"
          :disabled="!weightLb"
          @click="logLocal('lidocaine-2-epi100k', '2% Lidocaine 1:100k')"
        />
        <UiDrugButton
          tone="septocaine-gold"
          name="Septocaine"
          dose="4%"
          sub="1:100k epi · 1 carp"
          :disabled="!weightLb"
          @click="logLocal('septocaine-4-epi100k', '4% Septocaine 1:100k')"
        />
        <UiDrugButton
          tone="septocaine-silver"
          name="Septocaine"
          dose="4%"
          sub="1:200k epi · 1 carp"
          :disabled="!weightLb"
          @click="logLocal('septocaine-4-epi200k', '4% Septocaine 1:200k')"
        />
        <UiDrugButton
          tone="marcaine"
          name="Marcaine"
          dose="0.25%"
          sub="1:200k epi · 1 carp"
          :disabled="!weightLb"
          @click="logLocal('marcaine-0_25-epi200k', '0.25% Marcaine 1:200k')"
        />
        <UiDrugButton
          tone="mepivacaine"
          name="Mepivacaine"
          dose="3%"
          sub="plain · 1 carp"
          :disabled="!weightLb"
          @click="logLocal('mepivacaine-3-plain', '3% Mepivacaine plain')"
        />
      </div>

      <UiStack v-if="localResult && localResult.perDrug.length > 0" :gap="2" class="mt-2">
        <UiStatCard
          v-for="row in localResult.perDrug"
          :key="row.drugId"
          :label="row.name"
          :value="row.percent.toFixed(0)"
          unit="%"
          :category="row.severity"
          :severity="row.severity"
          :detail="`${row.carpulesGiven} carp · active ${row.activeMg.toFixed(1)} mg / ${row.maxMg.toFixed(0)} mg max`"
        />

        <UiCard>
          <UiRow :gap="3" align="center" justify="between">
            <div>
              <p class="caption">Malamed combined load</p>
            </div>
            <p class="big-pct" :class="`big-pct--${localResult.severity}`">
              {{ localResult.combinedPercent.toFixed(0) }}%
            </p>
          </UiRow>
          <UiPercentBar :percent="localResult.combinedPercent" thickness="lg" class="mt-2" />
        </UiCard>
      </UiStack>
    </UiCard>

    <!-- Card 10 — Reversal Agents (emergency use only) ------------------ -->

    <UiCard tint="ph3">
      <p class="heading">10 · Reversal Agents</p>
      <UiBanner tone="limit" icon="🚨" class="mt-2">
        <strong>Emergency use only.</strong> Tapping either button reveals the full administration
        process below. Flumazenil also extends the IV-out / sign-note wait to 120 min per the DOCS
        reversal monitoring protocol.
      </UiBanner>
      <div class="drug-grid mt-2">
        <UiDrugButton
          tone="flumazenil"
          name="Flumazenil"
          dose="0.2 mg"
          sub="benzo reversal"
          @click="onFlumazenil"
        />
        <UiDrugButton
          tone="naloxone"
          name="Naloxone"
          dose="0.4 mg"
          sub="opioid reversal"
          @click="onNaloxone"
        />
      </div>

      <div v-if="flumazenilProcessOpen" class="reversal-info mt-2">
        <p class="caption">Flumazenil · process</p>
        <UiSyringe
          label="Flumazenil"
          :capacity-ml="3"
          :drawn-ml="2"
          color="#ef4444"
          concentration="0.1 mg/mL"
          caption="0.2 mg · 2.0 mL"
        />
        <ol class="reversal-steps">
          <li>Draw 2 ml (0.2 mg) into a 3 cc syringe; label BLACK.</li>
          <li>Open IV all the way; administer slowly over 15-20 seconds.</li>
          <li><strong>Wait 3 minutes</strong>, then re-assess respiration and arousal.</li>
          <li>If improving → <strong>stop.</strong> Do not give more.</li>
          <li>If no improvement → repeat 0.2 mg every 3 min, max 1.0 mg total (5 doses).</li>
          <li>
            Continue to monitor for <strong>120 minutes</strong> — flumazenil half-life is shorter
            than the benzodiazepine it reverses; patient may re-sedate.
          </li>
        </ol>
      </div>

      <div v-if="naloxoneProcessOpen" class="reversal-info mt-2">
        <p class="caption">Naloxone · process</p>
        <UiSyringe
          label="Naloxone"
          :capacity-ml="3"
          :drawn-ml="1"
          color="#ef4444"
          concentration="0.4 mg/mL"
          caption="0.4 mg · 1.0 mL"
        />
        <ol class="reversal-steps">
          <li>Draw the single-dose vial (0.4 mg in 1 ml) into a 3 cc syringe; label BLACK.</li>
          <li>Administer slowly over 2-3 minutes via the existing IV line.</li>
          <li><strong>Wait 3 minutes</strong>, then re-assess respiration.</li>
          <li>If still inadequate → repeat 0.4 mg q3 min.</li>
          <li>
            If no response after cumulative 5-10 mg → consider alternative diagnosis (stroke,
            encephalopathy).
          </li>
          <li>
            Monitor continuously for 1-2 hours after the last dose — patient may re-sedate as
            naloxone clears.
          </li>
        </ol>
      </div>
    </UiCard>

    <PhaseFooterNav
      :back="{ label: 'Phase 2 · Oral Sedation', route: '/phase/2', tint: 'ph2' }"
      :forward="{ label: 'Phase 4 · Recovery', route: '/phase/4', tint: 'ph4' }"
    />

    <template #rail>
      <PatientSummaryCard />
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
.drug-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--sp-2);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
.big-pct {
  margin: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--color-text-primary);
}
.big-pct--caution {
  color: var(--color-warn);
}
.big-pct--limit {
  color: var(--color-danger);
}
.big-pct--crisis {
  color: var(--color-crisis);
}
.reversal-info {
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4);
}
.reversal-steps {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--type-footnote);
  line-height: 1.55;
  color: var(--color-text-secondary);
}
.reversal-steps strong {
  color: var(--color-text-primary);
}
</style>
