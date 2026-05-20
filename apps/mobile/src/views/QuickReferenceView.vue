<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  CRITICAL_PROTOCOL_IDS,
  DEFAULT_FORMULARY,
  EMERGENCY_PROTOCOLS,
  type EmergencyCategory,
  type EmergencyProtocol,
} from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiSyringe, UiTextInput } from '@sedation-pro/ui';

const router = useRouter();
const route = useRoute();

const query = ref('');
/**
 * Debounced mirror of `query`. The search filter runs against 32 protocols
 * × ~8 steps each on every keystroke; debouncing collapses fast typing
 * bursts into a single recompute. 100 ms is below the perceptual threshold
 * so the search still feels live.
 */
const debouncedQuery = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(query, (next) => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = next;
    debounceTimer = null;
  }, 100);
});
onScopeDispose(() => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});

const searchInputRef = useTemplateRef<{ focus: () => void }>('searchInputRef');

/**
 * IV drug reference table — restores the legacy app's drawing-up chart so a
 * clinician can grab the Emergency button and see "Versed 1 mg → 0.2 mL"
 * without leaving the screen. Doses + notes are presentation data; the
 * concentration / colour / formal name come from the formulary so practices
 * that override the formulary get this card free.
 */
interface DrugRefSeed {
  readonly id: string;
  readonly syringeMl: number;
  readonly tapeLabel: string;
  readonly tapeColor?: string;
  readonly doses: ReadonlyArray<number>;
  readonly doseUnit: 'mg' | 'mcg';
  readonly note: string;
  readonly warning?: string;
}

const DRUG_REF_SEEDS: ReadonlyArray<DrugRefSeed> = [
  {
    id: 'versed',
    syringeMl: 1,
    tapeLabel: 'ORANGE',
    tapeColor: '#f97316',
    doses: [1, 2],
    doseUnit: 'mg',
    note: 'Test dose 1 mg always. Titrate 1-2 mg q3-5 min to effect. Max typically 5-8 mg.',
  },
  {
    id: 'fentanyl',
    syringeMl: 3,
    tapeLabel: 'BLUE',
    tapeColor: '#3b82f6',
    doses: [25, 50],
    doseUnit: 'mcg',
    note: 'Titrate 25-50 mcg q5 min. Lowers BP slightly — use judiciously.',
    warning: 'Allergy to codeine → no fentanyl.',
  },
  {
    id: 'zofran',
    syringeMl: 3,
    tapeLabel: 'WHITE',
    tapeColor: '#94a3b8',
    doses: [4],
    doseUnit: 'mg',
    note: 'At onset of nausea, prior history, or end of appointment. Give over 2-5 min.',
  },
  {
    id: 'flumazenil',
    syringeMl: 3,
    tapeLabel: 'Flumazenil',
    doses: [0.2],
    doseUnit: 'mg',
    note: 'Draw 2 mL per dose. Repeat q3 min. Max 1.0 mg total (5 doses).',
    warning: 'Wait 3 min between doses · monitor 120 min post-reversal.',
  },
  {
    id: 'naloxone',
    syringeMl: 3,
    tapeLabel: 'Naloxone',
    doses: [0.4],
    doseUnit: 'mg',
    note: 'Single-dose vial = 1 mL. Repeat q2-3 min PRN. Give over 2-3 min.',
  },
];

const drugRefs = computed(() => {
  return DRUG_REF_SEEDS.map((seed) => {
    const drug = DEFAULT_FORMULARY.iv.find((d) => d.id === seed.id);
    if (!drug) return null;
    const conc = drug.concentration;
    const rows = seed.doses.map((dose) => ({
      doseLabel: `${dose} ${seed.doseUnit}`,
      ml: dose / conc.value,
    }));
    // Visualise the most common dose (first row) inside the syringe.
    const drawnMl = rows[0]?.ml ?? 0;
    return {
      seed,
      drug,
      rows,
      drawnMl: Math.min(seed.syringeMl, drawnMl),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
});

const expandedDrugId = ref<string | null>(null);
function toggleDrug(id: string) {
  expandedDrugId.value = expandedDrugId.value === id ? null : id;
}

interface CategoryGroup {
  id: string;
  label: string;
  swatch: string;
  // Subset of EmergencyCategory values that roll up under this display group.
  categories: ReadonlyArray<EmergencyCategory>;
}

/**
 * Display-time grouping — the engine carries 7 fine-grained categories,
 * the view rolls cardiac sub-categories under one card so the screen stays
 * scannable.
 */
const GROUPS: ReadonlyArray<CategoryGroup> = [
  { id: 'airway', label: 'Airway', swatch: 'airway', categories: ['airway'] },
  {
    id: 'cardiac',
    label: 'Cardiac',
    swatch: 'cardiac',
    categories: ['cardiac-ischemia', 'cardiac-arrhythmia', 'cardiac-arrest'],
  },
  {
    id: 'allergic',
    label: 'Allergic & Toxicity',
    swatch: 'allergic',
    categories: ['allergic'],
  },
  { id: 'neuro', label: 'Neurological', swatch: 'neuro', categories: ['neurological'] },
  { id: 'other', label: 'Other', swatch: 'other', categories: ['other'] },
];

const CARDIAC_SUBHEADS: Partial<Record<EmergencyCategory, string>> = {
  'cardiac-ischemia': 'Ischemia & pressure',
  'cardiac-arrhythmia': 'Arrhythmias',
  'cardiac-arrest': 'Cardiac arrest',
};

const criticalProtocols = computed<ReadonlyArray<EmergencyProtocol>>(() =>
  CRITICAL_PROTOCOL_IDS.map((id) => EMERGENCY_PROTOCOLS.find((p) => p.id === id)).filter(
    (p): p is EmergencyProtocol => Boolean(p),
  ),
);

const normalizedQuery = computed(() => debouncedQuery.value.trim().toLowerCase());

function protocolMatches(p: EmergencyProtocol, q: string): boolean {
  if (q === '') return true;
  if (p.name.toLowerCase().includes(q)) return true;
  if (p.summary.toLowerCase().includes(q)) return true;
  for (const sign of p.signs) {
    if (sign.toLowerCase().includes(q)) return true;
  }
  for (const step of p.steps) {
    if (step.drug && step.drug.name.toLowerCase().includes(q)) return true;
  }
  return false;
}

const filtered = computed<ReadonlyArray<EmergencyProtocol>>(() => {
  const q = normalizedQuery.value;
  return EMERGENCY_PROTOCOLS.filter((p) => protocolMatches(p, q));
});

const grouped = computed(() => {
  return GROUPS.map((group) => {
    const protocols = filtered.value.filter((p) => group.categories.includes(p.category));
    return { ...group, protocols };
  });
});

const isSearching = computed(() => normalizedQuery.value !== '');

function open(id: string) {
  void router.push(`/quick-reference/${id}`);
}

function clearSearch() {
  // Skip the debounce delay — clear should feel instant.
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  query.value = '';
  debouncedQuery.value = '';
}

/**
 * Autofocus the search input when the user lands here via the sticky bar's
 * Emergency button. The button pushes `?focus=search`; we consume the flag
 * and `router.replace` it away so a refresh doesn't keep stealing focus.
 * Direct navigation (nav drawer, deep link) leaves the input unfocused so
 * a visual scan of the category cards comes first.
 */
onMounted(() => {
  if (route.query.focus === 'search') {
    searchInputRef.value?.focus();
    void router.replace({ path: route.path, query: {} });
  }
});
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Quick Reference</p>
      <h1 class="title-display">Emergency Protocols</h1>
    </header>

    <!-- IV Drug Reference — collapsible pills showing draw-up chart per drug. -->

    <UiCard class="drug-ref-card">
      <header class="drug-ref-head">
        <p class="heading">IV Drug Reference</p>
        <span class="drug-ref-count">{{ drugRefs.length }}</span>
      </header>
      <UiStack :gap="1">
        <div
          v-for="ref in drugRefs"
          :key="ref.seed.id"
          class="drug-pill-wrap"
          :class="{ 'is-open': expandedDrugId === ref.seed.id }"
        >
          <button
            type="button"
            class="drug-pill"
            :class="`drug-pill--${ref.seed.id}`"
            :aria-expanded="expandedDrugId === ref.seed.id"
            @click="toggleDrug(ref.seed.id)"
          >
            <span
              class="drug-swatch"
              :style="{ background: ref.drug.color ?? '#94a3b8' }"
              aria-hidden="true"
            />
            <span class="drug-pill-info">
              <span class="drug-pill-name">{{ ref.drug.name }}</span>
              <span class="drug-pill-meta">
                {{ ref.drug.concentration.value }} {{ ref.drug.concentration.unit }} ·
                {{ ref.seed.syringeMl }} cc syringe ·
                <span :style="{ color: ref.seed.tapeColor ?? '#cbd5e1' }">{{
                  ref.seed.tapeLabel
                }}</span>
                tape
              </span>
            </span>
            <span class="drug-pill-chevron" aria-hidden="true">
              {{ expandedDrugId === ref.seed.id ? '▾' : '▸' }}
            </span>
          </button>

          <div v-if="expandedDrugId === ref.seed.id" class="drug-pill-detail">
            <UiSyringe
              :label="ref.drug.shortName"
              :capacity-ml="ref.seed.syringeMl"
              :drawn-ml="ref.drawnMl"
              :color="ref.drug.color ?? '#94a3b8'"
              :concentration="`${ref.drug.concentration.value} ${ref.drug.concentration.unit}`"
              :caption="`${ref.rows[0]?.doseLabel ?? ''} · ${ref.rows[0]?.ml.toFixed(1) ?? ''} mL`"
              compact
            />
            <div class="drug-dose-list">
              <div v-for="(row, i) in ref.rows" :key="i" class="drug-dose-row">
                <span class="drug-dose-amt" :style="{ color: ref.drug.color }">
                  {{ row.doseLabel }}
                </span>
                <span class="drug-dose-vol">{{ row.ml.toFixed(1) }} mL</span>
              </div>
            </div>
            <p class="drug-dose-note">{{ ref.seed.note }}</p>
            <p v-if="ref.seed.warning" class="drug-dose-warn">⚠ {{ ref.seed.warning }}</p>
          </div>
        </div>
      </UiStack>
    </UiCard>

    <!-- Critical shortcuts: 6 chips in one wrap row, big tap targets. -->

    <section class="shortcuts">
      <p class="caption">Critical</p>
      <div class="shortcut-row">
        <button
          v-for="proto in criticalProtocols"
          :key="proto.id"
          type="button"
          class="shortcut"
          :class="`shortcut--${proto.category}`"
          @click="open(proto.id)"
        >
          <span class="shortcut-name">{{ proto.name }}</span>
          <span class="shortcut-summary">{{ proto.summary }}</span>
        </button>
      </div>
    </section>

    <!-- Search across protocol name, signs, drug names. -->

    <section class="search">
      <UiTextInput
        ref="searchInputRef"
        v-model="query"
        type="search"
        inputmode="search"
        leading-icon="🔍"
        placeholder="Search — signs, drug, protocol name…"
        block
      />
      <button v-if="isSearching" type="button" class="search-clear" @click="clearSearch">
        Clear search
      </button>
    </section>

    <UiBanner v-if="isSearching && filtered.length === 0" tone="info" icon="🔍">
      No protocols match <strong>“{{ query }}”</strong>. Try a shorter keyword or browse the
      categories below.
    </UiBanner>

    <!-- Category cards — each expanded when searching, otherwise tap to focus. -->

    <UiCard
      v-for="group in grouped"
      :key="group.id"
      :class="`category-card category-card--${group.swatch}`"
    >
      <header class="category-head">
        <span
          class="category-swatch"
          :class="`category-swatch--${group.swatch}`"
          aria-hidden="true"
        />
        <p class="heading category-title">{{ group.label }}</p>
        <span class="category-count">{{ group.protocols.length }}</span>
      </header>

      <p v-if="group.protocols.length === 0" class="body muted empty">
        <template v-if="isSearching">No matches in this category.</template>
        <template v-else>No protocols.</template>
      </p>

      <template v-else>
        <!-- Cardiac gets sub-headings to keep its 14 protocols scannable. -->
        <template v-if="group.id === 'cardiac' && !isSearching">
          <template v-for="sub in group.categories" :key="sub">
            <p v-if="CARDIAC_SUBHEADS[sub]" class="subhead">{{ CARDIAC_SUBHEADS[sub] }}</p>
            <UiStack :gap="1">
              <button
                v-for="proto in group.protocols.filter((p) => p.category === sub)"
                :key="proto.id"
                type="button"
                class="row"
                @click="open(proto.id)"
              >
                <span class="row-name">{{ proto.name }}</span>
                <span class="row-summary">{{ proto.summary }}</span>
                <span class="row-chevron" aria-hidden="true">›</span>
              </button>
            </UiStack>
          </template>
        </template>

        <UiStack v-else :gap="1">
          <button
            v-for="proto in group.protocols"
            :key="proto.id"
            type="button"
            class="row"
            @click="open(proto.id)"
          >
            <span class="row-name">{{ proto.name }}</span>
            <span class="row-summary">{{ proto.summary }}</span>
            <span class="row-chevron" aria-hidden="true">›</span>
          </button>
        </UiStack>
      </template>
    </UiCard>
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
/* ----------------- IV drug reference -------------------------------- */
.drug-ref-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.drug-ref-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.drug-ref-count {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-left: auto;
}
.drug-pill-wrap {
  border-radius: var(--r-md);
  overflow: hidden;
}
.drug-pill-wrap.is-open {
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
}
.drug-pill {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.drug-pill:active {
  background: var(--color-surface);
}
.drug-pill-wrap.is-open .drug-pill {
  border: none;
}
.drug-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 28px;
  border-radius: 2px;
}
.drug-pill-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.drug-pill-name {
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
.drug-pill-meta {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
}
.drug-pill-chevron {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--color-text-disabled);
  font-family: var(--font-mono);
}
.drug-pill-detail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: 0 12px 12px;
}
.drug-dose-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drug-dose-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-surface-subtle);
  border-radius: var(--r-sm);
  font-family: var(--font-mono);
}
.drug-dose-amt {
  font-weight: var(--weight-bold);
  letter-spacing: 0.3px;
}
.drug-dose-vol {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.drug-dose-note {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
  line-height: 1.45;
  margin: 0;
}
.drug-dose-warn {
  font-size: var(--type-footnote);
  color: var(--color-warn);
  background: var(--color-warn-soft);
  border: 1px solid var(--color-warn);
  border-radius: var(--r-sm);
  padding: 6px 10px;
  margin: 0;
}

/* ----------------- Critical shortcut row ---------------------------- */
.shortcuts {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.shortcut-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
}
.shortcut {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--sp-3) var(--sp-3) var(--sp-3) calc(var(--sp-3) + 4px);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left-width: 4px;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.shortcut:active {
  transform: scale(0.98);
  background: var(--color-surface-elevated);
}
.shortcut-name {
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
.shortcut-summary {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.1px;
  line-height: 1.35;
}

/* Per-category border-left + soft tint */
.shortcut--airway {
  border-left-color: #38bdf8;
}
.shortcut--cardiac-ischemia,
.shortcut--cardiac-arrhythmia,
.shortcut--cardiac-arrest {
  border-left-color: var(--color-danger);
}
.shortcut--cardiac-arrest {
  background: var(--color-crisis-soft);
}
.shortcut--allergic {
  border-left-color: var(--color-purple);
}
.shortcut--neurological {
  border-left-color: var(--color-warn);
}
.shortcut--other {
  border-left-color: var(--color-slate);
}

/* ----------------- Search ------------------------------------------- */
.search {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.search-clear {
  align-self: flex-end;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* ----------------- Category cards ----------------------------------- */
.category-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.category-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.category-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.category-swatch--airway {
  background: #38bdf8;
}
.category-swatch--cardiac {
  background: var(--color-danger);
}
.category-swatch--allergic {
  background: var(--color-purple);
}
.category-swatch--neuro {
  background: var(--color-warn);
}
.category-swatch--other {
  background: var(--color-slate);
}
.category-title {
  flex: 1;
  margin: 0;
}
.category-count {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.subhead {
  margin: var(--sp-2) 0 4px;
  font-size: var(--type-caption);
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text-disabled);
  font-weight: var(--weight-bold);
}

.row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.row:active {
  background: var(--color-surface);
}
.row-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  padding-right: 24px;
}
.row-summary {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  line-height: 1.4;
  padding-right: 24px;
}
.row-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--color-text-disabled);
}
.empty {
  font-size: var(--type-footnote);
  font-style: italic;
}
</style>
