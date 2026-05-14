<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import AppFooter from '@/components/AppFooter.vue';
import SedationDock from '@/components/SedationDock.vue';
import StickyBar from '@/components/StickyBar.vue';
import NavDrawer from '@/components/NavDrawer.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useDockVisibility } from '@/composables/useDockVisibility';
import { useWakeLock } from '@/composables/useWakeLock';

/** Sedation Dock is only mounted in Phase 3 — every other screen hides it. */
const route = useRoute();
const showSedationDock = computed(() => route.path === '/phase/3');

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
</script>

<template>
  <StickyBar />
  <NavDrawer />
  <UndoToast />
  <div class="app-shell" :class="{ 'has-dock': dockReservesSpace }">
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
