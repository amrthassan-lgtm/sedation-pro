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
});
