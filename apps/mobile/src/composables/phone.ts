/**
 * US phone formatting for the caregiver field: once ten digits are present
 * the value reads (555) 123-4567. Anything shorter is left as typed so the
 * clinician can keep going; a leading country 1 is dropped.
 */
export function formatUsPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** True when something was typed but it is not a complete ten-digit number. */
export function phoneIncomplete(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return (
    digits.length > 0 && digits.length !== 10 && !(digits.length === 11 && digits.startsWith('1'))
  );
}
