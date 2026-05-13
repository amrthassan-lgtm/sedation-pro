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
.page-enter-active,
.page-leave-active {
  transition: opacity var(--dur-250) var(--ease-decel);
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
