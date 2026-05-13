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

const { currentPhase, currentStep } = storeToRefs(session);
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

const phaseMeta: Record<Phase, { label: string; sub: string; tint: string }> = {
  quickref: { label: 'Quick Reference', sub: 'Emergency protocols + drug doses', tint: 'qr' },
  phase1: { label: 'Phase 1 · Assessment', sub: 'Pre-sedation clearance', tint: 'ph1' },
  phase2: { label: 'Phase 2 · Oral Meds', sub: 'Pre-op anxiolytic', tint: 'ph2' },
  phase3: { label: 'Phase 3 · IV Sedation', sub: 'Drug administration', tint: 'ph3' },
  phase4: { label: 'Phase 4 · Recovery', sub: 'Discharge & note', tint: 'ph4' },
};

const meta = computed(() => phaseMeta[currentPhase.value]);
const showClearance = computed(() => currentPhase.value === 'phase1');

function emergency() {
  void router.push('/quick-reference');
}
</script>

<template>
  <header class="sticky-bar" :class="`sticky-bar--${meta.tint}`">
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
        <span v-if="currentStep" class="sticky-bar-step">Step {{ currentStep }}</span>
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
        <span aria-hidden="true">🚨</span>
        <span class="sticky-bar-emerg-text">Emergency</span>
      </button>
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
  background: rgba(11, 20, 34, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--color-border);
}

.sticky-bar-nav {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-right: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.sticky-bar-nav:hover,
.sticky-bar-nav:active {
  background: var(--color-accent-soft);
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
  opacity: 0.85;
}
.sticky-bar-step {
  font-size: var(--type-footnote);
  font-weight: var(--weight-medium);
  color: rgba(255, 255, 255, 0.4);
}
.sticky-bar-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--type-caption);
}
.sticky-bar-phase-sub {
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.2px;
}
.sticky-bar-clearance-label {
  color: rgba(255, 255, 255, 0.5);
}
.sticky-bar-clearance-bar {
  flex: 1;
  height: 3px;
  max-width: 140px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.sticky-bar-clearance-fill {
  display: block;
  height: 100%;
  background: var(--ph1-color);
  transition: width var(--dur-250) var(--ease-standard);
}
.sticky-bar-clearance-count {
  font-family: var(--font-mono);
  font-weight: var(--weight-bold);
  color: var(--ph1-color);
  letter-spacing: 0.3px;
}
.sticky-bar-ready {
  font-weight: var(--weight-bold);
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: var(--type-caption);
  background: var(--color-good-soft);
  border: 1px solid rgba(74, 222, 128, 0.3);
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
  border: 1px solid transparent;
}
.sticky-bar-alert--danger {
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-color: rgba(251, 113, 133, 0.3);
}
.sticky-bar-alert--caution {
  color: var(--color-warn);
  background: var(--color-warn-soft);
  border-color: rgba(250, 204, 21, 0.3);
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
  border: 1px solid var(--color-border);
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
  border-color: rgba(250, 204, 21, 0.35);
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
  border-color: rgba(251, 113, 133, 0.4);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: var(--weight-bold);
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
  border: 1px solid var(--color-border);
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
  border-color: rgba(250, 204, 21, 0.35);
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
    padding: 8px 12px 7px;
    gap: 2px;
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
}
@media (max-width: 420px) {
  .sticky-bar-saved {
    /* Free up room for the Undo + Emergency buttons on narrow phones. */
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
