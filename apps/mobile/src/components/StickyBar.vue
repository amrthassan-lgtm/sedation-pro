<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { lastSavedAt } from '@/stores/persistence';
import { useNow } from '@/composables/useNow';

const router = useRouter();
const session = useSessionStore();
const patient = usePatientStore();
const undo = useUndoStore();
const now = useNow(15_000);

const { currentPhase } = storeToRefs(session);
const { canUndo, count: undoCount } = storeToRefs(undo);
const { completeness, isPhase1Complete, safetyAlerts } = storeToRefs(patient);

/**
 * "Saved · HH:MM" pill text. Hides itself until the first autosave fires so
 * a brand-new session doesn't surface a stale timestamp from another tab.
 * Becomes "Saving…" momentarily after each write (within 800 ms) — pure
 * cosmetic but reassures the user that the form isn't lost.
 */
const savedLabel = computed<string | null>(() => {
  const ts = lastSavedAt.value;
  if (ts === null) return null;
  const ageMs = now.value - ts;
  if (ageMs < 800) return 'Saving…';
  return `Saved · ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
});

const phaseMeta: Record<Phase, { label: string; sub: string }> = {
  quickref: { label: 'Quick Reference', sub: 'Emergency protocols + drug doses' },
  inventory: { label: 'Drug Inventory', sub: 'Emergency medication stock & expiry' },
  phase1: { label: 'Phase 1 · Assessment', sub: 'Pre-sedation clearance' },
  phase2: { label: 'Phase 2 · Oral Meds', sub: 'Pre-op anxiolytic' },
  phase3: { label: 'Phase 3 · IV Sedation', sub: 'Drug administration' },
  phase4: { label: 'Phase 4 · Recovery', sub: 'Discharge & note' },
};

const meta = computed(() => phaseMeta[currentPhase.value]);
const showClearance = computed(() => currentPhase.value === 'phase1');

/**
 * Four-segment phase rail. We light up segments through and including the
 * current phase so a glance at the strip answers "how far through the case
 * am I?" without reading text. Quick Reference doesn't advance the rail —
 * it's a side trip, not a phase — so we leave the active phase highlighted
 * when the user dips into it.
 */
const railPhases: ReadonlyArray<{ id: Phase; tint: 'ph1' | 'ph2' | 'ph3' | 'ph4' }> = [
  { id: 'phase1', tint: 'ph1' },
  { id: 'phase2', tint: 'ph2' },
  { id: 'phase3', tint: 'ph3' },
  { id: 'phase4', tint: 'ph4' },
];

const railActiveIndex = computed(() => {
  const idx = railPhases.findIndex((p) => p.id === currentPhase.value);
  return idx === -1 ? -1 : idx;
});

/**
 * Single thin spine + a small "head" dot at the leading edge — replaces
 * the old 4-segment rail. After the phase-tint collapse to one accent the
 * per-phase colour distinction was gone anyway; this reads as a calm
 * "how far through the case am I" indicator (iOS music-scrubber pattern,
 * neutral colours only). Both percentages are the same number — the fill
 * extends to the current frontier and the head sits on it.
 */
const railProgressPercent = computed(() => {
  if (railActiveIndex.value < 0) return 0;
  return ((railActiveIndex.value + 1) / railPhases.length) * 100;
});

function emergency() {
  // `focus=search` signals the QR view to autofocus its input on mount.
  // Direct navigation (nav drawer, deep link) won't carry the query param
  // and lands without stealing focus from a visual scan.
  void router.push({ path: '/quick-reference', query: { focus: 'search' } });
}
</script>

<template>
  <header class="sticky-bar">
    <button
      type="button"
      class="sticky-bar-nav"
      aria-label="Open navigation"
      @click="session.toggleDrawer"
    >
      <span class="sticky-bar-nav-icon" aria-hidden="true">
        <svg viewBox="0 0 26 26" width="26" height="26" fill="none">
          <rect x="3" y="6" width="20" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="12" width="20" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="18" width="20" height="2" rx="1" fill="currentColor" />
        </svg>
      </span>
    </button>

    <div class="sticky-bar-info">
      <div class="sticky-bar-phase">
        <span class="sticky-bar-phase-label">{{ meta.label }}</span>
      </div>
      <div class="sticky-bar-sub">
        <template v-if="showClearance">
          <span class="sticky-bar-clearance-label">Clearance</span>
          <span class="sticky-bar-clearance-bar" aria-hidden="true">
            <span
              class="sticky-bar-clearance-fill"
              :style="{ width: completeness.percent + '%' }"
            />
          </span>
          <span class="sticky-bar-clearance-count">
            {{ completeness.done }} / {{ completeness.total }}
          </span>
          <span v-if="isPhase1Complete" class="sticky-bar-ready">✓ Ready</span>
        </template>
        <template v-else>
          <span class="sticky-bar-phase-sub">{{ meta.sub }}</span>
        </template>
      </div>
      <div v-if="safetyAlerts.length" class="sticky-bar-alerts">
        <span
          v-for="alert in safetyAlerts"
          :key="alert.code"
          class="sticky-bar-alert"
          :class="`sticky-bar-alert--${alert.tone}`"
        >
          {{ alert.label }}
        </span>
      </div>
    </div>

    <div class="sticky-bar-actions">
      <span
        v-if="savedLabel"
        class="sticky-bar-saved"
        :class="{ 'is-saving': savedLabel === 'Saving…' }"
      >
        <span v-if="savedLabel === 'Saving…'" class="sticky-bar-saved-dot" aria-hidden="true" />
        <span v-else class="sticky-bar-saved-check" aria-hidden="true">✓</span>
        {{ savedLabel }}
      </span>
      <button
        type="button"
        class="sticky-bar-undo"
        :class="{ 'has-action': canUndo }"
        :disabled="!canUndo"
        :aria-label="canUndo ? `Undo (${undoCount} actions)` : 'No actions to undo'"
        @click="undo.undo"
      >
        ↶
        <span class="sticky-bar-undo-text">Undo</span>
        <span v-if="undoCount > 1" class="sticky-bar-undo-count">({{ undoCount }})</span>
      </button>
      <button
        type="button"
        class="sticky-bar-emerg"
        aria-label="Open emergency protocols"
        @click="emergency"
      >
        <span class="sticky-bar-emerg-text">Emergency</span>
      </button>
    </div>

    <div class="sticky-bar-rail" aria-hidden="true">
      <span class="sticky-bar-rail-fill" :style="{ width: railProgressPercent + '%' }" />
      <span
        v-if="railActiveIndex >= 0"
        class="sticky-bar-rail-head"
        :style="{ left: railProgressPercent + '%' }"
      />
    </div>
  </header>
</template>

<style scoped>
.sticky-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: stretch;
  gap: 0;
  /* Layered highlight + frosted body; two-layer shadow replaces the
     hairline border-bottom (iOS-grade lift, not a pixel line). */
  background: var(--surface-highlight), var(--color-frosted-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: var(--shadow-sm);
  /* Top inset is owned by the bar, not the body. The body still applies
     `padding-top: var(--safe-top)` globally; the negative margin here
     cancels that for the bar itself (so the frosted background extends to
     the very top of the screen, sliding under the notch), and the matching
     padding pushes the bar's content back below the status bar. Net: at
     any scroll position the clock / signal / battery sit on the bar's
     frosted glass, never on top of the phase label or Emergency button.
     On devices without a notch (`safe-area-inset-top = 0`) both terms
     collapse to 0 and the bar behaves as before. */
  margin-top: calc(-1 * env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  /* Bottom padding lifts in-flow content above the absolute-positioned
     spine rail at `bottom: 0` — without it the rail sat flush against
     the action chips (esp. Emergency) on iPhone portrait. */
  padding-bottom: 8px;
}

.sticky-bar-nav {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.sticky-bar-nav:hover,
.sticky-bar-nav:active {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.sticky-bar-info {
  flex: 1;
  min-width: 0;
  padding: 10px 16px 9px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.sticky-bar-phase {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sticky-bar-phase-label {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.2px;
}
.sticky-bar-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--type-caption);
}
.sticky-bar-phase-sub {
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
}
.sticky-bar-clearance-label {
  color: var(--color-text-tertiary);
}
.sticky-bar-clearance-bar {
  flex: 1;
  height: 3px;
  max-width: 140px;
  background: var(--color-surface-elevated);
  border-radius: 2px;
  overflow: hidden;
}
.sticky-bar-clearance-fill {
  display: block;
  height: 100%;
  background: var(--color-text-tertiary);
  transition: width var(--dur-250) var(--ease-standard);
}
.sticky-bar-clearance-count {
  font-family: var(--font-mono);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  letter-spacing: 0.3px;
}
.sticky-bar-ready {
  font-weight: var(--weight-bold);
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: var(--type-caption);
  background: var(--color-good-soft);
  color: var(--color-good);
}

.sticky-bar-alerts {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-top: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sticky-bar-alerts::-webkit-scrollbar {
  display: none;
}
.sticky-bar-alert {
  flex-shrink: 0;
}
.sticky-bar-alert {
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--r-sm);
}
.sticky-bar-alert--danger {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
.sticky-bar-alert--caution {
  color: var(--color-warn);
  background: var(--color-warn-soft);
}

.sticky-bar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  flex-shrink: 0;
}
.sticky-bar-undo,
.sticky-bar-emerg {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  padding: 8px 12px;
  border-radius: var(--r-sm);
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.sticky-bar-undo:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sticky-bar-undo.has-action {
  background: var(--color-warn-soft);
  color: var(--color-warn);
}
.sticky-bar-undo:active:not(:disabled),
.sticky-bar-emerg:active {
  transform: scale(0.97);
}
.sticky-bar-undo-text {
  letter-spacing: 0.2px;
}
.sticky-bar-undo-count {
  font-family: var(--font-mono);
  opacity: 0.75;
}
.sticky-bar-emerg {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: var(--weight-bold);
}

/* Four-segment phase progress rail at the bottom edge. With cards now
   neutral this is the primary "how far through the case" cue, so it sits
   flush and a touch taller than the old 3px hairline. Inert visual — the
   nav drawer is the actual phase-navigation surface. */
/* Single thin spine across the bottom edge of the bar. Fill grows
   left-to-right with phase progress; the small head dot sits on the
   leading edge — iOS music-scrubber pattern, neutral colours only. */
.sticky-bar-rail {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 3px;
  background: var(--color-border);
  border-radius: 999px;
  overflow: visible;
  pointer-events: none;
}
.sticky-bar-rail-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--color-text-tertiary);
  border-radius: 999px;
  transition: width var(--dur-250) var(--ease-standard);
}
.sticky-bar-rail-head {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-primary);
  transform: translate(-50%, -50%);
  transition: left var(--dur-250) var(--ease-standard);
}

/* Save indicator — a subtle "Saved · HH:MM" pill that briefly flips to
   "Saving…" with a pulsing dot whenever localStorage commits. */
.sticky-bar-saved {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  white-space: nowrap;
}
.sticky-bar-saved-check {
  color: var(--color-good);
  font-size: 11px;
  font-weight: var(--weight-bold);
}
.sticky-bar-saved.is-saving {
  color: var(--color-warn);
  background: var(--color-warn-soft);
}
.sticky-bar-saved-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warn);
  animation: sticky-bar-saved-pulse 800ms ease-out;
}
@keyframes sticky-bar-saved-pulse {
  0% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  60% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
}
@media (max-width: 480px) {
  .sticky-bar-info {
    /* iPhone portrait still gets the full desktop info padding so the
       phase label + sub line don't feel cramped against the chips. */
    padding: 10px 12px 8px;
    gap: 3px;
  }
  .sticky-bar-clearance-bar {
    max-width: 80px;
  }
  .sticky-bar-phase-sub {
    display: none;
  }
  .sticky-bar-actions {
    gap: 4px;
    padding-right: 8px;
  }
  .sticky-bar-saved {
    /* Cosmetic reassurance — drop it on every phone-portrait width
       (incl. the ~430px Pro Max that cleared the old 420px cutoff and
       let it crowd the phase title) so the title always has room. */
    display: none;
  }
}
@media (max-width: 380px) {
  .sticky-bar-undo-text,
  .sticky-bar-undo-count,
  .sticky-bar-emerg-text {
    display: none;
  }
  .sticky-bar-undo,
  .sticky-bar-emerg {
    padding: 8px 10px;
  }
}
</style>
