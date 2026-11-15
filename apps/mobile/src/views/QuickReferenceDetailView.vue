<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  EMERGENCY_PROTOCOLS,
  PROTOCOLS_REVIEWED,
  emergencySyringeTint,
  findProtocol,
  type EmergencyDrugCallout,
  type EmergencyProtocol,
  type ProtocolStep,
  type Severity,
} from '@sedation-pro/clinical';
import {
  UiBanner,
  UiButton,
  UiCard,
  UiDrugButton,
  UiListRow,
  UiPillButton,
  UiStatusPill,
  UiSyringe,
} from '@sedation-pro/ui';

import ProtocolFigure from '@/components/ProtocolFigure.vue';
import {
  doseRows,
  HELP_STAMPS,
  logPills,
  pillsCoverTable,
  REPEATABLE_STAMPS,
  reversalsFor,
  stepStamps,
  type DoseRow,
  type LogPill,
  type ReversalPill,
  type TimeStamp,
} from '@/composables/emergencyLog';
import { useEmergencyLog, useLoggingGate } from '@/composables/useEmergencyLog';
import { useInventoryStatus, type ClassifiedItem } from '@/composables/useInventoryStatus';
import {
  emergencySyringe,
  parseVolumeMl,
  syringeConfig,
  type SyringeDrawing,
} from '@/composables/useSyringeConfig';
import { CATEGORY_LABEL, swatchFor } from '@/data/protocolCategories';
import { protocolShortName } from '@/data/protocolNames';
import { protocolTitleHidden } from '@/composables/protocolTitle';
import {
  awaitingDate,
  courseLine,
  exceptionPill,
  formatExpiry,
} from '@/composables/inventoryLabels';
import { CASE_PHASE_ROUTE, CASE_PHASE_SHORT, useSessionStore } from '@/stores/session';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();
const route = useRoute();

const protocol = computed<EmergencyProtocol | undefined>(() => findProtocol(props.id));
const related = computed<ReadonlyArray<EmergencyProtocol>>(() =>
  (protocol.value?.relatedProtocols ?? [])
    .map((id) => EMERGENCY_PROTOCOLS.find((p) => p.id === id))
    .filter((p): p is EmergencyProtocol => Boolean(p)),
);

// -------- Navigation ------------------------------------------------------------
/**
 * Back returns wherever the protocol was opened from (the list, another
 * protocol, the inventory); a deep link with no in-app history treats it as
 * the list. `history.state` is not reactive, so the route path is read to
 * recompute when a related link reuses this component.
 */
const hasHistory = computed<boolean>(() => {
  void route.fullPath;
  const prev =
    typeof window !== 'undefined'
      ? (router.options.history.state?.back as string | null | undefined)
      : null;
  return typeof prev === 'string';
});
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
const session = useSessionStore();
const backToCaseLabel = computed(() => `Back to case · ${CASE_PHASE_SHORT[session.lastCasePhase]}`);
function goCase() {
  void router.push(CASE_PHASE_ROUTE[session.lastCasePhase]);
}
function open(id: string) {
  void router.push(`/quick-reference/${id}`);
}

// -------- Call 911 ----------------------------------------------------------------
// Any protocol whose steps say to call 911 gets the red card: large enough to
// read aloud across the room, and a tel: link where the device can dial.
const call911 = computed(() => protocol.value?.steps.some((s) => /911/.test(s.text)) ?? false);

// -------- Stock, shown by exception -----------------------------------------------
/**
 * The inventory answers "can I grab one in date right now?". The page says
 * so only when the answer is no or not for long: an "In stock" on every box
 * was noise. Reorder pressure lives on the inventory screen.
 */
const inventory = useInventoryStatus();
type Issue = { readonly severity: Severity | 'empty'; readonly label: string };
function stockIssue(name: string): Issue | null {
  const severity = inventory.statusFor(name);
  if (severity === 'caution') return { severity, label: 'Expiring' };
  if (severity === 'limit') return { severity, label: 'Expired' };
  return null;
}
/** One course of a tracked drug, in the Inventory's words, only when the in-date stock cannot finish it. */
function courseShort(name: string): string | null {
  const course = inventory.courses.find((c) => c.drug === name);
  return course?.short ? courseLine(course) : null;
}

/** The devices this protocol depends on (LMA sizes, King, NPAs), linked by id. */
const kit = computed(() => (protocol.value ? inventory.equipmentFor(protocol.value.id) : []));
const kitIssues = computed(() =>
  kit.value.filter((c) => exceptionPill(c) !== null && !awaitingDate(c)),
);
const kitUndated = computed(() => kit.value.filter(awaitingDate).length);
const kitTone = computed(() => {
  if (kitIssues.value.some((c) => exceptionPill(c)?.severity !== 'caution')) return 'danger';
  if (kitIssues.value.length > 0) return 'warn';
  return kitUndated.value > 0 ? 'muted' : 'good';
});
const kitToggled = ref<boolean | null>(null);
// Related links reuse this page: a list opened by hand on one protocol must
// not stay open, or stay shut over an expired item, on the next.
watch(
  () => props.id,
  () => {
    kitToggled.value = null;
  },
);
/** Closed when everything is in date; open by itself when something is not. */
const kitOpen = computed(() => kitToggled.value ?? kitIssues.value.length > 0);
const kitSummary = computed(() => {
  const n = kit.value.length;
  const bad = kitIssues.value.length;
  const none = kitUndated.value;
  if (bad > 0) return `${bad} to check`;
  if (none > 0) return `${none} with no date`;
  return n === 1 ? 'In date' : 'All in date';
});
function kitDesc(c: ClassifiedItem): string {
  return c.item.noExpiry || awaitingDate(c)
    ? c.item.description
    : `${c.item.description} · Exp ${formatExpiry(c.item.expiresOn)}`;
}

// -------- Drug boxes ------------------------------------------------------------------
const NEUTRAL_TINT = 'var(--color-slate)';

interface MixStep {
  readonly text: string;
  readonly key: boolean;
}
/** A number and its unit, set apart for display only ("0.3" and "mg"). */
interface Amount {
  readonly num: string;
  readonly unit: string;
}
/** Pills of one route (and second doses), on a row of their own: an IM dose must not pass for IV. */
interface RouteGroup<T> {
  readonly route: string;
  readonly pills: ReadonlyArray<T>;
}
/** Everything one drug box shows, worked out once per page. */
interface DrugBox {
  readonly drug: EmergencyDrugCallout;
  /** The drug's syringe colour, the one its drawing and its pills carry. */
  readonly tint: string;
  /** Route, strength and what it is given from, on one quiet line under the name. */
  readonly sub: string;
  readonly dose: Amount;
  /** What the hands draw, beside the dose, whenever it is one plain volume. */
  readonly volume: { readonly verb: 'Draw' | 'Give'; readonly amount: Amount } | null;
  readonly issue: Issue | null;
  readonly mix: { readonly head: string; readonly steps: ReadonlyArray<MixStep> } | null;
  readonly rows: ReadonlyArray<DoseRow>;
  /** With logging on the pills say what the rows say, so the rows step aside. */
  readonly coverRows: boolean;
  readonly short: string | null;
  readonly syringe: SyringeDrawing | null;
  readonly autoInjector: boolean;
  readonly pillGroups: ReadonlyArray<RouteGroup<LogPill>>;
}
interface StepView {
  readonly step: ProtocolStep;
  /** CPR and shocks; the 911 times live on the Call 911 card. */
  readonly stamps: ReadonlyArray<TimeStamp>;
  readonly reversalGroups: ReadonlyArray<RouteGroup<ReversalPill>>;
  readonly box: DrugBox | null;
}

function amount(text: string): Amount {
  // Only a unit word is set apart: "2 × 3.0 ml" stays one figure.
  const m = /^([\d.]+(?:-[\d.]+)?) ([A-Za-z].*)$/.exec(text);
  return m ? { num: m[1]!, unit: m[2]! } : { num: text, unit: '' };
}
function byRoute<T extends { readonly route: string; readonly secondDose?: true }>(
  pills: ReadonlyArray<T>,
): ReadonlyArray<RouteGroup<T>> {
  // A second dose derived from the first sits on a row of its own, under it.
  const rowOf = (p: T) => (p.secondDose ? `${p.route} 2nd` : p.route);
  const rows = [...new Set(pills.map(rowOf))];
  return rows.map((route) => ({ route, pills: pills.filter((p) => rowOf(p) === route) }));
}
const PLAIN_VOLUME = /^[\d.]+(?:-[\d.]+)? ml$/;

/**
 * MIX FIRST recipes are "<header>; step; step; ...". The header is printed
 * as written. The waste-down step is the one that turns a 10× mix into a
 * dose, so it is set apart: missing it means pushing ten times the dose.
 */
function mixOf(mix: string | undefined): DrugBox['mix'] {
  if (mix === undefined) return null;
  const [head = mix, ...rest] = mix.split('; ');
  return { head, steps: rest.map((text) => ({ text, key: /^WASTE DOWN/.test(text) })) };
}
function subLine(drug: EmergencyDrugCallout): string {
  const parts: string[] = [drug.route];
  if (drug.concentration) parts.push(drug.concentration);
  if (drug.device === 'prefilled-syringe') parts.push('prefilled syringe');
  else if (drug.device === 'auto-injector') parts.push('auto-injector');
  else if (drug.syringeMl !== undefined) parts.push(`${drug.syringeMl} ml syringe`);
  return parts.join(' · ');
}
/**
 * The syringe drawing for a callout: the sedation-tray drugs with a single
 * draw volume, plus every emergency drug `emergencySyringe` has a colour and
 * a volume for; otherwise none.
 */
function syringeFor(drug: EmergencyDrugCallout): SyringeDrawing | null {
  const emergency = emergencySyringe(drug);
  if (emergency !== null) return emergency;
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
    caption: `Draw ${drug.volume ?? ''}`,
  };
}
function boxFor(step: ProtocolStep, drug: EmergencyDrugCallout): DrugBox {
  const autoInjector = drug.device === 'auto-injector';
  const plain = drug.volume !== undefined && PLAIN_VOLUME.test(drug.volume) ? drug.volume : null;
  const short = courseShort(drug.name);
  return {
    drug,
    tint:
      syringeConfig(drug.name)?.color ??
      emergencySyringeTint(drug.name, drug.mixFirst !== undefined) ??
      NEUTRAL_TINT,
    sub: subLine(drug),
    dose: amount(drug.dose),
    volume:
      plain === null
        ? null
        : { verb: drug.device === 'prefilled-syringe' ? 'Give' : 'Draw', amount: amount(plain) },
    // A course the in-date stock cannot finish outranks a date: it is the one
    // that runs out mid-rescue.
    issue: short !== null ? { severity: 'limit', label: 'Short' } : stockIssue(drug.name),
    mix: mixOf(drug.mixFirst),
    // A single dose whose volume sits beside it needs no row of its own.
    rows: drug.drawTable || plain === null ? doseRows(drug) : [],
    coverRows: pillsCoverTable(step),
    short,
    syringe: autoInjector ? null : syringeFor(drug),
    autoInjector,
    pillGroups: byRoute(logPills(drug, step.text)),
  };
}
const stepViews = computed<ReadonlyArray<StepView>>(() => {
  const steps = protocol.value?.steps ?? [];
  const stamps = stepStamps(steps);
  return steps.map((step, i) => ({
    step,
    stamps: (stamps.get(i) ?? []).filter((s) => !HELP_STAMPS.includes(s)),
    reversalGroups: byRoute(reversalsFor(step)),
    box: step.drug ? boxFor(step, step.drug) : null,
  }));
});

// -------- Logging --------------------------------------------------------------------
/**
 * Logging from the page: a pill per dose in each drug box, a time stamp on
 * the step that names the event, and the 911 times on the Call 911 card.
 * Off until Phase 1 is complete or the clinician unlocks it, so the page
 * reads the same as ever for reference and teaching.
 */
const rescue = useEmergencyLog();
const gate = useLoggingGate();
const logging = computed(() => gate.state.value === 'on');
/** Does this page have anything to log? The logging row shows only where it does. */
const loggable = computed(
  () =>
    call911.value ||
    stepViews.value.some(
      (v) =>
        v.stamps.length > 0 || v.reversalGroups.length > 0 || (v.box?.pillGroups.length ?? 0) > 0,
    ),
);
const ownerCase = computed(() =>
  gate.owner.value === null ? 'a new case on this tablet' : `${gate.owner.value}'s case`,
);
/** Why logging is off, said before the tap, with whose case it would go to. */
const gateReason = computed(() => {
  if (gate.state.value === 'finished') {
    return `${gate.owner.value ?? 'The case'}'s case is released. Start a new case to log doses and times here.`;
  }
  return gate.owner.value !== null
    ? `Phase 1 is not complete. Unlock to log doses and times to ${ownerCase.value}.`
    : `No case is open. Unlock to log doses and times to ${ownerCase.value}.`;
});
/** A stamp that happens once locks when logged; a shock can be logged again. */
function stampState(stamp: TimeStamp): 'idle' | 'logged' {
  return !REPEATABLE_STAMPS.has(stamp) && rescue.stamped(stamp) !== undefined ? 'logged' : 'idle';
}

function showRows(box: DrugBox): boolean {
  return box.rows.length > 0 && !(logging.value && box.coverRows);
}
/** Anything to show beside the drawing; with nothing, the drawing takes the row. */
function hasText(box: DrugBox): boolean {
  return showRows(box) || Boolean(box.drug.notes);
}
/**
 * Only a syringe sits beside the text. The auto-injector drawing keeps its
 * own width under it: squeezed into a column its labels shrink past reading.
 */
function besideText(box: DrugBox): boolean {
  return box.syringe !== null && hasText(box);
}

// -------- Top bar ----------------------------------------------------------------
/**
 * Like an iOS large title: the bar names the protocol only once the page's
 * own title has gone under it, so the two never say the same thing at once.
 */
const titleEl = ref<HTMLElement | null>(null);
let titleWatch: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || titleEl.value === null) return;
  // The line the title passes under: the foot of the top bar.
  const bar = document.querySelector('.sticky-bar')?.getBoundingClientRect().bottom ?? 64;
  titleWatch = new IntersectionObserver(
    ([entry]) => {
      if (entry === undefined) return;
      // Out of sight above that line, not below the screen.
      const line = entry.rootBounds?.top ?? bar;
      protocolTitleHidden.value = !entry.isIntersecting && entry.boundingClientRect.top < line;
    },
    { rootMargin: `-${Math.round(bar)}px 0px 0px 0px`, threshold: 0 },
  );
  titleWatch.observe(titleEl.value);
});
onBeforeUnmount(() => {
  titleWatch?.disconnect();
  protocolTitleHidden.value = false;
});
function stepClass(step: ProtocolStep): string {
  if (step.severity === 'critical') return 'step--critical';
  if (step.severity === 'final') return 'step--final';
  return '';
}
</script>

<template>
  <main class="page">
    <nav class="toolbar" aria-label="Protocol navigation">
      <UiButton tone="nav" compact @click="goBack">‹ Back</UiButton>
      <UiButton tone="key" compact class="toolbar-case" @click="goCase">{{
        backToCaseLabel
      }}</UiButton>
      <UiButton tone="nav" compact @click="goList">All protocols</UiButton>
    </nav>

    <template v-if="protocol">
      <header class="hero" :class="`cat-${swatchFor(protocol.category)}`">
        <p class="hero-cat">
          <span class="dot dot--cat" aria-hidden="true" />
          <span class="caption">{{ CATEGORY_LABEL[protocol.category] }}</span>
        </p>
        <h1 ref="titleEl" class="title-display">{{ protocol.name }}</h1>
        <p class="hero-summary">{{ protocol.summary }}</p>
        <!-- Plain text: a sign is something to look for, not something to tap. -->
        <p v-if="protocol.signs.length > 0" class="signs">
          <span class="caption signs-label">Signs</span>{{ protocol.signs.join(' · ') }}
        </p>
      </header>

      <section
        v-if="call911"
        class="help"
        :class="{ 'help--platter': logging }"
        aria-label="Call 911"
      >
        <a class="call-911" href="tel:911">
          <span class="call-911-main"
            ><svg class="call-911-glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
              /></svg
            >CALL 911</span
          >
          <span class="call-911-sub"
            >Say the address, the emergency, and that a patient is sedated</span
          >
        </a>
        <div v-if="logging" class="drug-grid log-pills log-stamps">
          <UiDrugButton
            v-for="stamp in HELP_STAMPS"
            :key="stamp"
            tone="zofran"
            :tint="NEUTRAL_TINT"
            name="Time stamp"
            :dose="stamp"
            :state="stampState(stamp)"
            :logged-at="rescue.stamped(stamp)"
            @click="rescue.stamp(stamp)"
          />
        </div>
      </section>

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

      <UiCard v-if="kit.length > 0" class="kit-card">
        <UiListRow
          interactive
          :disclosure="kitOpen ? 'open' : 'closed'"
          class="kit-head"
          @click="kitToggled = !kitOpen"
        >
          <template #leading><span class="dot" :class="`dot--${kitTone}`" /></template>
          <span class="heading kit-title">Equipment</span>
          <span class="kit-summary">{{ kitSummary }}</span>
          <template #trailing
            ><span class="card-count">{{ kit.length }}</span></template
          >
        </UiListRow>
        <div v-if="kitOpen" class="list">
          <UiListRow v-for="c in kit" :key="c.item.id" :inset="22" class="kit-row">
            <template #leading><span class="dot dot--none" /></template>
            <span class="row-title">{{ c.item.drug }}</span>
            <span class="row-sub">{{ kitDesc(c) }}</span>
            <template v-if="exceptionPill(c)" #trailing>
              <UiStatusPill :severity="exceptionPill(c)!.severity">{{
                exceptionPill(c)!.label
              }}</UiStatusPill>
            </template>
          </UiListRow>
        </div>
      </UiCard>

      <UiCard class="steps-card">
        <!-- The logging state is the header's subtitle, and Unlock its one
             action, where iOS puts Edit: step 1 stays near the top. -->
        <header class="card-head steps-head">
          <div class="card-head-text">
            <p class="heading">Steps</p>
            <span v-if="loggable && logging" class="card-sub log-status">
              <span class="dot dot--good dot--small" aria-hidden="true" />
              Logging to {{ ownerCase }}
            </span>
            <span v-else-if="loggable" class="card-sub log-gate">
              <svg class="log-gate-glyph" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z"
                />
              </svg>
              <span><strong class="log-gate-title">Logging is off.</strong> {{ gateReason }}</span>
            </span>
          </div>
          <UiPillButton
            v-if="loggable && gate.state.value === 'locked'"
            class="log-unlock"
            @click="gate.unlock()"
            >Unlock</UiPillButton
          >
          <span v-else class="card-count">{{ protocol.steps.length }}</span>
        </header>

        <ol class="steps">
          <li
            v-for="(view, index) in stepViews"
            :key="index"
            class="step"
            :class="stepClass(view.step)"
          >
            <span class="step-node">{{ index + 1 }}</span>
            <div class="step-body">
              <p class="step-text">{{ view.step.text }}</p>

              <ProtocolFigure v-if="view.step.figure" :kind="view.step.figure" />

              <div v-if="logging && view.stamps.length > 0" class="drug-grid log-pills log-stamps">
                <UiDrugButton
                  v-for="stamp in view.stamps"
                  :key="stamp"
                  tone="zofran"
                  :tint="NEUTRAL_TINT"
                  name="Time stamp"
                  :dose="stamp"
                  :state="stampState(stamp)"
                  :logged-at="rescue.stamped(stamp)"
                  :last-at="rescue.stamped(stamp)"
                  @click="rescue.stamp(stamp)"
                />
              </div>

              <div v-if="logging && !view.box && view.reversalGroups.length > 0" class="log-groups">
                <div v-for="g in view.reversalGroups" :key="g.route" class="drug-grid log-pills">
                  <UiDrugButton
                    v-for="pill in g.pills"
                    :key="pill.key"
                    :tone="pill.drug"
                    :name="pill.name"
                    :dose="`${pill.dose} ${pill.route}`"
                    :sub="pill.sub"
                    :last-at="rescue.lastReversal(pill)"
                    @click="rescue.reverse(pill)"
                  />
                </div>
              </div>

              <div v-if="view.step.goTo && view.step.goTo.length > 0" class="step-links">
                <UiPillButton
                  v-for="id in view.step.goTo"
                  :key="id"
                  class="step-link"
                  @click="open(id)"
                  >Go to {{ protocolShortName(id) }} ›</UiPillButton
                >
              </div>

              <section v-if="view.box" class="drug-callout">
                <header class="drug-head">
                  <span
                    class="drug-swatch"
                    :style="{ background: view.box.tint }"
                    aria-hidden="true"
                  />
                  <span class="drug-name"
                    ><span class="drug-name-text">{{ view.box.drug.name }}</span>
                    <UiStatusPill v-if="view.box.issue" :severity="view.box.issue.severity">{{
                      view.box.issue.label
                    }}</UiStatusPill></span
                  >
                  <span class="drug-sub">{{ view.box.sub }}</span>
                  <span class="drug-fig">
                    <span class="drug-dose" :aria-label="view.box.drug.dose"
                      ><span class="num">{{ view.box.dose.num }}</span
                      ><span v-if="view.box.dose.unit" class="unit">{{
                        ` ${view.box.dose.unit}`
                      }}</span></span
                    >
                    <span v-if="view.box.volume" class="drug-volume"
                      ><span class="verb">{{ `${view.box.volume.verb} ` }}</span
                      ><span class="num">{{ view.box.volume.amount.num }}</span
                      ><span class="unit">{{ ` ${view.box.volume.amount.unit}` }}</span></span
                    >
                  </span>
                </header>

                <p v-if="view.box.short" class="drug-short">{{ view.box.short }}</p>

                <UiBanner
                  v-if="view.box.mix"
                  tone="caution"
                  icon="⚠"
                  compact
                  :title="view.box.mix.head"
                  class="drug-mix"
                >
                  <ol class="drug-mix-steps">
                    <li v-for="(seg, i) in view.box.mix.steps" :key="i">
                      <strong v-if="seg.key" class="drug-mix-key">{{ seg.text }}</strong>
                      <template v-else>{{ seg.text }}</template>
                    </li>
                  </ol>
                </UiBanner>

                <div
                  v-if="hasText(view.box) || view.box.syringe || view.box.autoInjector"
                  class="drug-body"
                  :class="{ 'has-media': besideText(view.box) }"
                >
                  <div v-if="hasText(view.box)" class="drug-text">
                    <div v-if="showRows(view.box)" class="list drug-rows">
                      <UiListRow v-for="row in view.box.rows" :key="row.label" class="drug-row">
                        <span class="drug-row-label">{{ row.label }}</span>
                        <template #trailing>
                          <span class="drug-row-value"
                            ><span class="num">{{ amount(row.value).num }}</span
                            ><span v-if="amount(row.value).unit" class="unit">{{
                              ` ${amount(row.value).unit}`
                            }}</span></span
                          >
                        </template>
                      </UiListRow>
                    </div>
                    <p v-if="view.box.drug.notes" class="drug-notes">{{ view.box.drug.notes }}</p>
                  </div>
                  <div v-if="view.box.autoInjector" class="drug-figure">
                    <ProtocolFigure kind="auto-injector" />
                  </div>
                  <div v-else-if="view.box.syringe" class="drug-media">
                    <UiSyringe
                      compact
                      bare
                      :label="view.box.drug.name"
                      :capacity-ml="view.box.syringe.capacityMl"
                      :drawn-ml="view.box.syringe.drawnMl"
                      :color="view.box.syringe.color"
                      :caption="view.box.syringe.caption"
                    />
                  </div>
                </div>

                <div
                  v-if="
                    logging && (view.box.pillGroups.length > 0 || view.reversalGroups.length > 0)
                  "
                  class="log-groups"
                >
                  <div v-for="g in view.reversalGroups" :key="g.route" class="drug-grid log-pills">
                    <UiDrugButton
                      v-for="pill in g.pills"
                      :key="pill.key"
                      :tone="pill.drug"
                      :name="pill.name"
                      :dose="`${pill.dose} ${pill.route}`"
                      :sub="pill.sub"
                      :last-at="rescue.lastReversal(pill)"
                      @click="rescue.reverse(pill)"
                    />
                  </div>
                  <div v-for="g in view.box.pillGroups" :key="g.route" class="drug-grid log-pills">
                    <UiDrugButton
                      v-for="pill in g.pills"
                      :key="pill.key"
                      tone="zofran"
                      :tint="view.box.tint"
                      :name="view.box.drug.name"
                      :dose="`${pill.dose} ${pill.route}`"
                      :sub="pill.sub || undefined"
                      :last-at="rescue.lastGiven(view.box.drug, pill)"
                      @click="rescue.give(view.box.drug, pill)"
                    />
                  </div>
                </div>
              </section>
            </div>
          </li>
        </ol>
        <!-- The same EMS arrived stamp as on the Call 911 card, again where a
             long page ends, so a handover never means scrolling back up
             (owner, Nov 2026). One stamp: either copy logs it, both show it. -->
        <div v-if="logging && call911" class="steps-end">
          <span class="steps-end-node" aria-hidden="true" />
          <div class="drug-grid log-pills log-stamps">
            <UiDrugButton
              tone="zofran"
              :tint="NEUTRAL_TINT"
              name="Time stamp"
              dose="EMS arrived"
              :state="stampState('EMS arrived')"
              :logged-at="rescue.stamped('EMS arrived')"
              @click="rescue.stamp('EMS arrived')"
            />
          </div>
        </div>
      </UiCard>

      <p class="footnote reviewed">{{ PROTOCOLS_REVIEWED }}</p>

      <UiCard v-if="related.length > 0" class="related-card">
        <header class="card-head">
          <p class="heading">Related</p>
          <span class="card-count">{{ related.length }}</span>
        </header>
        <div class="list">
          <UiListRow
            v-for="rel in related"
            :key="rel.id"
            interactive
            chevron
            :inset="22"
            class="related-row"
            :class="`cat-${swatchFor(rel.category)}`"
            @click="open(rel.id)"
          >
            <template #leading><span class="dot dot--cat" /></template>
            <span class="row-title">{{ rel.name }}</span>
            <span class="row-sub">{{ rel.summary }}</span>
          </UiListRow>
        </div>
      </UiCard>
    </template>

    <UiBanner v-else tone="info" icon="🔍" title="Protocol not found">
      No protocol matches <strong>“{{ props.id }}”</strong>. Tap back to browse the library.
    </UiBanner>
  </main>
</template>

<style scoped>
/* Same frame as every other screen: 760 px column, 16 px gutters, cards 16 px apart. */
.page {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}

/* As it has always been, where the thumb expects it: Back, then the white
   pill back to the case filling the middle, then the list. */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.toolbar-case {
  flex: 1;
  min-width: 0;
}

/* Plain hero, like Phase 3 and the protocol list: caption, large title. */
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.hero-cat {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0 0 calc(-1 * var(--sp-1));
}
.hero-summary {
  margin: 0;
  font-size: var(--type-body);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
.signs {
  margin: 0;
  font-size: var(--type-footnote);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
.signs-label {
  margin-right: var(--sp-2);
}

/* Call 911. While logging, the red link and its two times sit on one card,
   like a group of controls: the times belong to the call. */
.help {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.help--platter {
  padding: var(--sp-2);
  border-radius: var(--r-lg);
  background: var(--surface-highlight), var(--color-card-bg);
  box-shadow: var(--shadow-md);
}
.call-911 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 72px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-lg);
  /* Deepens toward the foot so the spoken line under the number keeps its contrast. */
  background:
    var(--surface-highlight), linear-gradient(180deg, var(--color-crisis), var(--color-crisis-deep));
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-150) var(--ease-standard);
}
.help--platter .call-911 {
  border-radius: var(--r-sm);
  box-shadow: none;
}
.call-911:active {
  transform: scale(0.98);
}
.call-911-main {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--type-display);
  font-weight: var(--weight-bold);
  letter-spacing: 0.02em;
  line-height: var(--leading-tight);
}
.call-911-glyph {
  width: 24px;
  height: 24px;
}
.call-911-sub {
  font-size: var(--type-body);
  font-weight: var(--weight-medium);
  text-align: center;
}

.contra-list {
  margin: 0;
  padding-left: var(--sp-5);
}

/* Dots: category, equipment state, logging on. */
.dot {
  display: inline-block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot--small {
  width: 8px;
  height: 8px;
}
.dot--good {
  background: var(--color-good);
}
.dot--warn {
  background: var(--color-warn);
}
.dot--danger {
  background: var(--color-danger);
}
.dot--muted {
  background: var(--color-text-disabled);
}
/* Holds a row's text in line with its header's, which follows a dot. */
.dot--none {
  background: transparent;
}
.dot--cat {
  background: var(--cat);
}
.list {
  display: flex;
  flex-direction: column;
}
.row-title {
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
.row-sub {
  font-size: var(--type-footnote);
  line-height: var(--leading-normal);
  color: var(--color-text-tertiary);
}

/* Card headers, as on the protocol list and the inventory: heading, a
   subtitle, and a count or the card's one action on the right. */
.card-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.card-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.card-head .heading {
  margin: 0;
}
.card-sub {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--type-footnote);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
.log-status {
  align-items: center;
}
.log-gate-glyph {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 3px;
  color: var(--color-text-tertiary);
}
.log-gate-title {
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}

/* Equipment: one quiet row while all is in date; opens by itself when not. */
.kit-card,
.related-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.kit-title {
  margin: 0;
}
.kit-summary {
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}

/* Steps: one card, one line from the first step to the last. */
.steps-card {
  --node: 30px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.steps {
  list-style: none;
  margin: var(--sp-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
.step {
  position: relative;
  display: grid;
  grid-template-columns: var(--node) minmax(0, 1fr);
  column-gap: var(--sp-3);
}
/* The line that joins one step to the next: the page reads as a sequence.
   Strong enough to survive the glare of operatory light on glass. */
.step:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(var(--node) / 2 - 1px);
  top: calc(var(--node) + 3px);
  bottom: calc(-1 * var(--sp-5) + 3px);
  width: 2px;
  border-radius: 1px;
  background: var(--color-border-strong);
}
.step-node {
  position: relative;
  z-index: 1;
  width: var(--node);
  height: var(--node);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
.step--critical .step-node {
  background: var(--color-crisis);
}
/* The last step is an order too (go to the ER, hand over to EMS): only its
   node says it ends the page. */
.step--final .step-node {
  background: transparent;
  box-shadow: inset 0 0 0 2px var(--color-border-strong);
  color: var(--color-text-secondary);
}
.step-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.step-text {
  /* The first line sits on the middle of its number. */
  margin: calc((var(--node) - 1.4em) / 2) 0 0;
  font-size: var(--type-body);
  line-height: var(--leading-normal);
  color: var(--color-text-primary);
}
/* Read at arm's length on the tablet: iOS body size. */
@media (min-width: 600px) {
  .step-text {
    font-size: var(--type-heading);
  }
}
.step--critical .step-text {
  font-weight: var(--weight-semibold);
}
.step-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

/* A drug box: colour bar, name, route and strength, the dose and what to
   draw on the right. Depth comes from the surface, not a border. The bar
   hangs in the padding, so every line in the box starts at one edge. */
.drug-callout {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4) var(--sp-4) calc(var(--sp-4) + var(--sp-1));
  border-radius: var(--r-md);
  background: var(--surface-highlight), var(--color-surface);
}
.drug-head {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto;
  grid-template-areas:
    'sw name fig'
    'sw sub fig';
  column-gap: var(--sp-2);
  row-gap: 2px;
  align-items: center;
  margin-left: calc(-4px - var(--sp-2));
}
.drug-swatch {
  grid-area: sw;
  align-self: stretch;
  width: 4px;
  border-radius: 2px;
}
.drug-name {
  grid-area: name;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--type-heading);
  font-weight: var(--weight-semibold);
}
.drug-sub {
  grid-area: sub;
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}
.drug-fig {
  grid-area: fig;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
/* A number and its unit: the number carries the weight, the unit stays readable. */
.drug-dose,
.drug-volume,
.drug-row-value {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}
.num {
  font-family: var(--font-mono);
  font-weight: var(--weight-bold);
  letter-spacing: -0.5px;
}
.unit {
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  color: var(--color-text-secondary);
}
.drug-dose .num,
.drug-volume .num {
  font-size: var(--type-title);
}
.verb {
  margin-right: var(--sp-1);
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
/* On a phone the dose and the volume take a line of their own under the name. */
@container (max-width: 420px) {
  .drug-head {
    grid-template-columns: 4px minmax(0, 1fr);
    grid-template-areas:
      'sw name'
      'sw sub'
      'sw fig';
  }
  /* On the narrowest phones the volume drops under the dose rather than past the edge. */
  .drug-fig {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--sp-4);
    margin-top: var(--sp-1);
  }
}
/* The Inventory's own line, under the Short pill beside the name. */
.drug-short {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
/* A drawing instruction never fades: the recipe stays in primary text. */
.drug-mix-steps {
  margin: 2px 0 0;
  padding-left: var(--sp-5);
  color: var(--color-text-primary);
}
.drug-mix-key {
  font-weight: var(--weight-bold);
  color: var(--color-warn);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.drug-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--sp-3);
}
/* On the tablet the syringe sits beside what to draw; on a phone, under it. */
@container (min-width: 520px) {
  .drug-body.has-media {
    grid-template-columns: minmax(0, 1fr) 250px;
    align-items: start;
  }
}
.drug-text {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.drug-rows .drug-row {
  align-items: baseline;
}
.drug-row-label {
  font-size: var(--type-body);
  color: var(--color-text-primary);
}
.drug-row-value .num {
  font-size: var(--type-heading);
}
.drug-row-value .unit {
  font-size: var(--type-footnote);
}
.drug-notes {
  margin: 0;
  font-size: var(--type-body);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}

/* The closing row lines up with the steps' text. */
.steps-end {
  display: grid;
  grid-template-columns: var(--node) minmax(0, 1fr);
  column-gap: var(--sp-3);
  margin-top: calc(-1 * var(--sp-1));
}
/* Each route's pills on a row of their own: an IM dose never sits among IV ones. */
.log-groups {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* A group footer, the way iOS sets one under a list: sentence case, quiet. */
.reviewed {
  padding-inline: var(--sp-4);
  margin-top: calc(-1 * var(--sp-2));
  color: var(--color-text-tertiary);
}
</style>
