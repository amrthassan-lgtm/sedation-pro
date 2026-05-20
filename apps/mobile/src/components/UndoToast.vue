<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useToastStore } from '@/stores/toast';
import { useUndoStore } from '@/stores/undo';

const toastStore = useToastStore();
const undoStore = useUndoStore();
const { current } = storeToRefs(toastStore);

function onUndo() {
  undoStore.undo();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="current" class="undo-toast-container no-print">
        <div class="undo-toast" :class="`undo-toast--${current.tone}`" role="status">
          <div class="undo-toast-body">
            <div class="undo-toast-action">{{ current.label }}</div>
            <div v-if="current.sub" class="undo-toast-sub">{{ current.sub }}</div>
          </div>
          <button
            type="button"
            class="undo-toast-btn"
            :class="`undo-toast-btn--${current.tone}`"
            @click="onUndo"
          >
            ↶ Undo
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.undo-toast-container {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 72px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9998;
  pointer-events: none;
  width: calc(100% - 32px);
  max-width: 440px;
}
.undo-toast {
  background: rgba(18, 27, 46, 0.98);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--color-border);
  border-left-width: 3px;
  border-radius: var(--r-md);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}
.undo-toast-body {
  flex: 1;
  min-width: 0;
}
.undo-toast-action {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.undo-toast-sub {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}
.undo-toast-btn {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  padding: 8px 14px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text-primary);
  border-radius: var(--r-sm);
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.undo-toast-btn:active {
  transform: scale(0.96);
}

/* Tone accents — match BannerTone palette. */
/* Info-tone toast uses neutral chrome (was accent blue) — severity tones
   below keep their clinical hue. */
.undo-toast--info {
  border-left-color: var(--color-border-strong);
}
.undo-toast--info .undo-toast-btn {
  border-color: var(--color-border-strong);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
.undo-toast--safe {
  border-left-color: var(--color-good);
}
.undo-toast--safe .undo-toast-btn {
  border-color: rgba(74, 222, 128, 0.4);
  background: var(--color-good-soft);
  color: var(--color-good);
}
.undo-toast--caution {
  border-left-color: var(--color-warn);
}
.undo-toast--caution .undo-toast-btn {
  border-color: rgba(250, 204, 21, 0.4);
  background: var(--color-warn-soft);
  color: var(--color-warn);
}
.undo-toast--limit {
  border-left-color: var(--color-danger);
}
.undo-toast--limit .undo-toast-btn {
  border-color: rgba(251, 113, 133, 0.4);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.undo-toast--crisis {
  border-left-color: var(--color-crisis);
}
.undo-toast--crisis .undo-toast-btn {
  border-color: rgba(239, 68, 68, 0.4);
  background: var(--color-crisis-soft);
  color: var(--color-crisis);
}

.toast-enter-active {
  transition:
    opacity var(--dur-250) var(--ease-spring),
    transform var(--dur-250) var(--ease-spring);
}
.toast-leave-active {
  transition:
    opacity var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
