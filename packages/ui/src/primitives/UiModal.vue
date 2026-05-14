<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

interface Props {
  open: boolean;
  title: string;
  /** Tone of the confirm button — and the title color accent. */
  tone?: 'neutral' | 'danger' | 'primary';
  /** Whether tapping the backdrop dismisses. Defaults to true. */
  dismissOnBackdrop?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button disabled — used for typed-justification gates. */
  confirmDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  dismissOnBackdrop: true,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  confirmDisabled: false,
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function onBackdropClick() {
  if (props.dismissOnBackdrop) emit('cancel');
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    emit('cancel');
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document === 'undefined') return;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  },
);

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', onEscape);
  }
});
onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onEscape);
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-modal">
      <div v-if="open" class="ui-modal-overlay" role="presentation" @click="onBackdropClick">
        <div
          class="ui-modal"
          :class="`ui-modal--${tone}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`ui-modal-title`"
          @click.stop
        >
          <header class="ui-modal-header">
            <h2 id="ui-modal-title" class="ui-modal-title">{{ title }}</h2>
          </header>
          <div class="ui-modal-body">
            <slot />
          </div>
          <footer class="ui-modal-actions">
            <button type="button" class="ui-modal-btn ui-modal-btn--cancel" @click="emit('cancel')">
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="ui-modal-btn"
              :class="`ui-modal-btn--${tone}`"
              :disabled="confirmDisabled"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-5);
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
}

.ui-modal {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  padding: var(--sp-5);
  max-width: 360px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}

.ui-modal-header {
  margin-bottom: var(--sp-2);
}
.ui-modal-title {
  margin: 0;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  line-height: 1.3;
}
.ui-modal--danger .ui-modal-title {
  color: var(--color-danger);
}

.ui-modal-body {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
  line-height: 1.55;
  margin-bottom: var(--sp-5);
}

.ui-modal-actions {
  display: flex;
  gap: var(--sp-3);
}

.ui-modal-btn {
  flex: 1;
  padding: 13px;
  border-radius: var(--r-md);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
  -webkit-tap-highlight-color: transparent;
}
.ui-modal-btn:active {
  transform: scale(0.98);
}
.ui-modal-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ui-modal-btn--cancel {
  /* Same as default neutral. */
}
.ui-modal-btn--danger {
  background: var(--color-danger-soft);
  border-color: rgba(251, 113, 133, 0.4);
  color: var(--color-danger);
}
.ui-modal-btn--primary {
  background: var(--color-accent-soft);
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--color-accent);
}
.ui-modal-btn--neutral {
  background: var(--color-surface-overlay);
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
}

.ui-modal-enter-active {
  transition:
    opacity var(--dur-250) var(--ease-spring),
    transform var(--dur-250) var(--ease-spring);
}
.ui-modal-leave-active {
  transition:
    opacity var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-modal-enter-from,
.ui-modal-leave-to {
  opacity: 0;
}
.ui-modal-enter-from .ui-modal,
.ui-modal-leave-to .ui-modal {
  transform: scale(0.94) translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .ui-modal-enter-active,
  .ui-modal-leave-active {
    transition: opacity var(--dur-150) linear;
  }
  .ui-modal-enter-from .ui-modal,
  .ui-modal-leave-to .ui-modal {
    transform: none;
  }
}
</style>
