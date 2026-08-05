import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

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
