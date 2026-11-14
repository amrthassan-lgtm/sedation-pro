<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

/**
 * A sheet that rises from the bottom and leaves the monitor in view above
 * it: in this app the patient keeps changing while a drawer is open.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    /** `tall` for the draw-up bench, which needs the room. */
    size?: 'half' | 'tall';
  }>(),
  { size: 'half' },
);

const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="sheet-layer">
    <button type="button" class="sheet-backdrop" aria-label="Close" @click="emit('close')"></button>
    <section class="sheet" :class="`sheet--${props.size}`" role="dialog" :aria-label="props.title">
      <header class="sheet-head">
        <h2 class="sheet-title">{{ props.title }}</h2>
        <button type="button" class="pill" @click="emit('close')">Close</button>
      </header>
      <div v-if="$slots.vitals" class="sheet-vitals">
        <slot name="vitals" />
      </div>
      <div class="sheet-body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.sheet-backdrop {
  position: absolute;
  inset: 0;
  background: var(--sheet-scrim);
}
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 56dvh;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  background: var(--color-bg);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: var(--shadow-lg);
  padding-bottom: var(--safe-bottom);
  animation: sheet-up var(--dur-250) var(--ease-decel);
}
.sheet--tall {
  max-height: 74dvh;
}
@keyframes sheet-up {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}
.sheet-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4) var(--sp-2);
}
.sheet-title {
  margin: 0;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
}
.sheet-vitals {
  flex: none;
  padding: var(--sp-2) var(--sp-4);
  background: var(--mon-bg);
}
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
/* The body scrolls; its children keep their height instead of being squeezed. */
.sheet-body > :deep(*) {
  flex-shrink: 0;
}
</style>
