<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from 'vue';

/**
 * "Update ready" affordance for the installed PWA.
 *
 * The service worker is `registerType: 'autoUpdate'` (skipWaiting +
 * clientsClaim), so a fresh deploy's worker takes control of the running
 * page as soon as it's downloaded — but the PAGE keeps showing the old
 * bundle until the next reload. Without this prompt the only path to new
 * content is closing and reopening the app twice, which already confused
 * a real update rollout once. We watch for the mid-session controller
 * takeover and offer a one-tap reload instead.
 *
 * First-install guard: `controllerchange` also fires when the very first
 * worker claims the page; only a takeover from an EXISTING controller
 * means "newer build available".
 */
const updateReady = ref(false);

let removeListener: (() => void) | null = null;

onMounted(() => {
  if (!('serviceWorker' in navigator)) return;
  const hadController = navigator.serviceWorker.controller !== null;
  const onChange = () => {
    if (hadController) updateReady.value = true;
  };
  navigator.serviceWorker.addEventListener('controllerchange', onChange);
  removeListener = () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
});

onScopeDispose(() => removeListener?.());

function reloadNow(): void {
  window.location.reload();
}
</script>

<template>
  <transition name="update-pop">
    <div v-if="updateReady" class="update-prompt no-print" role="status">
      <span class="update-prompt-text">App updated</span>
      <button type="button" class="update-prompt-btn" @click="reloadNow">Reload</button>
      <button
        type="button"
        class="update-prompt-close"
        aria-label="Not now"
        @click="updateReady = false"
      >
        ✕
      </button>
    </div>
  </transition>
</template>

<style scoped>
.update-prompt {
  position: fixed;
  left: 50%;
  bottom: calc(var(--sp-5) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  /* Above the SedationDock (89-91) so the Reload pill stays reachable on
     Phase 3; below the sticky bar (100) and drawer. */
  z-index: 95;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px 10px 16px;
  border-radius: var(--r-pill);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-lg);
}
.update-prompt-text {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
/* Muted chrome per the house button doctrine: hierarchy comes from
   weight + border, not a bright accent fill. */
.update-prompt-btn {
  padding: 6px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.update-prompt-btn:active {
  transform: scale(0.96);
}
.update-prompt-close {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: var(--type-footnote);
  cursor: pointer;
  transition: transform var(--dur-150) var(--ease-standard);
}
.update-prompt-close:active {
  transform: scale(0.96);
}
.update-pop-enter-active,
.update-pop-leave-active {
  transition:
    opacity var(--dur-250) var(--ease-standard),
    transform var(--dur-250) var(--ease-standard);
}
.update-pop-enter-from,
.update-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
