<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import {
  EMERGENCY_PROTOCOLS,
  findProtocol,
  type EmergencyCategory,
  type EmergencyDrugCallout,
  type EmergencyProtocol,
  type ProtocolStep,
} from '@sedation-pro/clinical';
import { UiBanner, UiButton, UiCard, UiStatusPill, UiSyringe } from '@sedation-pro/ui';

import { parseVolumeMl, syringeConfig } from '@/composables/useSyringeConfig';
import { useInventoryStatus } from '@/composables/useInventoryStatus';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();

const protocol = computed<EmergencyProtocol | undefined>(() => findProtocol(props.id));

/** Maps the seven engine categories down to the five display swatches. */
function swatchFor(category: EmergencyCategory): string {
  if (category.startsWith('cardiac')) return 'cardiac';
  if (category === 'allergic') return 'allergic';
  if (category === 'neurological') return 'neuro';
  if (category === 'airway') return 'airway';
  return 'other';
}

const categoryLabel: Record<EmergencyCategory, string> = {
  airway: 'Airway',
  'cardiac-ischemia': 'Cardiac · Ischemia',
  'cardiac-arrhythmia': 'Cardiac · Arrhythmia',
  'cardiac-arrest': 'Cardiac · Arrest',
  allergic: 'Allergic & Toxicity',
  neurological: 'Neurological',
  other: 'Other',
};

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

function goBack() {
  void router.push('/quick-reference');
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
 * Builds the route line shown under the dose: e.g. `IV · 1.0 ml · 1 mg/ml (1:1000)`.
 * Pieces drop out cleanly when the formulary doesn't carry that field.
 */
function routeLine(drug: EmergencyDrugCallout): string {
  // Volume is deliberately absent here — it renders on its own prominent
  // Draw line; this line carries only route and concentration.
  const parts: string[] = [drug.route];
  if (drug.concentration) parts.push(drug.concentration);
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
    capacityMl: cfg.capacityMl,
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
      <UiButton tone="neutral" @click="goBack">← Quick Reference</UiButton>
    </header>

    <template v-if="protocol">
      <header class="hero" :class="`hero--${swatchFor(protocol.category)}`">
        <p class="caption">{{ categoryLabel[protocol.category] }}</p>
        <h1 class="title-display">{{ protocol.name }}</h1>
        <p class="hero-summary">{{ protocol.summary }}</p>

        <div v-if="protocol.signs.length > 0" class="signs-row">
          <span class="signs-label">Signs</span>
          <span v-for="sign in protocol.signs" :key="sign" class="sign-pill">{{ sign }}</span>
        </div>
      </header>

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
                <p v-if="step.drug.mixFirst" class="drug-mix">⚠ {{ step.drug.mixFirst }}</p>
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

      <UiCard v-if="related.length > 0" class="related-card">
        <p class="heading related-heading">Related protocols</p>
        <div class="related-grid">
          <button
            v-for="rel in related"
            :key="rel.id"
            type="button"
            class="related-row"
            :class="`related-row--${swatchFor(rel.category)}`"
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
  background: var(--color-surface);
}
.hero--airway {
  border-left-color: #38bdf8;
}
.hero--cardiac {
  border-left-color: var(--color-danger);
  background: var(--color-crisis-soft);
}
.hero--allergic {
  border-left-color: var(--color-purple);
}
.hero--neuro {
  border-left-color: var(--color-warn);
}
.hero--other {
  border-left-color: var(--color-slate);
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
  border: 1px solid transparent;
}
.step--critical {
  background: var(--color-crisis-soft);
  border-color: var(--color-crisis);
}
.step--final {
  background: var(--color-surface-elevated);
  border-color: var(--color-border);
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

/* Related */
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
}
.related-row--airway {
  border-left-color: #38bdf8;
}
.related-row--cardiac {
  border-left-color: var(--color-danger);
}
.related-row--allergic {
  border-left-color: var(--color-purple);
}
.related-row--neuro {
  border-left-color: var(--color-warn);
}
.related-row--other {
  border-left-color: var(--color-slate);
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
