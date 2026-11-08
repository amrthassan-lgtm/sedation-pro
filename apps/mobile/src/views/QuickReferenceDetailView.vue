<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  EMERGENCY_PROTOCOLS,
  PROTOCOLS_REVIEWED,
  findProtocol,
  type EmergencyDrugCallout,
  type EmergencyProtocol,
  type ProtocolStep,
} from '@sedation-pro/clinical';
import {
  UiBanner,
  UiButton,
  UiCard,
  UiDrugButton,
  UiStatusPill,
  UiSyringe,
} from '@sedation-pro/ui';
import { storeToRefs } from 'pinia';

import { useIvDosing } from '@/composables/useIvDosing';
import { fmtClock } from '@/composables/format';
import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { CASE_PHASE_ROUTE, CASE_PHASE_SHORT, useSessionStore } from '@/stores/session';

import { parseVolumeMl, syringeConfig } from '@/composables/useSyringeConfig';
import { useInventoryStatus, type ClassifiedItem } from '@/composables/useInventoryStatus';
import { CATEGORY_LABEL, swatchFor } from '@/data/protocolCategories';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();

const protocol = computed<EmergencyProtocol | undefined>(() => findProtocol(props.id));

const related = computed<ReadonlyArray<EmergencyProtocol>>(() => {
  const ids = protocol.value?.relatedProtocols;
  if (!ids || ids.length === 0) return [];
  return ids
    .map((id) => EMERGENCY_PROTOCOLS.find((p) => p.id === id))
    .filter((p): p is EmergencyProtocol => Boolean(p));
});

function severityClass(step: ProtocolStep): string {
  if (step.severity === 'critical') return 'step--critical';
  if (step.severity === 'final') return 'step--final';
  return '';
}

/**
 * Context-aware back button. Protocol details are reachable from more
 * than one place now (Quick Reference list, the inventory's "Used in"
 * expansion, related-protocol links), so the toolbar reflects where the
 * user actually came from and `router.back()` returns them there. A
 * deep link / fresh load has no in-app history — fall back to pushing
 * the Quick Reference list, the old behavior.
 *
 * `history.state` isn't reactive; depending on `route.fullPath` makes
 * the label recompute when related-protocol taps reuse this component.
 */
const route = useRoute();
const hasHistory = computed<boolean>(() => {
  void route.fullPath;
  const prev =
    typeof window !== 'undefined'
      ? (router.options.history.state?.back as string | null | undefined)
      : null;
  return typeof prev === 'string';
});

/**
 * The toolbar is the same on every protocol: Back on the left (wherever
 * you came from: the list, another protocol, the inventory), All protocols
 * on the right. A deep link with no history treats Back as the list.
 */
function goBack() {
  if (hasHistory.value) {
    router.back();
    return;
  }
  void router.push('/quick-reference');
}

function goList() {
  void router.push('/quick-reference');
}

// -------- Back to case --------------------------------------------------------
const session = useSessionStore();
const backToCaseLabel = computed(() => `Back to case · ${CASE_PHASE_SHORT[session.lastCasePhase]}`);
function goCase() {
  void router.push(CASE_PHASE_ROUTE[session.lastCasePhase]);
}

// -------- Call 911 ----------------------------------------------------------
// Any protocol whose steps say to call 911 gets the banner: large enough to
// read aloud across the room, and a tel: link where the device can dial.
const call911 = computed(() => protocol.value?.steps.some((s) => /911/.test(s.text)) ?? false);

// -------- Give and log ------------------------------------------------------
// The oversedation protocols end in a reversal dose. Logging it from here
// runs the same code as the Phase 3 buttons: the dose lands in the record,
// the undo toast appears, and discharge is held 120 min. Only while a case
// is open, so a reference lookup can never write into an empty chart.
type ReversalDrug = 'flumazenil' | 'naloxone';
const PROTOCOL_REVERSALS: Readonly<Record<string, ReadonlyArray<ReversalDrug>>> = {
  oversedation_benzo: ['flumazenil'],
  oversedation_opioid: ['naloxone'],
  hypoventilation: ['naloxone', 'flumazenil'],
};
const REVERSAL_BUTTON: Readonly<Record<ReversalDrug, { name: string; dose: string; sub: string }>> =
  {
    flumazenil: {
      name: 'Flumazenil',
      dose: '0.2 mg IV',
      sub: 'logs the dose · holds discharge 120 min',
    },
    naloxone: {
      name: 'Naloxone',
      dose: '0.4 mg IV',
      sub: 'logs the dose · holds discharge 120 min',
    },
  };
const reversals = computed(() => PROTOCOL_REVERSALS[props.id] ?? []);
const patient = usePatientStore();
const { isPhase1Complete } = storeToRefs(patient);
const iv = useIVStore();
const { lastFlumazenilAt, lastNaloxoneAt } = storeToRefs(iv);
const dosing = useIvDosing();
function giveReversal(drug: ReversalDrug) {
  if (drug === 'flumazenil') dosing.logIvFlumazenil();
  else dosing.logIvNaloxone();
}
function lastGiven(drug: ReversalDrug): string | undefined {
  const at = drug === 'flumazenil' ? lastFlumazenilAt.value : lastNaloxoneAt.value;
  if (at === null) return undefined;
  return fmtClock(at) ?? '';
}

/**
 * Stock pill on drug callouts, from the crash-cart inventory's explicit
 * opt-in mapping. Best-of across lots: the pill answers "can I grab an
 * in-date unit right now?" — reorder pressure lives on the inventory
 * screen. Unmapped drugs (controlled substances, unstocked agents)
 * render no pill at all.
 */
const inventory = useInventoryStatus();
const STOCK_PILL: Record<'safe' | 'caution' | 'limit', string> = {
  safe: 'In stock',
  caution: 'Expiring',
  limit: 'Expired',
};
function stockPill(name: string): { severity: 'safe' | 'caution' | 'limit'; label: string } | null {
  const severity = inventory.statusFor(name);
  if (severity === null || severity === 'crisis') return null;
  return { severity, label: STOCK_PILL[severity] };
}

function open(id: string) {
  void router.push(`/quick-reference/${id}`);
}

/**
 * The devices this protocol depends on (LMA sizes, King, NPAs), from the
 * equipment rows linked to it by id. Same question as the drug pills:
 * is there one in date to grab right now.
 */
const kit = computed(() => (protocol.value ? inventory.equipmentFor(protocol.value.id) : []));
type KitPill = { severity: 'safe' | 'caution' | 'limit' | 'empty'; label: string };
function kitPill(c: ClassifiedItem): KitPill {
  if (c.item.awaitingPhoto) return { severity: 'empty', label: 'No date' };
  if (c.item.noExpiry) return { severity: 'safe', label: 'In stock' };
  if (c.item.onOrder && c.status.severity !== 'safe')
    return { severity: 'empty', label: 'On order' };
  const sev = c.status.severity === 'crisis' ? 'limit' : c.status.severity;
  return { severity: sev, label: STOCK_PILL[sev] };
}
function kitExpiry(expiresOn: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(expiresOn);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return `Exp ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

/**
 * "One course" line for drugs the practice tracks as a course (atropine,
 * adenosine, flumazenil, nitro): in-date mg on hand against one full
 * course, with pending orders named so a shipped box is never read as a
 * gap. Drugs without a course render nothing.
 */
function courseLine(name: string): { text: string; short: boolean } | null {
  const course = inventory.courses.find((c) => c.drug === name);
  if (!course) return null;
  const order = course.onOrderMg > 0 ? ` · ${course.onOrderMg} mg on order` : '';
  return {
    text: `In date: ${course.haveMg} mg · one course: ${course.needMg} mg${order}`,
    short: course.short,
  };
}

/**
 * Builds the route line shown under the dose: e.g. `IV · 1.0 ml · 1 mg/ml`.
 * Pieces drop out cleanly when the formulary doesn't carry that field.
 */
/**
 * MIX FIRST recipes are "; "-separated steps. The waste-down step is the one
 * that turns a 10× mix into a dose, so it renders in bold — missing it means
 * pushing ten times the intended dose.
 */
// A recipe is "<header>; step; step; ...": the header names the syringe, each
// step renders on its own numbered line so it can be read across the room.
function mixHead(mix: string): string {
  return mix.split('; ')[0] ?? mix;
}

function mixSteps(mix: string): ReadonlyArray<{ text: string; key: boolean }> {
  return mix
    .split('; ')
    .slice(1)
    .map((text) => ({ text, key: /^WASTE DOWN/.test(text) }));
}

function routeLine(drug: EmergencyDrugCallout): string {
  // Volume is deliberately absent here — it renders on its own prominent
  // Draw line; this line carries only route and concentration.
  const parts: string[] = [drug.route];
  if (drug.concentration) parts.push(drug.concentration);
  if (drug.syringeMl !== undefined) parts.push(`${drug.syringeMl} ml syringe`);
  return parts.join(' · ');
}

/**
 * Returns the syringe rendering tuple for a drug callout when the drug is one
 * of the five recognised IV-push drugs *and* the callout includes a volume.
 * Otherwise returns `null` so the template can `v-if` past it.
 */
function syringeFor(drug: EmergencyDrugCallout) {
  const cfg = syringeConfig(drug.name);
  if (cfg === null) return null;
  const drawnMl = parseVolumeMl(drug.volume);
  if (drawnMl === null) return null;
  return {
    // The callout's own syringe wins over the formulary tray (a 1 ml
    // midazolam draw is drawn in the 1 ml barrel it is given from).
    capacityMl: drug.syringeMl ?? cfg.capacityMl,
    drawnMl,
    color: cfg.color,
    concentration: drug.concentration ?? cfg.concentration,
    caption: drug.volume ?? '',
  };
}
</script>

<template>
  <main class="phase-view">
    <header class="toolbar">
      <UiButton tone="neutral" @click="goBack">‹ Back</UiButton>
      <UiButton tone="primary" class="toolbar-case" @click="goCase">{{ backToCaseLabel }}</UiButton>
      <UiButton tone="neutral" @click="goList">All protocols</UiButton>
    </header>

    <template v-if="protocol">
      <header class="hero" :class="`cat-${swatchFor(protocol.category)}`">
        <p class="caption">{{ CATEGORY_LABEL[protocol.category] }}</p>
        <h1 class="title-display">{{ protocol.name }}</h1>
        <p class="hero-summary">{{ protocol.summary }}</p>

        <div v-if="protocol.signs.length > 0" class="signs-row">
          <span class="signs-label">Signs</span>
          <span v-for="sign in protocol.signs" :key="sign" class="sign-pill">{{ sign }}</span>
        </div>
      </header>

      <a v-if="call911" class="call-911" href="tel:911">
        <span class="call-911-main">CALL 911</span>
        <span class="call-911-sub"
          >Say the address, the emergency, and that a patient is sedated</span
        >
      </a>

      <UiCard v-if="reversals.length > 0" class="give-card">
        <p class="heading give-heading">Give and log</p>
        <p v-if="!isPhase1Complete" class="give-hint">
          Open the patient's case (Phase 1) to log a dose from here.
        </p>
        <div v-else class="give-grid">
          <UiDrugButton
            v-for="drug in reversals"
            :key="drug"
            :tone="drug"
            :name="REVERSAL_BUTTON[drug].name"
            :dose="REVERSAL_BUTTON[drug].dose"
            :sub="REVERSAL_BUTTON[drug].sub"
            :state="lastGiven(drug) ? 'logged' : 'idle'"
            :logged-at="lastGiven(drug)"
            @click="giveReversal(drug)"
          />
        </div>
      </UiCard>

      <UiCard v-if="kit.length > 0" class="kit-card">
        <p class="heading kit-heading">Equipment</p>
        <div class="kit-list">
          <div v-for="c in kit" :key="c.item.id" class="kit-row">
            <span class="kit-main">
              <span class="kit-name">{{ c.item.drug }}</span>
              <span class="kit-desc"
                >{{ c.item.description
                }}<template v-if="kitExpiry(c.item.expiresOn)">
                  · {{ kitExpiry(c.item.expiresOn) }}</template
                ></span
              >
            </span>
            <UiStatusPill :severity="kitPill(c).severity">{{ kitPill(c).label }}</UiStatusPill>
          </div>
        </div>
      </UiCard>

      <UiBanner
        v-if="protocol.contraindications && protocol.contraindications.length > 0"
        tone="caution"
        icon="⚠"
        title="Contraindications"
      >
        <ul class="contra-list">
          <li v-for="(c, idx) in protocol.contraindications" :key="idx">{{ c }}</li>
        </ul>
      </UiBanner>

      <UiCard class="steps-card">
        <p class="heading steps-heading">Steps</p>
        <ol class="steps">
          <li
            v-for="(step, index) in protocol.steps"
            :key="index"
            class="step"
            :class="severityClass(step)"
          >
            <span class="step-num">{{ index + 1 }}</span>
            <div class="step-body">
              <p class="step-text">{{ step.text }}</p>
              <div v-if="step.drug" class="drug-callout">
                <div class="drug-head">
                  <span class="drug-name-group">
                    <span class="drug-name">{{ step.drug.name }}</span>
                    <UiStatusPill
                      v-if="stockPill(step.drug.name)"
                      :severity="stockPill(step.drug.name)!.severity"
                    >
                      {{ stockPill(step.drug.name)!.label }}
                    </UiStatusPill>
                  </span>
                  <span class="drug-dose">{{ step.drug.dose }}</span>
                </div>
                <div v-if="step.drug.mixFirst" class="drug-mix">
                  <p class="drug-mix-head">⚠ {{ mixHead(step.drug.mixFirst) }}</p>
                  <ol class="drug-mix-steps">
                    <li v-for="(seg, i) in mixSteps(step.drug.mixFirst)" :key="i">
                      <strong v-if="seg.key" class="drug-mix-key">{{ seg.text }}</strong>
                      <template v-else>{{ seg.text }}</template>
                    </li>
                  </ol>
                </div>
                <div v-if="step.drug.volume" class="drug-draw">
                  <span class="drug-draw-label">Draw</span>
                  <span class="drug-draw-vol">{{ step.drug.volume }}</span>
                </div>
                <dl v-if="step.drug.drawTable" class="drug-draw-table">
                  <div v-for="row in step.drug.drawTable" :key="row.label" class="drug-draw-row">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.ml }}</dd>
                  </div>
                </dl>
                <p class="drug-route">{{ routeLine(step.drug) }}</p>
                <p v-if="step.drug.notes" class="drug-notes">{{ step.drug.notes }}</p>
                <p
                  v-if="courseLine(step.drug.name)"
                  class="drug-course"
                  :class="{ 'drug-course--short': courseLine(step.drug.name)!.short }"
                >
                  {{ courseLine(step.drug.name)!.text }}
                </p>
                <UiSyringe
                  v-if="syringeFor(step.drug)"
                  compact
                  :label="step.drug.name"
                  :capacity-ml="syringeFor(step.drug)!.capacityMl"
                  :drawn-ml="syringeFor(step.drug)!.drawnMl"
                  :color="syringeFor(step.drug)!.color"
                  :concentration="syringeFor(step.drug)!.concentration"
                  :caption="`Draw ${syringeFor(step.drug)!.caption}`"
                />
              </div>
            </div>
          </li>
        </ol>
      </UiCard>

      <p class="reviewed caption">{{ PROTOCOLS_REVIEWED }}</p>

      <UiCard v-if="related.length > 0" class="related-card">
        <p class="heading related-heading">Related protocols</p>
        <div class="related-grid">
          <button
            v-for="rel in related"
            :key="rel.id"
            type="button"
            class="related-row"
            :class="`cat-${swatchFor(rel.category)}`"
            @click="open(rel.id)"
          >
            <span class="related-name">{{ rel.name }}</span>
            <span class="related-summary">{{ rel.summary }}</span>
            <span class="related-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </UiCard>
    </template>

    <UiBanner v-else tone="info" icon="🔍" title="Protocol not found">
      No protocol matches <strong>“{{ props.id }}”</strong>. Tap back to browse the library.
    </UiBanner>
  </main>
</template>

<style scoped>
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.toolbar-case {
  flex: 1;
  min-width: 0;
}

/* Call 911: readable from across the room; a tel: link where the device dials. */
.call-911 {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 64px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--color-crisis);
  color: white;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.call-911:active {
  filter: brightness(0.9);
}
.call-911-main {
  font-size: 28px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  line-height: 1.1;
}
.call-911-sub {
  font-size: var(--type-caption);
  opacity: 0.9;
  text-align: center;
}

.give-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.give-heading {
  margin: 0;
}
.give-hint {
  margin: 0;
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}
.give-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-2);
}

/* Hero: a category-tinted block that anchors the page. The left border colour
   matches the swatch used on the landing page so muscle memory carries over. */
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4) var(--sp-4) var(--sp-4) calc(var(--sp-4) + 4px);
  border-radius: var(--r-md);
  border: 1px solid var(--color-border);
  border-left-width: 4px;
  border-left-color: var(--cat);
  /* Only cardiac defines --cat-soft, so only cardiac heroes tint. */
  background: var(--cat-soft, var(--color-surface));
}
.hero-summary {
  margin: 0;
  font-size: var(--type-body);
  color: var(--color-text-secondary);
  line-height: 1.45;
}
.signs-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: var(--sp-1);
}
.signs-label {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  margin-right: 2px;
}
.sign-pill {
  font-size: var(--type-caption);
  font-weight: var(--weight-semibold);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.contra-list {
  margin: 0;
  padding-left: 18px;
}
.contra-list li {
  margin-bottom: 2px;
}

/* Steps card */
.steps-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.steps-heading {
  margin: 0;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  counter-reset: step-counter;
}
.step {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) calc(var(--sp-2) + 2px);
  border-radius: var(--r-md);
  /* A left accent bar carries the severity; a full red frame around a
     long step read as an error box rather than an instruction. */
  border-left: 3px solid transparent;
}
.step--critical {
  background: var(--color-crisis-soft);
  border-left-color: var(--color-crisis);
}
.step--final {
  background: var(--color-surface-elevated);
  border-left-color: var(--color-border);
}
.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step--critical .step-num {
  background: var(--color-crisis);
  color: white;
}
.step-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.step-text {
  margin: 0;
  font-size: var(--type-footnote);
  line-height: 1.5;
  color: var(--color-text-primary);
}
.step--critical .step-text {
  font-weight: var(--weight-semibold);
}

/* Drug callout — visually echoes the Phase 3 stat card so the same shape
   represents "this is a dose" everywhere in the app. */
.drug-callout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
.drug-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  /* Long doses ("0.1 mg (100 mcg)") drop to their own line instead of
     colliding with the drug name. */
  flex-wrap: wrap;
}
.drug-name-group {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.drug-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.2px;
}
.drug-dose {
  font-family: var(--font-mono);
  font-size: var(--type-title);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  white-space: nowrap;
}
/* MIX FIRST band — dilution recipes render as a danger-tinted warning
   ABOVE the draw line; drawing these from the stock vial is a 100× error. */
.drug-mix-key {
  font-weight: var(--weight-bold);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.drug-course {
  margin: 2px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.drug-course--short {
  color: var(--color-danger);
  font-weight: var(--weight-semibold);
}
.drug-mix-head {
  margin: 0;
}
.drug-mix-steps {
  margin: 2px 0 0;
  padding-left: 1.4em;
}
.drug-mix-steps li {
  padding: 1px 0;
}
.drug-mix {
  margin: 4px 0 0;
  padding: 4px 8px;
  font-size: var(--type-caption);
  font-weight: var(--weight-semibold);
  line-height: 1.4;
  color: var(--color-danger);
  background: var(--color-crisis-soft);
  border: 1px solid var(--color-crisis);
  border-radius: var(--r-sm);
}
/* The draw volume is the number a gloved hand acts on — it gets the hero
   treatment the mg dose used to monopolize. */
.drug-draw {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  margin-top: 2px;
}
.drug-draw-label {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.drug-draw-vol {
  font-family: var(--font-mono);
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.drug-draw-table {
  display: grid;
  /* Label column may wrap (naloxone's vial note is 34 chars); the ml
     column never does — no horizontal overflow at 375px. */
  grid-template-columns: minmax(0, 1fr) max-content;
  column-gap: var(--sp-3);
  row-gap: 2px;
  margin: 2px 0 0;
}
.drug-draw-row {
  display: contents;
}
.drug-draw-table dt {
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
  min-width: 0;
  overflow-wrap: break-word;
}
.drug-draw-table dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.drug-route {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.3px;
}
.drug-notes {
  margin: 2px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.reviewed {
  margin: 0;
  padding-inline: var(--sp-1);
  color: var(--color-text-secondary);
}

/* Related */
.kit-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.kit-heading {
  margin: 0;
}
/* Grouped inset list: hairline separators on the card's own surface. */
.kit-list {
  display: flex;
  flex-direction: column;
}
.kit-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 44px;
  padding: 8px 0;
}
.kit-row + .kit-row {
  border-top: 1px solid var(--color-border);
}
.kit-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kit-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
.kit-desc {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
}
.related-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.related-heading {
  margin: 0;
}
.related-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.related-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px 10px calc(12px + 2px);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-left-width: 3px;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.related-row:active {
  background: var(--color-surface);
  border-left-color: var(--cat);
}
.related-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  padding-right: 24px;
}
.related-summary {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  line-height: 1.4;
  padding-right: 24px;
}
.related-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--color-text-disabled);
}
</style>
