<script setup lang="ts">
import { RouterView } from 'vue-router';

import StickyBar from '@/components/StickyBar.vue';
import NavDrawer from '@/components/NavDrawer.vue';
import UndoToast from '@/components/UndoToast.vue';
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
