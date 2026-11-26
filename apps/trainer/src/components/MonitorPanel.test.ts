import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { MonitorView } from '@/engine/types';

import MonitorPanel from './MonitorPanel.vue';

const beating: MonitorView = {
  hr: 78,
  spo2: 97,
  etco2: 37,
  rr: 13,
  bagged: false,
  capno: 'normal',
  rhythm: 'sinus',
  nibp: { sbp: 132, dbp: 82, at: -120 },
  cuffCycling: false,
  perfusion: 1,
  alarms: [],
  alarmLevel: 'none',
};

const panel = (monitor: MonitorView) =>
  mount(MonitorPanel, {
    props: { monitor, t: 30, clock: '10:05:30 AM', live: false, alarmPaused: false },
  });

describe('the monitor, on a patient with no pulse', () => {
  const arrest: MonitorView = {
    ...beating,
    hr: 188,
    spo2: 84,
    etco2: null,
    rr: 0,
    capno: 'flat',
    rhythm: 'vtach',
    nibp: null,
    perfusion: 0,
  };

  it('shows no saturation: the number behind it was never read', () => {
    const drawn = panel(arrest);
    expect(drawn.find('.num.spo2 .val').text()).toBe('--');
    expect(drawn.text()).not.toContain('84');
    expect(drawn.find('.num.ecg .val').text()).toBe('188');
  });

  it('says in words what its traces show: wide and fast, with a flat pulse wave under it', () => {
    const labels = panel(arrest)
      .findAll('canvas')
      .map((c) => c.attributes('aria-label'));
    expect(labels).toEqual(['ECG: wide and fast', 'Pleth waveform: flat', 'CO₂ waveform: flat']);
  });

  it('shows no pressure once the cuff has found none, and no alarm of its own for any of it', () => {
    const drawn = panel(arrest);
    expect(drawn.find('.nibp-val').text()).toBe('--/--');
    expect(drawn.find('.nibp-age').text()).toBe('');
    expect(drawn.find('.mon-alarm-text').exists()).toBe(false);
  });

  it('a patient with a pulse is shown as before', () => {
    const drawn = panel(beating);
    expect(drawn.find('.num.spo2 .val').text()).toBe('97');
    expect(drawn.findAll('canvas').map((c) => c.attributes('aria-label'))).toEqual([
      'ECG: regular',
      'Pleth waveform',
      'CO₂ waveform: square',
    ]);
    expect(drawn.find('.nibp-val').text()).toBe('132/82');
  });
});
