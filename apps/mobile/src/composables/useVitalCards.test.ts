import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import { useVitalCards } from './useVitalCards';

describe('useVitalCards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns empty placeholders when vitals have not been entered', () => {
    const { bmiCard, bpCard, spo2Card } = useVitalCards();
    expect(bmiCard.value).toEqual({
      value: '—',
      category: undefined,
      severity: 'empty',
      detail: undefined,
    });
    expect(bpCard.value).toMatchObject({ value: '—', severity: 'empty' });
    expect(spo2Card.value).toMatchObject({ value: '—', severity: 'empty' });
  });

  it('classifies a normal-weight, normal-BP, normal-SpO2 patient as safe', () => {
    const patient = usePatientStore();
    patient.weightLb = 150;
    patient.heightIn = 70;
    patient.baselineBp = { sbp: 110, dbp: 70 };
    patient.baselineSpo2 = 98;

    const { bmiCard, bpCard, spo2Card } = useVitalCards();
    expect(bmiCard.value.category).toBe('Normal');
    expect(bmiCard.value.severity).toBe('safe');
    expect(bmiCard.value.detail).toBe('150 lb · 5′10″');
    expect(bpCard.value).toMatchObject({ value: '110/70', category: 'Normal', severity: 'safe' });
    expect(spo2Card.value).toMatchObject({ value: '98', category: 'Normal', severity: 'safe' });
  });

  it('flags an overweight patient as caution and formats BMI to one decimal', () => {
    const patient = usePatientStore();
    patient.weightLb = 200;
    patient.heightIn = 72;
    const { bmiCard } = useVitalCards();
    expect(bmiCard.value.severity).toBe('caution');
    expect(bmiCard.value.category).toBe('Overweight');
    expect(bmiCard.value.value).toBe('27.1');
  });

  it('flags Class III obesity as a limit-severity card', () => {
    const patient = usePatientStore();
    patient.weightLb = 320;
    patient.heightIn = 66;
    const { bmiCard } = useVitalCards();
    expect(bmiCard.value.severity).toBe('limit');
    expect(bmiCard.value.category).toBe('Class III');
  });

  it('classifies stage-2 hypertension and surfaces the engine label', () => {
    const patient = usePatientStore();
    patient.baselineBp = { sbp: 165, dbp: 105 };
    const { bpCard } = useVitalCards();
    expect(bpCard.value.value).toBe('165/105');
    expect(bpCard.value.category).toBe('Stage 2');
  });

  it('flags severe hypoxemia at 88%', () => {
    const patient = usePatientStore();
    patient.baselineSpo2 = 88;
    const { spo2Card } = useVitalCards();
    expect(spo2Card.value.value).toBe('88');
    expect(spo2Card.value.category).toBe('Severe hypoxemia');
  });

  it('updates reactively when weight changes', () => {
    const patient = usePatientStore();
    patient.weightLb = 150;
    patient.heightIn = 70;
    const { bmiCard } = useVitalCards();
    const before = bmiCard.value.value;
    patient.weightLb = 250;
    expect(bmiCard.value.value).not.toBe(before);
    expect(bmiCard.value.severity).toBe('caution');
  });
});
