<script setup lang="ts">
import { computed } from 'vue';

import { CART_ACTIONS, GROUP_LABELS, type ActionGroup } from '@/engine/catalog';
import type { Run } from '@/composables/useRun';

import BottomSheet from './BottomSheet.vue';
import VitalsStrip from './VitalsStrip.vue';

/** One drawer of the cart. The same rows, in the same order, in every scenario. */
const props = defineProps<{ run: Run; group: ActionGroup }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const rows = computed(() => CART_ACTIONS.filter((a) => a.group === props.group));
</script>

<template>
  <BottomSheet :title="GROUP_LABELS[group]" @close="emit('close')">
    <template #vitals
      ><VitalsStrip :monitor="run.monitor.value" :said="run.caption.value"
    /></template>
    <div class="group">
      <button
        v-for="a in rows"
        :key="a.id"
        type="button"
        class="row"
        :class="{ 'row--911': a.id === 'call_911' }"
        :aria-pressed="a.kind === 'toggle' ? run.isOn(a.id) : undefined"
        @click="run.act(a.id)"
      >
        <span class="row-main">
          <span class="row-title">{{ a.label }}</span>
        </span>
        <span v-if="a.kind === 'toggle' && run.isOn(a.id)" class="state state--on">On</span>
        <span v-else-if="a.kind === 'instant' && run.done(a.id)" class="state state--on">Done</span>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.row {
  min-height: 60px;
}
.row--911 .row-title {
  color: var(--color-crisis);
  font-weight: var(--weight-bold);
}
.state {
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
