import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useFormularyStore } from './formulary';
import { useIVStore } from './iv';

describe('useIVStore sedative anchor', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('lastIvSedativeAt tracks only Versed/Fentanyl while lastIvMedAt tracks any IV med', () => {
    const iv = useIVStore();
    expect(iv.lastIvSedativeAt).toBeNull();
    expect(iv.lastIvMedAt).toBeNull();

    const versed = iv.logDose({ drug: 'versed', mg: 1 });
    const zofran = iv.logDose({ drug: 'zofran', mg: 4 });
    const naloxone = iv.logDose({ drug: 'naloxone', mg: 0.4 });

    expect(iv.lastIvSedativeAt).toBe(versed.at);
    expect(iv.lastIvMedAt).toBe(naloxone.at);

    // Undoing the non-sedatives converges both anchors on the Versed dose.
    iv.removeDoseById(naloxone.id);
    iv.removeDoseById(zofran.id);
    expect(iv.lastIvSedativeAt).toBe(versed.at);
    expect(iv.lastIvMedAt).toBe(versed.at);
  });

  it('a fentanyl dose advances the sedative anchor past an earlier versed dose', () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 1 });
    const fentanyl = iv.logDose({ drug: 'fentanyl', mcg: 25 });
    expect(iv.lastIvSedativeAt).toBe(fentanyl.at);
  });
});

describe('what a new case starts with', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('the top of each IV list, as shipped: right dorsal hand, D5W 1000 mL, 22 gauge', () => {
    const iv = useIVStore();
    expect(iv.ivSite).toBe('Right dorsal hand');
    expect(iv.ivFluid).toBe('D5W 1000 mL');
    expect(iv.ivCatheterGauge).toBe('22');
  });

  it('follows the practice when it moves another entry to the top (owner, Nov 2026)', () => {
    const formulary = useFormularyStore();
    formulary.setList('ivSites', ['Left forearm', 'Right dorsal hand']);
    formulary.setList('ivFluids', ["Lactated Ringer's 250 mL", 'D5W 100 mL']);
    formulary.setList('catheterGauges', ['20', '22']);
    const iv = useIVStore();
    expect(iv.ivSite).toBe('Left forearm');
    expect(iv.ivFluid).toBe("Lactated Ringer's 250 mL");
    expect(iv.ivCatheterGauge).toBe('20');
  });
});
