<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { useAudioStore } from '@/stores/audio';
import { useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useEventLogStore } from '@/stores/event-log';
import { useCaseReset } from '@/composables/useCaseReset';
import { useTheme, type ThemeChoice } from '@/composables/useTheme';
import { UiModal, UiStatusPill } from '@sedation-pro/ui';
import { expiryStatus } from '@sedation-pro/clinical';

import { EMERGENCY_INVENTORY } from '@/data/emergency-inventory';
import { DEFAULT_FORMULARY } from '@sedation-pro/clinical';
import { snapDecision } from './navDrawerSwipe';

interface NavPhaseEntry {
  id: Phase;
  number: number | null;
  title: string;
  sub: string;
  iconTint: string;
  route: string;
  locked: boolean;
}

const router = useRouter();
const session = useSessionStore();
const patient = usePatientStore();
const eventLog = useEventLogStore();

const { drawerOpen, currentPhase } = storeToRefs(session);
const { name: patientName, mrn, age, completeness, isPhase1Complete } = storeToRefs(patient);
const { count: eventCount } = storeToRefs(eventLog);

// Single-source logo (same asset as the favicon / PWA icon). Static here —
// no draw animation; the drawer is opened many times a day and a replaying
// animation would be noise. BASE_URL for subpath/custom-domain safety.
const logoSrc = `${import.meta.env.BASE_URL}logo-source.svg`;
const practiceName = DEFAULT_FORMULARY.practiceName;

const initial = computed(() => {
  const raw = patientName.value.trim();
  if (!raw) return 'PT';
  const parts = raw.split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});

const phaseEntries = computed<NavPhaseEntry[]>(() => {
  const gated = !isPhase1Complete.value;
  return [
    {
      id: 'phase1',
      number: 1,
      title: 'Pre-Sedation Assessment',
      sub: 'Patient info, vitals, history',
      iconTint: 'ph1',
      route: '/phase/1',
      locked: false,
    },
    {
      id: 'phase2',
      number: 2,
      title: 'Oral Sedation',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Pre-op anxiolytic',
      iconTint: 'ph2',
      route: '/phase/2',
      locked: gated,
    },
    {
      id: 'phase3',
      number: 3,
      title: 'IV Sedation & Procedure',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Drug administration',
      iconTint: 'ph3',
      route: '/phase/3',
      locked: gated,
    },
    {
      id: 'phase4',
      number: 4,
      title: 'Recovery & Discharge',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Note, signature, release',
      iconTint: 'ph4',
      route: '/phase/4',
      locked: gated,
    },
  ];
});

const quickRefActive = computed(() => currentPhase.value === 'quickref');

async function go(target: NavPhaseEntry) {
  // Even on locked rows we let `router.push` run — the router's guard rewrites
  // the navigation back to `/phase/1`, fires the "Complete Phase 1 first"
  // toast, and flips `phase1ValidationAttempted` so the offending fields paint
  // red. A silent early-return here was a UX miss: tapping a 🔒 row produced
  // zero feedback.
  await router.push(target.route);
  session.closeDrawer();
}

async function goQuickRef() {
  await router.push('/quick-reference');
  session.closeDrawer();
}

const inventoryActive = computed(() => currentPhase.value === 'inventory');

async function goInventory() {
  await router.push('/inventory');
  session.closeDrawer();
}

/**
 * Live stock summary for the drawer row. Computed at drawer render — the
 * drawer opens fresh each time, so day-granularity staleness is a
 * non-issue. 'limit' covers both expired and unreadable-expiry items.
 */
const inventorySummary = computed(() => {
  const now = Date.now();
  let expired = 0;
  let expiring = 0;
  for (const item of EMERGENCY_INVENTORY) {
    const status = expiryStatus(item.expiresOn, now);
    if (status.severity === 'limit') expired += 1;
    else if (status.severity === 'caution') expiring += 1;
  }
  return { expired, expiring, total: EMERGENCY_INVENTORY.length };
});

const inventorySub = computed(() => {
  const s = inventorySummary.value;
  if (s.expired > 0) return `${s.expired} expired · ${s.expiring} expiring soon`;
  if (s.expiring > 0) return `${s.expiring} expiring within 60 days`;
  return `${s.total} items · all in date`;
});

// -------- Audio mute toggle ----------------------------------------------

const audio = useAudioStore();
const { muted: audioMuted } = storeToRefs(audio);

function toggleMute(): void {
  audioMuted.value = !audioMuted.value;
}

// -------- Theme toggle ----------------------------------------------------
//
// Cycle through auto → light → dark → auto so a single button can express
// "follow system" + the two explicit overrides without taking up nav space.

const { choice: themeChoice } = useTheme();

const themeMeta: Record<ThemeChoice, { icon: string; label: string }> = {
  auto: { icon: '🌗', label: 'Theme · Auto' },
  light: { icon: '☀️', label: 'Theme · Light' },
  dark: { icon: '🌙', label: 'Theme · Dark' },
};

function cycleTheme(): void {
  themeChoice.value =
    themeChoice.value === 'auto' ? 'light' : themeChoice.value === 'light' ? 'dark' : 'auto';
}

// -------- Start new case --------------------------------------------------

const { reset: resetCase } = useCaseReset();
const newCaseModalOpen = ref(false);

function openNewCaseModal(): void {
  newCaseModalOpen.value = true;
}
function cancelNewCase(): void {
  newCaseModalOpen.value = false;
}
function confirmNewCase(): void {
  // Close the drawer first so it doesn't flash a half-rendered state during
  // the reload navigation; then wipe storage + reload onto Phase 1.
  session.closeDrawer();
  newCaseModalOpen.value = false;
  resetCase();
}

// -------- iOS-style swipe gestures ----------------------------------------
//
// Two motions:
//   * Edge-swipe right from the left edge of the screen (drawer closed) →
//     drawer follows the finger and snaps open on release if past 40% width
//     or on a fast flick.
//   * Drag left anywhere on the drawer itself (drawer open) → drawer follows
//     finger and snaps closed on release using the same thresholds.
//
// Vertical drags are detected first (axis lock) and given back to the
// browser so the drawer's own scroll still works.

const DRAWER_WIDTH = 288;
const AXIS_LOCK_PX = 6;

const dragMode = ref<'open' | 'close'>('open');
const dragAxis = ref<'undecided' | 'horizontal' | 'vertical'>('undecided');
const dragging = ref(false);
const dragOffsetPx = ref(0); // 0 = closed, DRAWER_WIDTH = open
let dragStartX = 0;
let dragStartY = 0;
let lastSampleX = 0;
let lastSampleT = 0;
let dragVelocity = 0; // px / ms, positive = rightward

const drawerStyle = computed<CSSProperties | undefined>(() => {
  if (!dragging.value || dragAxis.value !== 'horizontal') return undefined;
  return {
    left: `${dragOffsetPx.value - DRAWER_WIDTH}px`,
    transition: 'none',
  };
});

const overlayStyle = computed<CSSProperties | undefined>(() => {
  if (!dragging.value || dragAxis.value !== 'horizontal') return undefined;
  return {
    opacity: String(dragOffsetPx.value / DRAWER_WIDTH),
    transition: 'none',
  };
});

const overlayVisible = computed(() => drawerOpen.value || dragging.value);

function beginDrag(mode: 'open' | 'close', x: number, y: number, t: number) {
  dragMode.value = mode;
  dragAxis.value = 'undecided';
  dragging.value = true;
  dragStartX = x;
  dragStartY = y;
  lastSampleX = x;
  lastSampleT = t;
  dragVelocity = 0;
  dragOffsetPx.value = mode === 'open' ? 0 : DRAWER_WIDTH;
}

function onEdgeTouchStart(e: TouchEvent) {
  if (drawerOpen.value) return;
  const t = e.touches[0];
  if (!t) return;
  beginDrag('open', t.clientX, t.clientY, e.timeStamp);
}

function onDrawerTouchStart(e: TouchEvent) {
  if (!drawerOpen.value) return;
  const t = e.touches[0];
  if (!t) return;
  beginDrag('close', t.clientX, t.clientY, e.timeStamp);
}

function onTouchMove(e: TouchEvent) {
  if (!dragging.value) return;
  const t = e.touches[0];
  if (!t) return;
  const dx = t.clientX - dragStartX;
  const dy = t.clientY - dragStartY;

  if (dragAxis.value === 'undecided') {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      dragAxis.value = 'horizontal';
    } else {
      // User is scrolling the drawer's content; bail out.
      dragAxis.value = 'vertical';
      dragging.value = false;
      return;
    }
  }
  if (dragAxis.value !== 'horizontal') return;

  // Stop the WebView from also scrolling sideways while we own the gesture.
  if (e.cancelable) e.preventDefault();

  const now = e.timeStamp;
  const dt = Math.max(1, now - lastSampleT);
  dragVelocity = (t.clientX - lastSampleX) / dt;
  lastSampleX = t.clientX;
  lastSampleT = now;

  const offset = dragMode.value === 'open' ? dx : DRAWER_WIDTH + dx;
  dragOffsetPx.value = Math.max(0, Math.min(DRAWER_WIDTH, offset));
}

function onTouchEnd() {
  if (!dragging.value) return;
  const wasHorizontal = dragAxis.value === 'horizontal';
  dragging.value = false;
  if (!wasHorizontal) {
    dragAxis.value = 'undecided';
    return;
  }
  const decision = snapDecision({
    mode: dragMode.value,
    offsetPx: dragOffsetPx.value,
    velocityPxPerMs: dragVelocity,
    widthPx: DRAWER_WIDTH,
  });
  dragOffsetPx.value = 0;
  dragAxis.value = 'undecided';
  if (decision === 'open') session.openDrawer();
  else session.closeDrawer();
}
</script>

<template>
  <Teleport to="body">
    <!-- Thin invisible strip on the left edge. Listens for an opening drag
         only while the drawer is closed; sits below the sticky bar so the
         hamburger button still owns the top region. -->
    <div
      v-if="!drawerOpen"
      class="nav-edge-sensor no-print"
      aria-hidden="true"
      @touchstart.passive="onEdgeTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    />
    <div
      v-if="overlayVisible"
      class="nav-overlay no-print"
      role="presentation"
      :style="overlayStyle"
      @click="session.closeDrawer()"
    />
    <aside
      class="nav-drawer no-print"
      :class="{ 'is-open': drawerOpen }"
      :style="drawerStyle"
      :aria-hidden="!drawerOpen"
      role="navigation"
      aria-label="Sedation workflow"
      @touchstart.passive="onDrawerTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <div class="nav-brand">
        <img class="nav-brand-logo" :src="logoSrc" alt="" width="28" height="28" />
        <div class="nav-brand-text">
          <span class="nav-brand-name">Sedation Pro</span>
          <span class="nav-brand-sub">{{ practiceName }}</span>
        </div>
      </div>

      <header class="nav-summary">
        <div class="nav-summary-top">
          <div class="nav-avatar" aria-hidden="true">{{ initial }}</div>
          <div class="nav-patient">
            <div class="nav-patient-name">{{ patientName.trim() || 'No patient' }}</div>
            <div class="nav-patient-meta">
              <template v-if="mrn || age">
                <span v-if="mrn">MRN {{ mrn }}</span>
                <span v-if="mrn && age"> · </span>
                <span v-if="age">{{ age }} y/o</span>
              </template>
              <span v-else>Enter patient details to begin</span>
            </div>
          </div>
        </div>
        <div class="nav-sum-pills">
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Clearance</div>
            <div class="nav-sum-pill-value">{{ completeness.percent }}%</div>
          </div>
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Events</div>
            <div class="nav-sum-pill-value">{{ eventCount }}</div>
          </div>
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Status</div>
            <div class="nav-sum-pill-value" :class="{ good: isPhase1Complete }">
              {{ isPhase1Complete ? 'Ready' : 'Hold' }}
            </div>
          </div>
        </div>
      </header>

      <nav class="nav-section">
        <p class="nav-section-label">Reference</p>
        <button
          type="button"
          class="nav-phase nav-phase--qr"
          :class="{ 'is-current': quickRefActive }"
          @click="goQuickRef"
        >
          <span class="nav-phase-icon nav-phase-icon--qr" aria-hidden="true">📖</span>
          <span class="nav-phase-main">
            <span class="nav-phase-title">Quick Reference</span>
            <span class="nav-phase-sub">Drugs · ACLS · emergencies</span>
          </span>
          <span class="nav-phase-chevron" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          class="nav-phase nav-phase--inv"
          :class="{ 'is-current': inventoryActive }"
          @click="goInventory"
        >
          <span class="nav-phase-icon nav-phase-icon--inv" aria-hidden="true">💊</span>
          <span class="nav-phase-main">
            <span class="nav-phase-title">Drug Inventory</span>
            <span class="nav-phase-sub">{{ inventorySub }}</span>
          </span>
          <UiStatusPill
            v-if="inventorySummary.expired > 0"
            class="nav-phase-badge"
            severity="limit"
            :label="String(inventorySummary.expired)"
          />
          <UiStatusPill
            v-else-if="inventorySummary.expiring > 0"
            class="nav-phase-badge"
            severity="caution"
            :label="String(inventorySummary.expiring)"
          />
          <span class="nav-phase-chevron" aria-hidden="true">›</span>
        </button>
      </nav>

      <nav class="nav-section">
        <p class="nav-section-label">Sedation Session</p>
        <button
          v-for="entry in phaseEntries"
          :key="entry.id"
          type="button"
          class="nav-phase"
          :class="[
            `nav-phase--${entry.iconTint}`,
            {
              'is-current': currentPhase === entry.id,
              'is-locked': entry.locked,
            },
          ]"
          :disabled="entry.locked"
          :aria-disabled="entry.locked"
          @click="go(entry)"
        >
          <span
            class="nav-phase-icon"
            :class="`nav-phase-icon--${entry.iconTint}`"
            aria-hidden="true"
          >
            <span v-if="entry.locked">🔒</span>
            <span v-else>{{ entry.number }}</span>
          </span>
          <span class="nav-phase-main">
            <span class="nav-phase-title">{{ entry.title }}</span>
            <span class="nav-phase-sub">{{ entry.sub }}</span>
          </span>
          <span class="nav-phase-chevron" aria-hidden="true">
            {{ currentPhase === entry.id ? '⌄' : '›' }}
          </span>
        </button>
      </nav>

      <!-- Audio mute. Quieter visual weight than the phase rows; chimes
           fire on Versed/Fentanyl timer ready transitions (see useAlarms). -->
      <button type="button" class="nav-utility" :aria-pressed="!audioMuted" @click="toggleMute">
        <span class="nav-utility-icon" aria-hidden="true">{{ audioMuted ? '🔇' : '🔔' }}</span>
        <span class="nav-utility-label">
          {{ audioMuted ? 'Timer chimes muted' : 'Timer chimes on' }}
        </span>
      </button>

      <!-- Theme cycle: auto → light → dark → auto. Auto follows the OS via
           prefers-color-scheme; the two locked modes override regardless. -->
      <button
        type="button"
        class="nav-utility"
        :aria-label="`Theme: ${themeChoice}. Tap to cycle.`"
        @click="cycleTheme"
      >
        <span class="nav-utility-icon" aria-hidden="true">{{ themeMeta[themeChoice].icon }}</span>
        <span class="nav-utility-label">{{ themeMeta[themeChoice].label }}</span>
      </button>

      <!-- Destructive action — start a fresh case. Sits below the nav and is
           visually quieter than the phase rows so a thumb hunting for a
           phase tap can't drift onto it accidentally. The UiModal handles
           the "are you sure" gate. -->
      <button type="button" class="nav-new-case" @click="openNewCaseModal">
        <span class="nav-new-case-icon" aria-hidden="true">↻</span>
        <span class="nav-new-case-label">Start new case</span>
      </button>
    </aside>
  </Teleport>

  <UiModal
    :open="newCaseModalOpen"
    title="Start new case?"
    tone="danger"
    confirm-label="Start new case"
    cancel-label="Cancel"
    @confirm="confirmNewCase"
    @cancel="cancelNewCase"
  >
    Current patient data, event log, and IV totals will be cleared. This can't be undone. Make sure
    the clinical note has been generated or shared if you still need it.
  </UiModal>
</template>

<style scoped>
/* Thin invisible strip that catches an iOS-style edge swipe to open the
   drawer. z-index sits below the sticky bar (100) so the hamburger button
   still receives taps when the user is targeting the top region. */
.nav-edge-sensor {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 24px;
  z-index: 50;
  /* No background so it stays invisible to the user. */
  touch-action: pan-y;
}

.nav-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 9991;
  backdrop-filter: blur(3px);
}

.nav-drawer {
  position: fixed;
  left: -288px;
  top: 0;
  width: 288px;
  height: 100%;
  /* Layered highlight on the panel body; floating panel deserves the
     dramatic two-layer lift, no right-edge hairline. */
  background: var(--surface-highlight), var(--color-card-bg);
  box-shadow: var(--shadow-lg);
  z-index: 9992;
  overflow-y: auto;
  transition: left var(--dur-250) var(--ease-standard);
  display: flex;
  flex-direction: column;
}
.nav-drawer.is-open {
  left: 0;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 10px;
}
.nav-brand-logo {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
}
.nav-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.nav-brand-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.3px;
  color: var(--color-text-primary);
}
.nav-brand-sub {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.3px;
}
.nav-summary {
  padding: 16px 18px 12px;
  /* Neutral highlight (was an accent-soft blue wash — a leftover from when
     phases carried per-hue tint). Section divider kept as a thin
     surface-elevated line for layout clarity. */
  border-bottom: 1px solid var(--color-surface-elevated);
  background: var(--surface-highlight);
}
.nav-summary-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.nav-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  /* Neutral two-tone gradient (was accent → purple, a leftover from the
     per-phase hue era). Subtle elevation via shadow-sm. */
  background: linear-gradient(135deg, var(--color-surface-elevated), var(--color-surface-overlay));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
  letter-spacing: -0.3px;
}
.nav-patient {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.nav-patient-name {
  font-size: var(--type-body);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-patient-meta {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-top: 2px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-sum-pills {
  display: flex;
  gap: 6px;
}
.nav-sum-pill {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-sm);
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.nav-sum-pill-label {
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-disabled);
}
.nav-sum-pill-value {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.nav-sum-pill-value.good {
  color: var(--color-good);
}

.nav-section {
  padding: 14px 0 0;
}
.nav-section-label {
  margin: 0 16px 8px;
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.nav-phase {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-surface);
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.nav-phase:active:not(:disabled) {
  background: var(--color-surface);
}
.nav-phase.is-current {
  background: var(--color-surface-subtle);
}
.nav-phase.is-locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-phase-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  flex-shrink: 0;
}
/* Neutral surface gradient — phase identity is the number, not the hue. */
.nav-phase-icon--ph1,
.nav-phase-icon--ph2,
.nav-phase-icon--ph3,
.nav-phase-icon--ph4 {
  background: linear-gradient(135deg, var(--color-surface-elevated), var(--color-surface-overlay));
}
/* Quick Reference keeps its teal identity — separate destination, not a
   numbered phase. White glyph reads on the saturated teal. */
.nav-phase-icon--qr {
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  color: #fff;
}
/* Inventory shares the reference-section identity family — indigo so it
   reads as a sibling of Quick Reference without impersonating it. */
.nav-phase-icon--inv {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
}
.nav-phase-badge {
  flex-shrink: 0;
}
.nav-phase.is-locked .nav-phase-icon {
  background: var(--color-surface-elevated);
  color: var(--color-text-disabled);
}

.nav-phase-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-phase-title {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.2;
}
.nav-phase.is-locked .nav-phase-title {
  color: var(--color-text-tertiary);
}
.nav-phase-sub {
  font-size: var(--type-caption);
  color: var(--color-text-disabled);
  letter-spacing: 0.2px;
}

.nav-phase-chevron {
  font-size: 15px;
  color: var(--color-text-disabled);
  flex-shrink: 0;
  line-height: 1;
}
.nav-phase.is-current .nav-phase-chevron {
  color: var(--color-text-secondary);
}

/* Utility button — a quieter row for settings-style toggles (mute, etc.)
   that don't belong with the phase nav above and aren't destructive
   like Start-new-case below. */
.nav-utility {
  margin: 16px 12px 0;
  width: calc(100% - 24px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  background: transparent;
  border: 1px solid var(--color-surface-elevated);
  border-radius: var(--r-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-medium);
  letter-spacing: 0.2px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard);
}
.nav-utility:hover {
  color: var(--color-text-primary);
}
.nav-utility:active {
  background: var(--color-surface);
}
.nav-utility-icon {
  font-size: 15px;
  line-height: 1;
}

/* Start-new-case button — visually demoted vs the phase rows so it doesn't
   compete for attention. Sits in its own band below the nav with a thin
   separator, picks up a subtle danger tint on press. */
.nav-new-case {
  margin: 12px 12px 16px;
  width: calc(100% - 24px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-surface-elevated);
  border-radius: var(--r-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-medium);
  letter-spacing: 0.2px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard);
}
.nav-new-case:hover {
  color: var(--color-text-primary);
}
.nav-new-case:active {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.nav-new-case-icon {
  font-size: 14px;
  line-height: 1;
}
</style>
