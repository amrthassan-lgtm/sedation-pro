<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useIVStore } from '@/stores/iv';
import { useIvDosing } from '@/composables/useIvDosing';
import { useNow } from '@/composables/useNow';
import { UiPercentBar, UiTimerPill } from '@sedation-pro/ui';
import type { Severity, TimerPillStatus } from '@sedation-pro/ui';

/**
 * Bottom-mounted Phase 3 drug dock.
 *
 * Premium iOS pattern: a frosted-glass surface that sits above the home
 * indicator with two states:
 *  - **compact** — drug status row (mg given / ceiling, live half-life timer,
 *    redose-window status) plus two "next-dose" buttons (Versed +0.5,
 *    Fentanyl +25). One tap = log.
 *  - **expanded** — full per-class dose grid (sedation, anti-emetic, reversal)
 *    with cooldown overlays on every button. Reversal is visually demoted
 *    (red border + heading) so muscle memory doesn't mis-tap it.
 *
 * The in-card buttons in Phase 3 stay as the "first encounter with this
 * drug" surface (max-dose math, weight calc, drug-specific explanations).
 * The dock is the "I'm titrating right now" fast lane — both call into
 * `useIvDosing` so toasts / undo / haptics behave identically.
 */

const iv = useIVStore();
const dosing = useIvDosing();
const now = useNow(1000);

const { lastVersedAt, lastFentanylAt, sedationStatus } = storeToRefs(iv);

const expanded = ref(false);

function toggle() {
  expanded.value = !expanded.value;
}

function collapse() {
  expanded.value = false;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// -------- Timer pill state (mirrors the in-card pills) --------------------

const versedPill = computed(() => {
  if (lastVersedAt.value === null) {
    return { count: '—', hint: 'No dose', status: 'cooling' as TimerPillStatus };
  }
  const t = iv.versedTimerAt(now.value);
  if (!t) return { count: '—', hint: 'No dose', status: 'cooling' as TimerPillStatus };
  return {
    count: fmtDuration(t.elapsedSec),
    hint: t.state === 'cooling' ? 'wait' : t.state === 'ramping' ? 'ramp' : 'redose ok',
    status: t.state as TimerPillStatus,
  };
});

const fentanylPill = computed(() => {
  if (lastFentanylAt.value === null) {
    return { count: '—', hint: 'No dose', status: 'cooling' as TimerPillStatus };
  }
  const t = iv.fentanylTimerAt(now.value);
  if (!t) return { count: '—', hint: 'No dose', status: 'cooling' as TimerPillStatus };
  return {
    count: fmtDuration(t.elapsedSec),
    hint: t.state === 'cooling' ? 'wait' : t.state === 'ramping' ? 'ramp' : 'redose ok',
    status: t.state as TimerPillStatus,
  };
});

// -------- Severity → CSS class for the progress bars -----------------------
//
// The engine's `Severity` type includes `crisis` for above-100% cases; fold
// it into the `limit` swatch so the dock only needs three colour states.

function severityClass(sev: Severity): string {
  if (sev === 'crisis' || sev === 'limit') return 'dock-bar--limit';
  if (sev === 'caution') return 'dock-bar--caution';
  return 'dock-bar--safe';
}

const versedStatus = computed(() => sedationStatus.value.versed);
const fentanylStatus = computed(() => sedationStatus.value.fentanyl);
</script>

<template>
  <div class="dock-root" :class="{ 'is-expanded': expanded }">
    <!-- Backdrop dims the page when expanded so the dock reads as a sheet. -->
    <div v-if="expanded" class="dock-backdrop" @click="collapse" aria-hidden="true" />

    <section class="dock" :aria-expanded="expanded">
      <!-- Drag handle / tap target. Same in both states. -->
      <button
        type="button"
        class="dock-handle"
        :aria-label="expanded ? 'Collapse drug dock' : 'Expand drug dock'"
        @click="toggle"
      >
        <span class="dock-grip" aria-hidden="true" />
      </button>

      <!-- Compact-mode status row (always visible). -->
      <div class="dock-status">
        <!-- Versed row -->
        <div class="dock-drug-row">
          <div class="dock-drug-head">
            <span class="dock-swatch dock-swatch--versed" aria-hidden="true" />
            <span class="dock-drug-name">Versed</span>
            <span class="dock-drug-load">
              <strong>{{ versedStatus.given.toFixed(1) }}</strong>
              /
              {{ versedStatus.ceiling.toFixed(1) }} mg
            </span>
            <UiTimerPill
              label="Versed"
              tone="versed"
              :count="versedPill.count"
              :hint="versedPill.hint"
              :status="versedPill.status"
            />
          </div>
          <UiPercentBar
            :percent="versedStatus.percent"
            thickness="sm"
            :class="severityClass(versedStatus.severity)"
          />
        </div>

        <!-- Fentanyl row -->
        <div class="dock-drug-row">
          <div class="dock-drug-head">
            <span class="dock-swatch dock-swatch--fentanyl" aria-hidden="true" />
            <span class="dock-drug-name">Fent</span>
            <span class="dock-drug-load">
              <strong>{{ fentanylStatus.given.toFixed(0) }}</strong>
              /
              {{ fentanylStatus.ceiling.toFixed(0) }} mcg
            </span>
            <UiTimerPill
              label="Fent"
              tone="fentanyl"
              :count="fentanylPill.count"
              :hint="fentanylPill.hint"
              :status="fentanylPill.status"
            />
          </div>
          <UiPercentBar
            :percent="fentanylStatus.percent"
            thickness="sm"
            :class="severityClass(fentanylStatus.severity)"
          />
        </div>
      </div>

      <!-- Compact-mode quick buttons (hidden when expanded). -->
      <div v-if="!expanded" class="dock-quick-row">
        <button
          type="button"
          class="dock-btn dock-btn--versed"
          aria-label="Log Versed 0.5 mg IV"
          @click="dosing.logIvVersed(0.5, 'dock')"
        >
          <span class="dock-btn-label">Versed</span>
          <span class="dock-btn-dose">+0.5 mg</span>
        </button>
        <button
          type="button"
          class="dock-btn dock-btn--fentanyl"
          aria-label="Log Fentanyl 25 mcg IV"
          @click="dosing.logIvFentanyl(25, 'dock')"
        >
          <span class="dock-btn-label">Fent</span>
          <span class="dock-btn-dose">+25 mcg</span>
        </button>
      </div>

      <!-- Expanded-mode grid. Grouped by drug class so reversal is never -->
      <!-- adjacent to a sedation button. -->
      <div v-if="expanded" class="dock-expanded">
        <p class="dock-section-label">Sedation</p>
        <div class="dock-grid">
          <button
            type="button"
            class="dock-btn dock-btn--versed"
            @click="dosing.logIvVersed(0.5, 'dock')"
          >
            <span class="dock-btn-label">Versed</span>
            <span class="dock-btn-dose">+0.5 mg</span>
          </button>
          <button
            type="button"
            class="dock-btn dock-btn--versed"
            @click="dosing.logIvVersed(1, 'dock')"
          >
            <span class="dock-btn-label">Versed</span>
            <span class="dock-btn-dose">+1.0 mg</span>
          </button>
          <button
            type="button"
            class="dock-btn dock-btn--versed"
            @click="dosing.logIvVersed(2, 'dock')"
          >
            <span class="dock-btn-label">Versed</span>
            <span class="dock-btn-dose">+2.0 mg</span>
          </button>
          <button
            type="button"
            class="dock-btn dock-btn--fentanyl"
            @click="dosing.logIvFentanyl(25, 'dock')"
          >
            <span class="dock-btn-label">Fent</span>
            <span class="dock-btn-dose">+25 mcg</span>
          </button>
          <button
            type="button"
            class="dock-btn dock-btn--fentanyl"
            @click="dosing.logIvFentanyl(50, 'dock')"
          >
            <span class="dock-btn-label">Fent</span>
            <span class="dock-btn-dose">+50 mcg</span>
          </button>
          <button
            type="button"
            class="dock-btn dock-btn--fentanyl"
            @click="dosing.logIvFentanyl(100, 'dock')"
          >
            <span class="dock-btn-label">Fent</span>
            <span class="dock-btn-dose">+100 mcg</span>
          </button>
        </div>

        <p class="dock-section-label">Anti-emetic</p>
        <div class="dock-grid dock-grid--single">
          <button type="button" class="dock-btn dock-btn--zofran" @click="dosing.logIvZofran(4)">
            <span class="dock-btn-label">Zofran</span>
            <span class="dock-btn-dose">+4 mg</span>
          </button>
        </div>

        <p class="dock-section-label dock-section-label--danger">Reversal · emergency only</p>
        <div class="dock-grid">
          <button
            type="button"
            class="dock-btn dock-btn--reversal"
            @click="dosing.logIvFlumazenil()"
          >
            <span class="dock-btn-label">Flumazenil</span>
            <span class="dock-btn-dose">0.2 mg</span>
          </button>
          <button type="button" class="dock-btn dock-btn--reversal" @click="dosing.logIvNaloxone()">
            <span class="dock-btn-label">Naloxone</span>
            <span class="dock-btn-dose">0.4 mg</span>
          </button>
        </div>

        <p class="dock-dismiss-hint">Tap the handle or backdrop to dismiss</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* The dock owns a single fixed wrapper. It sits above all page content and
   clears the iPhone home indicator via env(safe-area-inset-bottom). */
.dock-root {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 90;
  pointer-events: none;
}

.dock-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 89;
  pointer-events: auto;
  animation: dock-backdrop-in var(--dur-150) var(--ease-decel);
}
@keyframes dock-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dock {
  position: relative;
  pointer-events: auto;
  z-index: 91;
  padding: 6px 12px calc(10px + env(safe-area-inset-bottom)) 12px;
  background: rgba(13, 21, 39, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-top: 1px solid var(--color-border);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.35);
  transition: padding-bottom var(--dur-250) var(--ease-standard);
}
.is-expanded .dock {
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
}

.dock-handle {
  display: block;
  width: 100%;
  padding: 4px 0 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.dock-grip {
  display: block;
  width: 38px;
  height: 4px;
  border-radius: 2px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.18);
  transition: background var(--dur-150) var(--ease-standard);
}
.dock-handle:active .dock-grip {
  background: rgba(255, 255, 255, 0.32);
}

/* Status rows — drug name, mg load, timer pill, then the progress bar. */
.dock-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dock-drug-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dock-drug-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--type-caption);
  letter-spacing: 0.2px;
}
.dock-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dock-swatch--versed {
  background: #f59e0b;
}
.dock-swatch--fentanyl {
  background: #3b82f6;
}
.dock-drug-name {
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  font-size: 10px;
  min-width: 42px;
}
.dock-drug-load {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.dock-drug-load strong {
  color: var(--color-text-primary);
  font-weight: var(--weight-bold);
}

/* Bar colour shifts with severity — overrides UiPercentBar's neutral fill. */
.dock-bar--safe :deep(.ui-percent-bar-fill) {
  background: var(--color-good);
}
.dock-bar--caution :deep(.ui-percent-bar-fill) {
  background: var(--color-warn);
}
.dock-bar--limit :deep(.ui-percent-bar-fill) {
  background: var(--color-danger);
}

/* Quick-tap row — two big buttons in compact mode. */
.dock-quick-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

/* Shared button styling — used in both compact + expanded layouts. */
.dock-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  padding: 8px 12px;
  min-height: 50px;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.dock-btn:active {
  transform: scale(0.97);
  background: var(--color-surface-overlay);
}
.dock-btn-label {
  font-size: 10px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.dock-btn-dose {
  font-family: var(--font-mono);
  font-size: var(--type-body);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.dock-btn--versed {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.08);
}
.dock-btn--versed .dock-btn-dose {
  color: #f59e0b;
}
.dock-btn--fentanyl {
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.08);
}
.dock-btn--fentanyl .dock-btn-dose {
  color: #3b82f6;
}
.dock-btn--zofran {
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(74, 222, 128, 0.08);
}
.dock-btn--zofran .dock-btn-dose {
  color: var(--color-good);
}
.dock-btn--reversal {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.1);
}
.dock-btn--reversal .dock-btn-dose {
  color: var(--color-crisis);
}

/* Expanded grid. */
.dock-expanded {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: dock-expand-in 200ms var(--ease-decel);
}
@keyframes dock-expand-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.dock-section-label {
  margin: 4px 0 0;
  font-size: 10px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.dock-section-label--danger {
  color: var(--color-crisis);
}
.dock-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.dock-grid--single {
  grid-template-columns: 1fr;
}
.dock-dismiss-hint {
  margin: 6px 0 0;
  font-size: 10px;
  color: var(--color-text-disabled);
  text-align: center;
  letter-spacing: 0.4px;
}

@media (prefers-reduced-motion: reduce) {
  .dock,
  .dock-expanded,
  .dock-backdrop {
    animation: none;
    transition: none;
  }
}
</style>
