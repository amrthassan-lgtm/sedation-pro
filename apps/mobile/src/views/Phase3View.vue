<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useIVStore } from '@/stores/iv';
import { useUndoStore } from '@/stores/undo';
import { useNow } from '@/composables/useNow';
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
  UiTextInput,
  UiTimerPill,
} from '@sedation-pro/ui';
import { DEFAULT_FORMULARY, premedWait } from '@sedation-pro/clinical';
import type { ActionState, BpValue, TimerPillStatus } from '@sedation-pro/ui';

const iv = useIVStore();
const undo = useUndoStore();
const now = useNow(1000);

const {
  n2oOn,
  o2OnlyOn,
  ivStarted,
  ivCatheterGauge,
  ivCatheterAttempts,
  ivSite,
  ivFluid,
  versedTotalMg,
  fentanylTotalMcg,
  lastVersedAt,
  lastFentanylAt,
  sedationStatus,
} = storeToRefs(iv);

// -------- Pre-op vitals form (local — only stamped on tap) ------------------

const preOpHr = ref<number | null>(null);
const preOpBp = ref<BpValue>({ sbp: null, dbp: null });
const preOpSpo2 = ref<number | null>(null);
const preOpEtco2 = ref<number | null>(null);
const preOpResponse = ref<string>('Alert');

const responseOptions = [
  { value: 'Alert', label: 'Alert' },
  { value: 'Relaxed', label: 'Relaxed' },
  { value: 'Responds to verbal', label: 'Responds to verbal' },
  { value: 'Responds to tactile', label: 'Responds to tactile' },
  { value: 'Concern', label: '⚠️ Concern' },
];

const preOpVitalsState = ref<ActionState>('idle');
function stampPreOpVitals() {
  const bp = preOpBp.value;
  iv.setPreOpVitals({
    hr: preOpHr.value,
    bp,
    spo2: preOpSpo2.value,
    etco2: preOpEtco2.value,
    response: preOpResponse.value,
    at: Date.now(),
  });
  preOpVitalsState.value = 'locked';
  undo.stamp({
    event: 'Pre-Op Vitals',
    details: {
      HR: preOpHr.value !== null ? `${preOpHr.value} bpm` : '—',
      BP: bp.sbp !== null && bp.dbp !== null ? `${bp.sbp}/${bp.dbp}` : '—',
      SpO2: preOpSpo2.value !== null ? `${preOpSpo2.value}%` : '—',
      EtCO2: preOpEtco2.value !== null ? `${preOpEtco2.value} mmHg` : '—',
      Response: preOpResponse.value,
    },
    toast: {
      label: '✓ Pre-Op Vitals stamped',
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'safe',
    },
  });
  setTimeout(() => {
    preOpVitalsState.value = 'logged';
  }, 800);
}

// -------- Gas flow ----------------------------------------------------------

function onN2oOn() {
  iv.setN2oOn();
  undo.stamp({
    event: 'N₂O/O₂ ON',
    details: { Route: 'Inhalation' },
    toast: { label: '✓ N₂O/O₂ ON', tone: 'safe' },
  });
}

function onN2oOff() {
  iv.setN2oOff();
  undo.stamp({
    event: 'N₂O/O₂ OFF · O₂ 100% ON',
    details: { 'N₂O': 'Discontinued', 'O₂': '100% via nasal cannula' },
    toast: { label: '✓ N₂O off · O₂ 100% on', tone: 'safe' },
  });
}

// -------- IV start ----------------------------------------------------------

const ivStartState = ref<ActionState>('idle');
function onIvStart() {
  iv.startIV();
  ivStartState.value = 'locked';
  undo.stamp({
    event: 'IV Start',
    details: {
      Catheter: `${ivCatheterGauge.value}g`,
      Site: ivSite.value,
      'Venipuncture attempts': String(ivCatheterAttempts.value),
      Fluids: ivFluid.value,
    },
    toast: { label: '✓ IV Started', tone: 'safe' },
  });
  setTimeout(() => {
    ivStartState.value = 'logged';
  }, 800);
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

function logIvVersed(mg: number, sub: string) {
  iv.logDose({ drug: 'versed', mg });
  undo.stamp({
    event: 'IV Dose',
    details: { Drug: 'Midazolam (Versed)', Dose: `${mg} mg`, Route: 'IV' },
    toast: {
      label: `✓ Versed ${mg} mg IV (${sub})`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'caution',
    },
    revert: () => {
      const last = iv.doses[iv.doses.length - 1];
      if (last && last.drug === 'versed' && last.mg === mg) iv.removeDoseById(last.id);
    },
  });
}

function logIvFentanyl(mcg: number, sub: string) {
  iv.logDose({ drug: 'fentanyl', mcg });
  undo.stamp({
    event: 'IV Dose',
    details: { Drug: 'Fentanyl', Dose: `${mcg} mcg`, Route: 'IV' },
    toast: {
      label: `✓ Fentanyl ${mcg} mcg IV (${sub})`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'caution',
    },
    revert: () => {
      const last = iv.doses[iv.doses.length - 1];
      if (last && last.drug === 'fentanyl' && last.mcg === mcg) iv.removeDoseById(last.id);
    },
  });
}

function logIvZofran(mg: number) {
  iv.logDose({ drug: 'zofran', mg });
  undo.stamp({
    event: 'IV Dose',
    details: { Drug: 'Ondansetron (Zofran)', Dose: `${mg} mg`, Route: 'IV' },
    toast: {
      label: `✓ Zofran ${mg} mg IV`,
      sub: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tone: 'safe',
    },
    revert: () => {
      const last = iv.doses[iv.doses.length - 1];
      if (last && last.drug === 'zofran' && last.mg === mg) iv.removeDoseById(last.id);
    },
  });
}

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
  const count = t.state === 'ready' ? '✓' : fmtDuration(t.elapsedSec);
  const hint =
    t.state === 'ready'
      ? 'Ready'
      : t.state === 'ramping'
        ? `peak in ${fmtDuration(t.remainingSec)}`
        : `wait · ${fmtDuration(t.remainingSec)}`;
  return { count, hint, status: t.state };
});

const fentanylTimerView = computed(() => {
  if (lastFentanylAt.value === null) {
    return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  }
  const t = iv.fentanylTimerAt(now.value);
  if (!t) return { count: '—', hint: 'Awaiting first dose', status: 'cooling' as TimerPillStatus };
  const count = t.state === 'ready' ? '✓' : fmtDuration(t.elapsedSec);
  const hint = t.state === 'ready' ? 'Ready' : `wait · ${fmtDuration(t.remainingSec)}`;
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
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 3 · IV Sedation & Procedure</p>
      <h1 class="title-display">Drug Administration</h1>
      <p class="body muted">
        Vitals → N₂O → IV start → test dose → titrate. Timer pills, max-dose ceilings, and the
        combined sedation load all update live. Local anesthesia + reversal panel ship in the next
        push.
      </p>
    </header>

    <!-- Card 1 — Pre-Op Vitals ------------------------------------------ -->

    <UiCard tint="ph3" active>
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
        </UiRow>
        <UiField label="Patient response">
          <UiSelect v-model="preOpResponse" :options="responseOptions" block />
        </UiField>
        <UiButton
          tone="primary"
          block
          :state="preOpVitalsState"
          :logged-at="
            preOpVitalsState === 'logged'
              ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : undefined
          "
          @click="stampPreOpVitals"
        >
          Stamp Pre-Op Vitals
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 2 — N₂O / O₂ ON ------------------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">2 · N₂O / O₂ ON</p>
      <p class="body muted">
        Mild anxiolysis before IV catheter placement. 30-50% N₂O, the rest O₂.
      </p>
      <UiButton
        tone="primary"
        block
        :state="n2oOn ? 'logged' : 'idle'"
        logged-at="On"
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
          :logged-at="
            ivStartState === 'logged'
              ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : undefined
          "
          @click="onIvStart"
        >
          {{ ivStarted ? 'IV Started' : 'Start IV' }}
        </UiButton>
      </UiStack>
    </UiCard>

    <!-- Card 4 — N₂O OFF -> O₂ 100% ------------------------------------ -->

    <UiCard tint="ph3">
      <p class="heading">4 · N₂O OFF → O₂ 100%</p>
      <p class="body muted">
        Discontinue N₂O before IV sedation drugs. 100% oxygen keeps the safety margin while you
        titrate.
      </p>
      <UiButton
        tone="primary"
        block
        :state="o2OnlyOn ? 'logged' : 'idle'"
        logged-at="O₂ 100%"
        :disabled="!n2oOn && !o2OnlyOn"
        class="mt-2"
        @click="onN2oOff"
      >
        N₂O OFF · O₂ 100% ON
      </UiButton>
    </UiCard>

    <!-- Card 5 — Initial test dose ------------------------------------- -->

    <UiCard tint="ph3">
      <p class="heading">5 · Initial Test Dose</p>
      <p class="body muted">
        Always start Versed with a 1 mg test dose. Wait 3-5 min before any additional dose — the
        timer pill below tracks it in real time.
      </p>
      <div class="drug-grid mt-2">
        <UiDrugButton
          tone="versed"
          name="Versed · Test"
          dose="1 mg"
          sub="0.2 ml"
          @click="logIvVersed(1, 'test dose')"
        />
      </div>
    </UiCard>

    <!-- Card 6 — Additional IV doses with live timers + cumulative -- -->

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
              <p class="body muted">
                Average of Versed % and Fentanyl % — caution ≥70 / limit ≥90 / crisis ≥100.
              </p>
            </div>
            <p class="big-pct" :class="`big-pct--${combinedCard.severity}`">
              {{ combinedCard.percent.toFixed(0) }}%
            </p>
          </UiRow>
          <UiPercentBar :percent="combinedCard.percent" thickness="lg" class="mt-2" />
        </UiCard>
      </UiStack>
    </UiCard>

    <UiBanner tone="info" title="Next up" icon="🚧">
      Local anesthesia tiles, Malamed combined-% card, and the reversal panel (flumazenil + naloxone
      with the process boxes) ship in the next push. Phase 4 — recovery vitals, IV-out countdown,
      signature pad, clinical note — follows that.
    </UiBanner>
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
</style>
