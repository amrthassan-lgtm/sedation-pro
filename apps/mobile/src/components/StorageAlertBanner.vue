<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { UiBanner } from '@sedation-pro/ui';

import { storageLow, unsavedKeys } from '@/stores/persistence';

/**
 * The tablet's storage, before it costs a record.
 *
 * "Full" means a save has failed and something on screen is not saved. It
 * cannot be put away, because the case is at risk on the next reload. "Almost
 * full" means only a few more signed notes fit: a warning while there is
 * still time to act, which can be put away until the app is next opened.
 *
 * Saved notes are what fill the tablet, so the way out is always the same:
 * delete the ones already in Open Dental or printed. The protocol pages never
 * show it.
 */
const route = useRoute();
const router = useRouter();

const full = computed(() => unsavedKeys.value.length > 0);
const lowPutAway = ref(false);

const visible = computed(
  () =>
    !route.path.startsWith('/quick-reference') &&
    (full.value || (storageLow.value && !lowPutAway.value)),
);
const onSavedNotes = computed(() => route.path === '/notes');

const title = computed(() =>
  full.value ? 'Storage is full: changes are not being saved' : 'Storage is almost full',
);
const detail = computed(() =>
  full.value
    ? 'Delete notes you no longer need in Saved Notes: ones already in Open Dental, or printed. Sending to the chart waits until there is room.'
    : 'Only a few more signed notes fit on this tablet. Delete notes you no longer need in Saved Notes: ones already in Open Dental, or printed.',
);

function openSavedNotes(): void {
  void router.push('/notes');
}
</script>

<template>
  <UiBanner
    v-if="visible"
    class="storage-alert no-print"
    :tone="full ? 'limit' : 'caution'"
    icon="warning"
    :title="title"
  >
    <p class="storage-alert-detail">{{ detail }}</p>
    <div v-if="!onSavedNotes || !full" class="storage-alert-actions">
      <button
        v-if="!onSavedNotes"
        type="button"
        class="storage-alert-btn storage-alert-btn--primary"
        @click="openSavedNotes"
      >
        Open Saved Notes
      </button>
      <button v-if="!full" type="button" class="storage-alert-btn" @click="lowPutAway = true">
        Not now
      </button>
    </div>
  </UiBanner>
</template>

<style scoped>
.storage-alert {
  margin: var(--sp-4) var(--sp-4) 0;
}
.storage-alert-detail {
  margin: 0 0 var(--sp-2);
}
.storage-alert-actions {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
/* The same pills as the inventory banner beside it. */
.storage-alert-btn {
  font-size: var(--type-footnote);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}
.storage-alert-btn--primary {
  background: var(--color-text-primary);
  color: var(--color-bg);
  font-weight: var(--weight-bold);
}
.storage-alert-btn:active {
  transform: scale(0.97);
}
</style>
