<script setup lang="ts">
import { computed, ref } from 'vue';

import { CART_DEVICES, CART_VIALS } from '@/engine/catalog';
import { trayName } from '@/engine/syringe';
import type { Run } from '@/composables/useRun';

import BottomSheet from './BottomSheet.vue';
import VitalsStrip from './VitalsStrip.vue';

/**
 * The drug tray: every vial and device on the cart, always in the same
 * order, each named with its stocked form and never with a dose.
 */
const props = defineProps<{ run: Run }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'vial', key: string): void;
  (e: 'device', id: string): void;
  (e: 'syringe', id: string): void;
}>();

const query = ref('');

const vials = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q === '') return CART_VIALS;
  return CART_VIALS.filter((v) =>
    [v.name, ...v.aliases].some((word) => word.toLowerCase().includes(q)),
  );
});

function left(id: string): string {
  const n = props.run.remaining(id);
  if (n === null) return '';
  return n === 0 ? 'Used' : `${n} on the cart`;
}
</script>

<template>
  <BottomSheet title="Drug tray" @close="emit('close')">
    <template #vitals>
      <VitalsStrip
        :monitor="run.monitor.value"
        :said="run.caption.value"
        :prompt="run.prompt.value"
        @answer="run.answer"
      />
    </template>
    <template v-if="run.tray.value.length > 0">
      <p class="eyebrow">Drawn up</p>
      <div class="group">
        <button
          v-for="s in run.tray.value"
          :key="s.id"
          type="button"
          class="row"
          @click="emit('syringe', s.id)"
        >
          <span
            class="swatch"
            :style="{ background: s.labeled && s.tint ? s.tint : 'var(--color-slate)' }"
          ></span>
          <span class="row-main">
            <span class="row-title">{{ trayName(s) }}</span>
            <span class="row-sub mono"
              >{{ s.volumeMl.toFixed(1) }} ml in a {{ s.sizeMl }} ml syringe</span
            >
          </span>
        </button>
      </div>
    </template>

    <p class="eyebrow">Auto-injectors and inhaler</p>
    <div class="group">
      <button
        v-for="d in CART_DEVICES"
        :key="d.id"
        type="button"
        class="row"
        :disabled="run.remaining(d.id) === 0"
        @click="emit('device', d.id)"
      >
        <span class="swatch" :style="{ background: d.tint }"></span>
        <span class="row-main">
          <span class="row-title">{{ d.label }}</span>
          <span class="row-sub">{{ d.detail }}</span>
        </span>
        <span class="row-end">{{ left(d.id) }}</span>
      </button>
    </div>

    <p class="eyebrow">Vials and ampules</p>
    <input
      v-model="query"
      class="search"
      type="search"
      placeholder="Search the tray"
      aria-label="Search the tray"
      autocomplete="off"
    />
    <div class="group">
      <button
        v-for="v in vials"
        :key="v.key"
        type="button"
        class="row"
        @click="emit('vial', v.key)"
      >
        <span class="swatch" :style="{ background: v.tint }"></span>
        <span class="row-main">
          <span class="row-title">{{ v.name }}</span>
          <span class="row-sub">{{ v.presentation }}</span>
        </span>
      </button>
      <p v-if="vials.length === 0" class="row row-sub">Not on the cart</p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.swatch {
  flex: none;
  width: 10px;
  height: 32px;
  border-radius: var(--r-pill);
}
.row:disabled {
  color: var(--color-text-disabled);
}
.row:disabled .row-sub,
.row:disabled .swatch {
  opacity: 0.4;
}
.search {
  min-height: 44px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  border: 1px solid var(--color-border);
  background: var(--color-input-bg);
  color: var(--color-text-primary);
  font: inherit;
}
.search:focus {
  outline: none;
  border-color: var(--color-border-strong);
}
</style>
