import { computed, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { usePatientStore } from '@/stores/patient';
import type { Severity } from '@sedation-pro/clinical';

/**
 * View-model for the three vital-sign stat cards (BMI, baseline BP,
 * baseline SpO₂). Each computed maps the engine's classification result
 * onto a `UiStatCard` props bag — value string, category label, severity
 * tint, and optional detail line.
 *
 * Lives in a composable so the same view-model drives both the inline grid
 * inside Phase 1's Vitals & Metrics card and the right-rail mirror on iPad
 * landscape. Pure mapping over patient store; no DOM, no I/O, easy to unit
 * test against a synthetic Pinia.
 */
export interface VitalCardView {
  readonly value: string;
  readonly category: string | undefined;
  readonly severity: Severity | 'empty';
  readonly detail?: string | undefined;
}

export interface UseVitalCards {
  readonly bmiCard: ComputedRef<VitalCardView>;
  readonly bpCard: ComputedRef<VitalCardView>;
  readonly spo2Card: ComputedRef<VitalCardView>;
}

function formatHeight(inches: number | null): string {
  if (inches === null) return '—';
  const ft = Math.floor(inches / 12);
  const rem = inches - ft * 12;
  return `${ft}′${rem}″`;
}

const BMI_LABELS: Record<'underweight' | 'normal' | 'overweight' | 'obese' | 'severe', string> = {
  underweight: 'Underweight',
  normal: 'Normal',
  overweight: 'Overweight',
  obese: 'Obese',
  severe: 'Class III',
};

const BP_LABELS: Record<'normal' | 'elevated' | 'stage-1' | 'stage-2' | 'crisis', string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  'stage-1': 'Stage 1',
  'stage-2': 'Stage 2',
  crisis: 'Crisis',
};

const SPO2_LABELS: Record<'normal' | 'mild' | 'severe', string> = {
  normal: 'Normal',
  mild: 'Mild hypoxemia',
  severe: 'Severe hypoxemia',
};

export function useVitalCards(): UseVitalCards {
  const patient = usePatientStore();
  const { bmi, bp, spo2, weightLb, heightIn } = storeToRefs(patient);

  const bmiCard = computed<VitalCardView>(() => {
    if (!bmi.value) {
      return { value: '—', category: undefined, severity: 'empty', detail: undefined };
    }
    const severity: Severity =
      bmi.value.category === 'severe'
        ? 'limit'
        : bmi.value.category === 'obese' ||
            bmi.value.category === 'overweight' ||
            bmi.value.category === 'underweight'
          ? 'caution'
          : 'safe';
    return {
      value: bmi.value.value.toFixed(1),
      category: BMI_LABELS[bmi.value.category],
      severity,
      detail: `${weightLb.value ?? '—'} lb · ${formatHeight(heightIn.value)}`,
    };
  });

  const bpCard = computed<VitalCardView>(() => {
    if (!bp.value) {
      return { value: '—', category: undefined, severity: 'empty' };
    }
    return {
      value: `${bp.value.sbp}/${bp.value.dbp}`,
      category: BP_LABELS[bp.value.category],
      severity: bp.value.severity,
    };
  });

  const spo2Card = computed<VitalCardView>(() => {
    if (!spo2.value) {
      return { value: '—', category: undefined, severity: 'empty' };
    }
    return {
      value: spo2.value.value.toString(),
      category: SPO2_LABELS[spo2.value.category],
      severity: spo2.value.severity,
    };
  });

  return { bmiCard, bpCard, spo2Card };
}
