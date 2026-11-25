<script setup lang="ts">
import { computed } from 'vue';

import { drawerSections, GROUP_LABELS, type ActionGroup } from '@/engine/catalog';
import type { Run } from '@/composables/useRun';

import BottomSheet from './BottomSheet.vue';
import VitalsStrip from './VitalsStrip.vue';

/**
 * One drawer of the cart, laid out from the catalog: the same buttons, in the
 * same places, in every scenario. Buttons and not a list, three across (two
 * on a phone), so a whole drawer is on the tablet at once and nothing there
 * is found by scrolling.
 */
const props = defineProps<{ run: Run; group: ActionGroup }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const sections = computed(() => drawerSections(props.group));
</script>

<template>
  <BottomSheet :title="GROUP_LABELS[group]" @close="emit('close')">
    <template #vitals>
      <VitalsStrip
        :monitor="run.monitor.value"
        :said="run.caption.value"
        :prompt="run.prompt.value"
        @answer="run.answer"
      />
    </template>
    <template v-for="s in sections" :key="s.heading ?? group">
      <h3 v-if="s.heading" class="eyebrow head">{{ s.heading }}</h3>
      <div class="acts">
        <button
          v-for="a in s.actions"
          :key="a.id"
          type="button"
          class="act"
          :class="{ 'act--911': a.id === 'call_911' }"
          :aria-pressed="a.kind === 'toggle' ? run.isOn(a.id) : undefined"
          @click="run.act(a.id)"
        >
          <span class="row-main">
            <span class="row-title">{{ a.label }}</span>
            <span v-if="a.kit" class="row-sub">{{ a.kit }}</span>
          </span>
          <span v-if="a.kind === 'toggle' && run.isOn(a.id)" class="state state--on">On</span>
          <span v-else-if="a.kind === 'instant' && run.done(a.id)" class="state state--on"
            >Done</span
          >
        </button>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.acts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}
@media (max-width: 480px) {
  .acts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* The dock's tile, so a drawer reads as more of the same cart. */
.act {
  min-height: 64px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--surface-highlight), var(--color-surface-elevated);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  text-align: left;
}
.act:active {
  transform: scale(0.98);
}
.act--911 .row-title {
  color: var(--color-crisis);
  font-weight: var(--weight-bold);
}
.head {
  margin: var(--sp-3) 0 var(--sp-1) var(--sp-4);
}
.head:first-child {
  margin-top: 0;
}
.state {
  flex: none;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  padding: 4px 10px;
  border-radius: var(--r-pill);
}
.state--on {
  background: var(--color-good-soft);
  color: var(--color-good);
}
</style>
