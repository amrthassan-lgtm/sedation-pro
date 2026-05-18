import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { OTHER_OPTION, useOtherableSelect } from './useOtherableSelect';

const CHOICES = ['Dr. Amr Hassan', 'Dr. Camila Flach'];

describe('useOtherableSelect', () => {
  it('reflects an in-list default as the selected value, not Other', () => {
    const model = ref('Dr. Amr Hassan');
    const s = useOtherableSelect(model, CHOICES);
    expect(s.isOther.value).toBe(false);
    expect(s.selectValue.value).toBe('Dr. Amr Hassan');
  });

  it('appends a single trailing Other… option', () => {
    const s = useOtherableSelect(ref('Dr. Amr Hassan'), CHOICES);
    expect(s.options.value.map((o) => o.value)).toEqual([
      'Dr. Amr Hassan',
      'Dr. Camila Flach',
      OTHER_OPTION,
    ]);
  });

  it('choosing Other… clears the model and reveals the free-text path', () => {
    const model = ref('Dr. Amr Hassan');
    const s = useOtherableSelect(model, CHOICES);
    s.selectValue.value = OTHER_OPTION;
    expect(model.value).toBe('');
    expect(s.isOther.value).toBe(true);
    // The select stays parked on Other… while the text box is filled in.
    expect(s.selectValue.value).toBe(OTHER_OPTION);
  });

  it('typing a custom value keeps the select on Other… and charts the value', () => {
    const model = ref('');
    const s = useOtherableSelect(model, CHOICES);
    model.value = 'Dr. Locum Covering';
    expect(s.isOther.value).toBe(true);
    expect(s.selectValue.value).toBe(OTHER_OPTION);
  });

  it('a rehydrated off-list value opens in the Other… state', () => {
    const s = useOtherableSelect(ref('Dr. Someone Else'), CHOICES);
    expect(s.isOther.value).toBe(true);
  });

  it('selecting a list entry writes it straight through', () => {
    const model = ref('');
    const s = useOtherableSelect(model, CHOICES);
    s.selectValue.value = 'Dr. Camila Flach';
    expect(model.value).toBe('Dr. Camila Flach');
    expect(s.isOther.value).toBe(false);
  });
});
