<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { UiCard } from '@sedation-pro/ui';

import { useNoteArchiveStore, type FrozenNote } from '@/stores/note-archive';

/**
 * Signed notes from finished encounters.
 *
 * The live note is a projection of whatever is in the stores right now, so
 * an assessment note stops existing the moment the sedation visit starts
 * dosing. These are the frozen copies — what was actually signed, kept
 * across "Start new case" so the second visit can be worked without losing
 * the first one's record.
 */
const router = useRouter();
const archive = useNoteArchiveStore();
const editing = ref(false);

const notes = computed(() => archive.byNewest);

function openNote(id: string): void {
  void router.push(`/notes/${id}`);
}

function describe(n: FrozenNote): string {
  const when = new Date(n.frozenAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const kind = n.kind === 'assessment' ? 'Assessment' : 'Sedation';
  return `MRN ${n.mrn || '—'} · ${when} · ${kind}`;
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Records</p>
      <h1 class="title-display">Saved Notes</h1>
    </header>

    <UiCard v-if="notes.length === 0">
      <p class="heading">Nothing saved yet</p>
      <p class="sn-note mt-1">
        A note is saved here automatically once the encounter is concluded and signed. It stays
        after you start a new case, so an assessment note is still here at the sedation visit.
      </p>
    </UiCard>

    <UiCard v-else>
      <div class="sn-head">
        <span class="sn-head-text">
          <span class="sn-title">{{ notes.length }} saved</span>
          <span class="sn-sub">Concluded and signed encounters</span>
        </span>
        <button type="button" class="sn-edit" @click="editing = !editing">
          {{ editing ? 'Done' : 'Edit' }}
        </button>
      </div>

      <ul class="sn-rows">
        <li v-for="n in notes" :key="n.id" class="sn-row">
          <button
            v-if="editing"
            type="button"
            class="sn-remove"
            :aria-label="`Delete the note for ${n.patientName}`"
            @click="archive.remove(n.id)"
          >
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" class="sn-open" @click="openNote(n.id)">
            <span class="sn-row-text">
              <span class="sn-name">{{ n.patientName || 'Unnamed patient' }}</span>
              <span class="sn-meta">{{ describe(n) }}</span>
            </span>
            <span class="sn-chevron" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
    </UiCard>
  </main>
</template>

<style scoped>
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}
.sn-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.sn-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.sn-title {
  font-size: var(--type-heading);
  font-weight: 600;
}
.sn-sub,
.sn-meta,
.sn-note {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.sn-note {
  margin: 0;
}
.sn-edit {
  flex-shrink: 0;
  background: none;
  border: 0;
  padding: var(--sp-2);
  margin: calc(var(--sp-2) * -1);
  font: inherit;
  font-size: var(--type-body);
  color: var(--color-accent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sn-rows {
  list-style: none;
  margin: var(--sp-3) 0 0;
  padding: 0;
}
.sn-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  border-top: 1px solid var(--color-border);
}
.sn-row:first-child {
  border-top: 0;
}
.sn-open {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: var(--sp-2) 0;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sn-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.sn-name {
  font-size: var(--type-body);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.sn-chevron {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--color-text-disabled);
  line-height: 1;
}
.sn-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--color-danger);
  color: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
</style>
