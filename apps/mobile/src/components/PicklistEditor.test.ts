import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PicklistEditor from './PicklistEditor.vue';

const ENTRIES = ['Dr. Ada Lovelace', 'Dr. Grace Hopper', 'Dr. Alan Turing'];

function open(entries: ReadonlyArray<string> = ENTRIES, overridden = false) {
  const wrapper = mount(PicklistEditor, {
    props: { label: 'Sedation providers', entries, overridden },
  });
  // The card is collapsed until tapped; every assertion below is about the
  // opened body.
  void wrapper.get('.picklist-head').trigger('click');
  return wrapper;
}

/** Latest payload emitted for `update`, or null if the editor stayed silent. */
function lastUpdate(wrapper: ReturnType<typeof open>): string[] | null {
  const events = wrapper.emitted('update');
  if (!events || events.length === 0) return null;
  return events[events.length - 1]?.[0] as string[];
}

describe('reading the list', () => {
  it('starts collapsed so eight of these do not bury the page', () => {
    const wrapper = mount(PicklistEditor, {
      props: { label: 'Sedation providers', entries: ENTRIES, overridden: false },
    });

    expect(wrapper.find('.picklist-body').exists()).toBe(false);
    expect(wrapper.get('.picklist-head').attributes('aria-expanded')).toBe('false');
  });

  it('opens on tap and lists every entry', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.picklist-entry').map((n) => n.text())).toEqual(ENTRIES);
  });

  it('says what an empty list means rather than showing nothing', async () => {
    const wrapper = open([]);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toMatch(/leaves the matching field blank/i);
  });
});

describe('editing', () => {
  it('appends a trimmed entry', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();
    await wrapper.get('.picklist-add input').setValue('  Dr. Katherine Johnson  ');

    await wrapper.get('.picklist-add button').trigger('click');

    expect(lastUpdate(wrapper)).toEqual([...ENTRIES, 'Dr. Katherine Johnson']);
  });

  /**
   * These names print verbatim on a note, so two spellings of one clinician
   * must not both land on the roster.
   */
  it('refuses a duplicate regardless of case and says so', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();

    await wrapper.get('.picklist-add input').setValue('dr. ada lovelace');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.picklist-add button').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toMatch(/already on the list/i);
    expect(lastUpdate(wrapper)).toBeNull();
  });

  it('removes the entry that was tapped, not the one beside it', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();

    await wrapper.get('[aria-label="Remove Dr. Grace Hopper"]').trigger('click');

    expect(lastUpdate(wrapper)).toEqual(['Dr. Ada Lovelace', 'Dr. Alan Turing']);
  });

  /**
   * Order is not cosmetic here: the head of the list is what a new case is
   * pre-filled with, so moving an entry up is how a practice changes its
   * default provider.
   */
  it('swaps an entry with its neighbour when moved', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();

    await wrapper.get('[aria-label="Move Dr. Grace Hopper up"]').trigger('click');

    expect(lastUpdate(wrapper)).toEqual([
      'Dr. Grace Hopper',
      'Dr. Ada Lovelace',
      'Dr. Alan Turing',
    ]);
  });

  it('cannot move the ends off either edge', async () => {
    const wrapper = open();
    await wrapper.vm.$nextTick();

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
    const untouched = open(ENTRIES, false);
    await untouched.vm.$nextTick();
    expect(untouched.text()).not.toMatch(/Restore the shipped list/i);

    const edited = open(ENTRIES, true);
    await edited.vm.$nextTick();
    expect(edited.text()).toMatch(/Restore the shipped list/i);
  });

  it('emits restore rather than guessing the shipped list itself', async () => {
    const wrapper = open(ENTRIES, true);
    await wrapper.vm.$nextTick();

    const restore = wrapper.findAll('button').find((b) => /Restore the shipped/i.test(b.text()));
    await restore?.trigger('click');

    expect(wrapper.emitted('restore')).toHaveLength(1);
  });
});
