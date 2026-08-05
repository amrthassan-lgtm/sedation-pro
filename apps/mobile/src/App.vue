<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import AppFooter from '@/components/AppFooter.vue';
import AppUpdatePrompt from '@/components/AppUpdatePrompt.vue';
import InventoryAlertBanner from '@/components/InventoryAlertBanner.vue';
import SedationDock from '@/components/SedationDock.vue';
import StickyBar from '@/components/StickyBar.vue';
import NavDrawer from '@/components/NavDrawer.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useAlarms, unlockAudio } from '@/composables/useAlarms';
import { useDockVisibility } from '@/composables/useDockVisibility';
import { useWakeLock } from '@/composables/useWakeLock';
import { useCaseReset } from '@/composables/useCaseReset';
import { usePatientStore } from '@/stores/patient';
import { useEventLogStore } from '@/stores/event-log';
import { readPersistedSavedAt, isStaleSession } from '@/stores/persistence';
import { UiModal } from '@sedation-pro/ui';

/** Sedation Dock is only mounted in Phase 3 — every other screen hides it. */
const route = useRoute();
const showSedationDock = computed(() => route.path === '/phase/3');

/**
 * Launch-time wrong-patient gate (parity with the legacy app).
 *
 * `persistRefs` silently rehydrates the previous patient's full chart on
 * boot. If that chart was saved on a *different calendar day* it's almost
 * certainly a different patient, so we block on first paint and make the
 * clinician choose: resume, or wipe and start fresh. Same-day reloads
 * (accidental refresh, backgrounded-then-resumed) restore silently — the
 * legacy behaviour — so we don't nag during an active case.
 *
 * Safety mapping: confirm = Resume (the non-destructive choice, so a
 * reflexive confirm-tap can't lose data); cancel = Start new case (the
 * deliberate destructive path). Backdrop dismissal is disabled.
 */
const patient = usePatientStore();
const eventLog = useEventLogStore();
const { reset: resetCase } = useCaseReset();

const resumeGateOpen = ref(false);
const resumeSavedDate = ref('');

function sessionHasContent(): boolean {
  return patient.name.trim() !== '' || patient.mrn.trim() !== '' || eventLog.count > 0;
}

const resumePatientLine = computed(() => {
  const name = patient.name.trim() || '—';
  const mrn = patient.mrn.trim() || '—';
  return `${name}  ·  MRN ${mrn}`;
});
const resumeProcedure = computed(() => patient.procedure.trim() || '—');
const resumeProvider = computed(() => patient.provider.trim() || '—');

function resumeSession(): void {
  resumeGateOpen.value = false;
}
function discardSession(): void {
  resumeGateOpen.value = false;
  // useCaseReset wipes every sedation-pro:* key (incl. the saved-at marker)
  // and hard-reloads onto Phase 1, so the gate can't re-trigger after this.
  resetCase();
}

onMounted(() => {
  const savedAt = readPersistedSavedAt();
  if (savedAt === null || !sessionHasContent()) return;
  if (!isStaleSession(savedAt, Date.now())) return; // same-day — restore silently
  resumeSavedDate.value = new Date(savedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  resumeGateOpen.value = true;
});

/** Whether the dock is currently rendered ON-SCREEN (mounted + not in its
 * auto-hidden state). Drives `has-dock` so the bottom padding collapses
 * smoothly when the dock slides out, instead of leaving a 250 px gap. */
const { dockOnScreen } = useDockVisibility();
const dockReservesSpace = computed(() => showSedationDock.value && dockOnScreen.value);

/**
 * App-wide screen wake-lock. Held for the entire lifetime the app is mounted
 * — sedation cases, recovery monitoring, charting, and the quick-reference
 * lookups in between all benefit from a screen that doesn't dim. The
 * composable's visibility-change handler re-acquires on foreground; the
 * scope-dispose hook releases when the app unmounts.
 */
const wakeLock = useWakeLock();
void wakeLock.request();

/**
 * Audio alerts on Versed + Fentanyl timer "ready" transitions.
 *
 * The AudioContext starts `suspended` until a user gesture. The earlier
 * `{ once: true }` listener unlocked it on the first tap and then removed
 * itself — which broke the chime in the installed (Add-to-Home-Screen)
 * app: iOS standalone PWAs re-suspend the AudioContext whenever the app is
 * backgrounded or the screen sleeps, which is exactly what happens during
 * the multi-minute redose wait. With nothing left to resume it, `tick()`
 * silently no-ops (it requires `state === 'running'`).
 *
 * Fix: keep a persistent pointerdown listener (idempotent, cheap — every
 * dose tap re-warms the context) plus a visibilitychange handler that
 * resumes the context when the app returns to the foreground.
 */
useAlarms();
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => unlockAudio(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockAudio();
  });
}
</script>

<template>
  <StickyBar class="no-print" />
  <!-- NavDrawer + UndoToast teleport their roots into <body>, so a class
       attribute on the component tag doesn't reach the rendered DOM. They
       tag their own root elements with `no-print` internally. -->
  <NavDrawer />
  <UndoToast />
  <div class="app-shell" :class="{ 'has-dock': dockReservesSpace }">
    <InventoryAlertBanner />
    <RouterView v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
    <AppFooter class="no-print" />
  </div>
  <SedationDock v-if="showSedationDock" class="no-print" />
  <AppUpdatePrompt />

  <UiModal
    :open="resumeGateOpen"
    title="Previous session found"
    tone="primary"
    confirm-label="Resume patient"
    cancel-label="Start new case"
    :dismiss-on-backdrop="false"
    @confirm="resumeSession"
    @cancel="discardSession"
  >
    A chart from <strong>{{ resumeSavedDate }}</strong> is still loaded. Is this the
    <strong>same patient</strong>?
    <ul class="resume-gate-list">
      <li>
        <strong>{{ resumePatientLine }}</strong>
      </li>
      <li>{{ resumeProcedure }}</li>
      <li>{{ resumeProvider }}</li>
    </ul>
    Choosing <strong>Start new case</strong> permanently clears the loaded chart.
  </UiModal>
</template>

<style scoped>
.resume-gate-list {
  margin: var(--sp-3) 0;
  padding-left: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
}
.resume-gate-list li {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}

/**
 * iOS-style page transition — a short slide in from the right plus fade.
 * Both leaving and entering pages share the same easing so the swap reads
 * as one continuous motion. Respects reduced-motion.
 */
.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--dur-250) var(--ease-decel),
    transform var(--dur-250) var(--ease-decel);
  will-change: opacity, transform;
}
.page-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.page-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: opacity var(--dur-150) linear;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}

/* Reserve room at the bottom for the fixed Sedation Dock so the footer and
   the last Phase 3 card both scroll past it instead of being obscured.
   ~250 px covers the compact dock at its largest comfortable height; the
   expanded sheet floats over content so no extra padding needed for that.
   Transitions match the dock's slide-in/out timing so toggling `has-dock`
   when the dock reveals or hides doesn't make the form content snap. */
.app-shell {
  transition: padding-bottom var(--dur-250) var(--ease-standard);
}
.app-shell.has-dock {
  padding-bottom: calc(250px + env(safe-area-inset-bottom));
}
</style>
