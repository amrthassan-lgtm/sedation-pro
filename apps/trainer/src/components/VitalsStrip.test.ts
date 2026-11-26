import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { MonitorView, Prompt } from '@/engine/types';

import VitalsStrip from './VitalsStrip.vue';

const monitor: MonitorView = {
  hr: 80,
  spo2: 97,
  etco2: 38,
  rr: 14,
  bagged: false,
  capno: 'normal',
  rhythm: 'sinus',
  nibp: null,
  cuffCycling: false,
  perfusion: 1,
  alarms: [],
  alarmLevel: 'none',
};

const question: Prompt = {
  id: 'late_911',
  voice: { who: 'Front desk', line: 'Do you still want an ambulance?' },
  options: [
    { id: 'call', label: 'Call 911' },
    { id: 'no', label: 'No, we will watch him' },
  ],
};

describe('a question asked while a drawer is open', () => {
  it('is shown in the drawer with its answers, in place of the last line said', () => {
    const strip = mount(VitalsStrip, {
      props: { monitor, said: { who: 'DA', line: 'Pen’s in.' }, prompt: question },
    });
    expect(strip.text()).toContain('Do you still want an ambulance?');
    expect(strip.text()).not.toContain('Pen’s in.');
    expect(strip.findAll('.ask-options .btn').map((b) => b.text())).toEqual([
      'Call 911',
      'No, we will watch him',
    ]);
  });

  it('is answered from the drawer', async () => {
    const strip = mount(VitalsStrip, { props: { monitor, said: null, prompt: question } });
    await strip.findAll('.ask-options .btn')[1]?.trigger('click');
    expect(strip.emitted('answer')?.[0]).toEqual(['no']);
  });

  it('with no question open, the strip shows the last line as before', () => {
    const strip = mount(VitalsStrip, {
      props: { monitor, said: { who: 'DA', line: 'Pen’s in.' }, prompt: null },
    });
    expect(strip.text()).toContain('Pen’s in.');
    expect(strip.find('.ask').exists()).toBe(false);
  });

  it('a question with two answers has no main one', () => {
    const strip = mount(VitalsStrip, { props: { monitor, said: null, prompt: question } });
    expect(strip.findAll('.ask-options .btn--key')).toHaveLength(0);
  });

  it('the AED’s one answer is the white button, in the drawer as in the room', async () => {
    const shock: Prompt = {
      id: 'shock',
      voice: { who: 'AED', line: 'Shock advised.' },
      options: [{ id: 'shock', label: 'Shock' }],
    };
    const strip = mount(VitalsStrip, {
      props: { monitor, said: { who: 'DA', line: 'Back on his chest.' }, prompt: shock },
    });
    expect(strip.find('.ask').text()).toContain('AED');
    expect(strip.find('.ask').text()).toContain('Shock advised.');
    const options = strip.findAll('.ask-options .btn');
    expect(options.map((b) => b.text())).toEqual(['Shock']);
    expect(options[0]?.classes()).toContain('btn--key');
    await options[0]?.trigger('click');
    expect(strip.emitted('answer')?.[0]).toEqual(['shock']);
  });
});

describe('a patient with no pulse, in the strip', () => {
  it('has no saturation to show: the oximeter has no pulse wave to read it from', () => {
    const arrest: MonitorView = { ...monitor, hr: 188, spo2: 84, perfusion: 0, rhythm: 'vtach' };
    const strip = mount(VitalsStrip, { props: { monitor: arrest, said: null } });
    expect(strip.find('.v--spo2').text()).toBe('SpO₂ --');
    expect(strip.text()).not.toContain('84');
    expect(strip.find('.v--hr').text()).toBe('HR 188');
  });

  it('shows it as before for one who has', () => {
    const strip = mount(VitalsStrip, { props: { monitor, said: null } });
    expect(strip.find('.v--spo2').text()).toBe('SpO₂ 97');
  });
});
