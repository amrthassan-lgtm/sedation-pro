import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import type { SelectOption } from '@sedation-pro/ui';

export const OTHER_OPTION = 'Other…';

/**
 * Bridges a free-text string ref to a fixed practice pick-list `<select>`
 * without ever losing the ability to chart an off-list value (medicolegal:
 * the record must be able to state the truth even when it isn't on the
 * practice's list).
 *
 * The select gains a trailing "Other…" entry; choosing it clears the model
 * and flips `isOther` so the caller can reveal a free-text input bound to
 * the same ref. `isOther` is *derived from the model*, not stored, so a
 * rehydrated custom value, a "Start new case" reset, or an undo all settle
 * correctly with no extra state to keep in sync.
 *
 * `choices` accepts a getter so the list can come from the practice's
 * editable formulary: editing the roster in Settings has to move the select
 * without waiting for the view to remount.
 */
export function useOtherableSelect(
  model: Ref<string>,
  choices: MaybeRefOrGetter<ReadonlyArray<string>>,
) {
  const options = computed<SelectOption[]>(() => [
    ...toValue(choices).map((c) => ({ value: c, label: c })),
    { value: OTHER_OPTION, label: OTHER_OPTION },
  ]);
  const isOther = computed(() => !toValue(choices).includes(model.value));
  const selectValue = computed<string>({
    get: () => (isOther.value ? OTHER_OPTION : model.value),
    set: (v) => {
      model.value = v === OTHER_OPTION ? '' : v;
    },
  });
  return { options, isOther, selectValue };
}
