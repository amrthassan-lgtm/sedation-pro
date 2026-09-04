import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useIvDosing } from './useIvDosing';
import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { useToastStore } from '@/stores/toast';

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

/**
 * EKG confirmation moved out of the Phase 1 completeness gate — an
 * assessment-only visit never places leads, and requiring it there forced a
 * false assertion to reach the note. It is enforced here instead, at the
 * instant a sedative is given.
 *
 * These tests sit on the composable rather than on the buttons because this
 * is the one choke point every IV dose passes through, from both Phase 3 and
 * the dock. The buttons are disabled in parallel; this is what makes the two
 * surfaces unable to disagree.
 */
describe('the EKG block on IV sedatives', () => {
  it.each([
    ['Versed', (d: ReturnType<typeof useIvDosing>) => d.logIvVersed(2, 'test')],
    ['Fentanyl', (d: ReturnType<typeof useIvDosing>) => d.logIvFentanyl(25, 'test')],
  ])('refuses %s while the EKG is unconfirmed', (_drug, give) => {
    usePatientStore().ekgPlaced = false;
    const dosing = useIvDosing();

    give(dosing);

    expect(useIVStore().doses).toHaveLength(0);
  });

  it('says why, rather than leaving a dead button', () => {
    usePatientStore().ekgPlaced = false;
    const dosing = useIvDosing();

    dosing.logIvVersed(2, 'test');

    const toast = useToastStore().current;
    expect(toast?.label).toMatch(/EKG/i);
    expect(toast?.sub).toMatch(/phase 1/i);
  });

  it('lets the dose through once the EKG is confirmed', () => {
    usePatientStore().ekgPlaced = true;
    const dosing = useIvDosing();

    dosing.logIvVersed(2, 'test');

    expect(useIVStore().doses).toHaveLength(1);
    expect(dosing.readiness.value.ready).toBe(true);
  });

  /**
   * The block must never stand between a clinician and a reversal agent, and
   * Zofran is not a sedative. If this ever starts failing, the gate has been
   * widened into something dangerous.
   */
  it.each([
    ['Zofran', (d: ReturnType<typeof useIvDosing>) => d.logIvZofran(4)],
    ['flumazenil', (d: ReturnType<typeof useIvDosing>) => d.logIvFlumazenil()],
    ['naloxone', (d: ReturnType<typeof useIvDosing>) => d.logIvNaloxone()],
  ])('never blocks %s', (_drug, give) => {
    usePatientStore().ekgPlaced = false;
    const dosing = useIvDosing();

    give(dosing);

    expect(useIVStore().doses).toHaveLength(1);
  });
});
