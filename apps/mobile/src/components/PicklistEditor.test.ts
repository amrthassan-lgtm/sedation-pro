import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PicklistEditor from './PicklistEditor.vue';

const ENTRIES = ['Dr. Ada Lovelace', 'Dr. Grace Hopper', 'Dr. Alan Turing'];

type Editor = ReturnType<typeof mount<typeof PicklistEditor>>;

function mountEditor(entries: ReadonlyArray<string> = ENTRIES, overridden = false): Editor {
  return mount(PicklistEditor, {
    props: { label: 'Sedation providers', entries, overridden },
  });
}

/** Open the card — everything below the header is behind the disclosure. */
async function open(entries: ReadonlyArray<string> = ENTRIES, overridden = false): Promise<Editor> {
  const wrapper = mountEditor(entries, overridden);
  await wrapper.get('.pl-disclosure').trigger('click');
  return wrapper;
}

/** Open and enter Edit mode, where the destructive controls live. */
async function edit(entries: ReadonlyArray<string> = ENTRIES): Promise<Editor> {
  const wrapper = await open(entries);
  await wrapper.get('.pl-edit').trigger('click');
  return wrapper;
}

function lastUpdate(wrapper: Editor): string[] | null {
  const events = wrapper.emitted('update');
  if (!events || events.length === 0) return null;
  return events[events.length - 1]?.[0] as string[];
}

describe('reading the list', () => {
  it('starts collapsed so eight of these do not bury the page', () => {
    const wrapper = mountEditor();

    expect(wrapper.find('.pl-body').exists()).toBe(false);
    expect(wrapper.get('.pl-disclosure').attributes('aria-expanded')).toBe('false');
  });

  it('opens on tap and lists every entry', async () => {
    const wrapper = await open();

    expect(wrapper.findAll('.pl-entry').map((n) => n.text())).toEqual(ENTRIES);
  });

  /**
   * The resting state is for reading the roster, so the destructive and
   * reordering controls stay behind Edit rather than putting three buttons
   * on every row.
   */
  it('shows no per-row controls until Edit is tapped', async () => {
    const wrapper = await open();
    expect(wrapper.find('.pl-remove').exists()).toBe(false);
    expect(wrapper.find('.pl-arrow').exists()).toBe(false);

    await wrapper.get('.pl-edit').trigger('click');

    expect(wrapper.findAll('.pl-remove')).toHaveLength(ENTRIES.length);
  });

  it('offers no Edit affordance on an empty list', async () => {
    const wrapper = await open([]);

    expect(wrapper.find('.pl-edit').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/leaves the matching field blank/i);
  });

  /**
   * Reopening must not drop the clinician back into a half-finished edit
   * they have since forgotten about.
   */
  it('leaves Edit mode when the card is collapsed', async () => {
    const wrapper = await edit();

    await wrapper.get('.pl-disclosure').trigger('click');
    await wrapper.get('.pl-disclosure').trigger('click');

    expect(wrapper.find('.pl-remove').exists()).toBe(false);
  });
});

describe('adding', () => {
  it('appends a trimmed entry', async () => {
    const wrapper = await open();
    await wrapper.get('.pl-add').trigger('click');
    await wrapper.get('.pl-row-add input').setValue('  Dr. Katherine Johnson  ');

    await wrapper.get('.pl-action.is-primary').trigger('click');

    expect(lastUpdate(wrapper)).toEqual([...ENTRIES, 'Dr. Katherine Johnson']);
  });

  /**
   * These names print verbatim on a note, so two spellings of one clinician
   * must not both land on the roster.
   */
  it('refuses a duplicate regardless of case and says so', async () => {
    const wrapper = await open();
    await wrapper.get('.pl-add').trigger('click');

    await wrapper.get('.pl-row-add input').setValue('dr. ada lovelace');

    expect(wrapper.get('.pl-action.is-primary').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toMatch(/already on the list/i);
    expect(lastUpdate(wrapper)).toBeNull();
  });

  it('discards the draft on cancel', async () => {
    const wrapper = await open();
    await wrapper.get('.pl-add').trigger('click');
    await wrapper.get('.pl-row-add input').setValue('Dr. Katherine Johnson');

    await wrapper.get('.pl-action:not(.is-primary)').trigger('click');

    expect(lastUpdate(wrapper)).toBeNull();
    expect(wrapper.find('.pl-row-add').exists()).toBe(false);
  });
});

describe('editing', () => {
  it('removes the entry that was tapped, not the one beside it', async () => {
    const wrapper = await edit();

    await wrapper.get('[aria-label="Remove Dr. Grace Hopper"]').trigger('click');

    expect(lastUpdate(wrapper)).toEqual(['Dr. Ada Lovelace', 'Dr. Alan Turing']);
  });

  /**
   * Order is not cosmetic: the head of the list is what a new case is
   * pre-filled with, so moving an entry up is how a practice changes its
   * default provider.
   */
  it('swaps an entry with its neighbour when moved', async () => {
    const wrapper = await edit();

    await wrapper.get('[aria-label="Move Dr. Grace Hopper up"]').trigger('click');

    expect(lastUpdate(wrapper)).toEqual([
      'Dr. Grace Hopper',
      'Dr. Ada Lovelace',
      'Dr. Alan Turing',
    ]);
  });

  it('cannot move the ends off either edge', async () => {
    const wrapper = await edit();

    expect(
      wrapper.get('[aria-label="Move Dr. Ada Lovelace up"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.get('[aria-label="Move Dr. Alan Turing down"]').attributes('disabled'),
    ).toBeDefined();
  });
});

describe('restoring', () => {
  it('offers a restore only once the list has been customised', async () => {
    expect((await open(ENTRIES, false)).find('.pl-restore').exists()).toBe(false);
    expect((await open(ENTRIES, true)).find('.pl-restore').exists()).toBe(true);
  });

  it('emits restore rather than guessing the shipped list itself', async () => {
    const wrapper = await open(ENTRIES, true);

    await wrapper.get('.pl-restore').trigger('click');

    expect(wrapper.emitted('restore')).toHaveLength(1);
  });
});
