<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView, useRoute } from 'vue-router';

import AppFooter from '@/components/AppFooter.vue';
import SedationDock from '@/components/SedationDock.vue';
import StickyBar from '@/components/StickyBar.vue';
import NavDrawer from '@/components/NavDrawer.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useIVStore } from '@/stores/iv';
import { useRecoveryStore } from '@/stores/recovery';
import { useWakeLock } from '@/composables/useWakeLock';

/** Sedation Dock is only mounted in Phase 3 — every other screen hides it. */
const route = useRoute();
const showSedationDock = computed(() => route.path === '/phase/3');

/**
 * Screen wake-lock for sedation cases. The browser would otherwise dim and
 * sleep the screen mid-procedure — the sticky-bar timers, post-flumazenil
 * monitoring chip, and IV-out countdown all need to stay visible until the
 * patient is discharged.
 *
 * Lifecycle: acquire as soon as the first IV medication is given; release
 * once the IV catheter is removed. Watching `lastIvMedAt` + `ivOutAt`
 * keeps this single source of truth — re-administering a drug after a brief
 * release re-acquires automatically.
 */
const iv = useIVStore();
const recovery = useRecoveryStore();
const { lastIvMedAt } = storeToRefs(iv);
const { ivOutAt } = storeToRefs(recovery);
const wakeLock = useWakeLock();

watch(
  [lastIvMedAt, ivOutAt],
  ([medAt, outAt]) => {
    const shouldHold = medAt !== null && outAt === null;
    if (shouldHold && !wakeLock.active.value) {
      void wakeLock.request();
    } else if (!shouldHold && wakeLock.active.value) {
      void wakeLock.release();
    }
  },
  { immediate: true },
);
</script>

<template>
  <StickyBar />
  <NavDrawer />
  <UndoToast />
  <div class="app-shell" :class="{ 'has-dock': showSedationDock }">
    <RouterView v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
    <AppFooter />
  </div>
  <SedationDock v-if="showSedationDock" />
</template>

<style scoped>
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
   expanded sheet floats over content so no extra padding needed for that. */
.app-shell.has-dock {
  padding-bottom: calc(250px + env(safe-area-inset-bottom));
}
</style>
