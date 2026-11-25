import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { Run } from '@/composables/useRun';
import type { ActionGroup } from '@/engine/catalog';
import type { MonitorView, Prompt } from '@/engine/types';

import DrawerSheet from './DrawerSheet.vue';

const monitor: MonitorView = {
  hr: 62,
  spo2: 96,
  etco2: 54,
  rr: 6,
  bagged: false,
  capno: 'normal',
  rhythm: 'sinus',
  nibp: null,
  cuffCycling: false,
  perfusion: 1,
  alarms: [],
  alarmLevel: 'none',
};

/** Just the parts of a run a drawer reads. */
function drawer(
  group: ActionGroup,
  state: { on?: string[]; done?: string[]; prompt?: Prompt } = {},
) {
  const act = vi.fn();
  const answer = vi.fn();
  const run = {
    isOn: (id: string) => (state.on ?? []).includes(id),
    done: (id: string) => (state.done ?? []).includes(id),
    monitor: ref(monitor),
    caption: ref(null),
    prompt: ref(state.prompt ?? null),
    act,
    answer,
  } as unknown as Run;
  const wrapper = mount(DrawerSheet, { props: { run, group } });
  const button = (label: string) =>
    wrapper.findAll('button.act').find((b) => b.find('.row-title').text() === label)!;
  return { wrapper, act, answer, button };
}

const titles = (wrapper: ReturnType<typeof drawer>['wrapper']) =>
  wrapper.findAll('button.act .row-title').map((t) => t.text());

describe('a drawer of the cart (owner, Nov 2026)', () => {
  it('shows its acts as buttons, in the catalog’s order', () => {
    expect(titles(drawer('team').wrapper)).toEqual(['Stop the procedure', 'Call 911']);
    expect(titles(drawer('position').wrapper)).toEqual([
      'Lie flat, legs up',
      'Sit up',
      'Turn to the side, head down',
    ]);
    expect(titles(drawer('breathing').wrapper)).toEqual([
      'N₂O off, 100% O₂',
      'BVM',
      'Tight mask seal',
      'Stimulate',
    ]);
    expect(titles(drawer('circulation').wrapper)).toEqual(['Saline bolus']);
  });

  it('the Airway drawer is in three parts, each under its heading, with coughing among the last', () => {
    const { wrapper } = drawer('airway');
    expect(wrapper.findAll('.head').map((h) => h.text())).toEqual([
      'Open the airway',
      'Airway devices',
      'Something in the throat',
    ]);
    const parts = wrapper
      .findAll('.acts')
      .map((grid) => grid.findAll('.row-title').map((t) => t.text()));
    expect(parts).toEqual([
      ['Jaw thrust', 'Suction', 'Pressure at the laryngospasm notch'],
      ['NPA'],
      ['Encourage coughing', 'Back blows', 'Abdominal thrusts', 'Magill forceps', 'Finger sweep'],
    ]);
  });

  it('a drawer with no parts has no heading', () => {
    for (const group of ['team', 'position', 'breathing', 'circulation'] as const) {
      const { wrapper } = drawer(group);
      expect(wrapper.find('.head').exists(), group).toBe(false);
      expect(wrapper.findAll('.acts'), group).toHaveLength(1);
    }
  });

  it('the practice’s own equipment is the second line of its button, and only of its button', () => {
    const { wrapper, button } = drawer('breathing');
    expect(button('N₂O off, 100% O₂').find('.row-sub').text()).toBe('Porter flowmeter');
    expect(button('BVM').find('.row-sub').text()).toBe('Ambu bag');
    expect(button('Tight mask seal').find('.row-sub').text()).toBe('Ambu bag and mask');
    expect(button('Stimulate').find('.row-sub').exists()).toBe(false);
    expect(wrapper.findAll('.row-sub')).toHaveLength(3);

    const airway = drawer('airway');
    expect(airway.button('Suction').find('.row-sub').text()).toBe('Yankauer');
    expect(airway.button('NPA').find('.row-sub').text()).toBe('NasoSafe');
    expect(drawer('circulation').button('Saline bolus').find('.row-sub').text()).toBe('NS bag');
  });

  it('a tap still acts, on the act that was tapped', async () => {
    const { act, button } = drawer('airway');
    await button('Jaw thrust').trigger('click');
    await button('Encourage coughing').trigger('click');
    expect(act.mock.calls).toEqual([['jaw_thrust'], ['encourage_cough']]);
  });

  it('a toggle that is on says On, and an act that was done says Done', () => {
    const airway = drawer('airway', { on: ['jaw_thrust'], done: ['suction'] });
    expect(airway.button('Jaw thrust').find('.state').text()).toBe('On');
    expect(airway.button('Jaw thrust').attributes('aria-pressed')).toBe('true');
    expect(airway.button('Suction').find('.state').text()).toBe('Done');
    expect(airway.button('Suction').attributes('aria-pressed')).toBeUndefined();
    expect(airway.button('NPA').find('.state').exists()).toBe(false);
    expect(airway.button('NPA').attributes('aria-pressed')).toBe('false');
    expect(airway.wrapper.findAll('.state')).toHaveLength(2);
  });

  it('Call 911 keeps its red', () => {
    const { wrapper, button } = drawer('team');
    expect(button('Call 911').classes()).toContain('act--911');
    expect(wrapper.findAll('.act--911')).toHaveLength(1);
  });

  it('a question asked while the drawer is open is shown in it, and answered from it', async () => {
    const question: Prompt = {
      id: 'front_desk_911',
      voice: { who: 'Front desk', line: 'Do you want me to call 911?' },
      options: [
        { id: 'call', label: 'Call 911' },
        { id: 'not_yet', label: 'Not yet' },
      ],
    };
    const { wrapper, answer } = drawer('breathing', { prompt: question });
    expect(wrapper.find('.ask').text()).toContain('Do you want me to call 911?');
    const options = wrapper.findAll('.ask-options .btn');
    expect(options.map((b) => b.text())).toEqual(['Call 911', 'Not yet']);
    await options[1]?.trigger('click');
    expect(answer).toHaveBeenCalledWith('not_yet');
  });
});
