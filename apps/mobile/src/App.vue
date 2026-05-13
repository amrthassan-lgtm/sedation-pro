<script setup lang="ts">
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView } from 'vue-router';

import StickyBar from '@/components/StickyBar.vue';
import NavDrawer from '@/components/NavDrawer.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useIVStore } from '@/stores/iv';
import { useRecoveryStore } from '@/stores/recovery';
import { useWakeLock } from '@/composables/useWakeLock';

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
  <RouterView v-slot="{ Component }">
    <transition name="page" mode="out-in">
      <component :is="Component" />
    </transition>
  </RouterView>
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
</style>
