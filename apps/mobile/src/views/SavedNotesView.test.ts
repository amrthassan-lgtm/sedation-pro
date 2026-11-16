import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import SavedNotesView from './SavedNotesView.vue';
import type { ClinicalNote } from '@/composables/useClinicalNote';
import { useNoteArchiveStore } from '@/stores/note-archive';

const NOTE: ClinicalNote = {
  header: {
    practice: 'Test Practice',
    patient: 'Testpatient, Sample',
    mrn: '4242',
    date: 'November 9, 2026',
    provider: 'Dr. Jordan Rivera',
    assistants: 'Alex Morgan, EFDA',
    procedure: 'Extraction',
  },
  narrative: [],
  sections: [],
  chronology: [],
  signatures: { providerDataUrl: null, signedAt: null },
  disposition: { kind: 'sedation', released: true, at: '10:40 AM' },
  generatedAt: '',
};

/** Saved Notes with one note, in Edit, after a tap on its "−". */
async function tapRemove() {
  setActivePinia(createPinia());
  const archive = useNoteArchiveStore();
  archive.freeze({ kind: 'sedation', patientName: 'Testpatient, Sample', mrn: '4242', note: NOTE });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/notes');
  await router.isReady();
  const w = mount(SavedNotesView, { global: { plugins: [router] }, attachTo: document.body });
  await w.get('.sn-edit').trigger('click');
  await w.get('.sn-remove').trigger('click');
  return { w, archive };
}

function modalButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>('.ui-modal-btn')].find(
    (b) => b.textContent?.trim() === label,
  );
}

describe('deleting a saved note asks first (v1 audit)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('a tap on "−" names the note and deletes nothing yet', async () => {
    const { w, archive } = await tapRemove();
    expect(archive.count).toBe(1);
    expect(document.body.textContent).toContain('Delete this note?');
    expect(document.body.textContent).toContain('Testpatient, Sample');
    expect(document.body.textContent).toContain('cannot be recovered');
    w.unmount();
  });

  it('Keep it keeps the note', async () => {
    const { w, archive } = await tapRemove();
    modalButton('Keep it')?.click();
    await flushPromises();
    expect(archive.count).toBe(1);
    expect(document.body.textContent).not.toContain('Delete this note?');
    w.unmount();
  });

  it('only Delete note deletes it', async () => {
    const { w, archive } = await tapRemove();
    modalButton('Delete note')?.click();
    await flushPromises();
    expect(archive.count).toBe(0);
    w.unmount();
  });
});
