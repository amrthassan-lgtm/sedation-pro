/**
 * Text sanitation for the PDF renderer.
 *
 * pdf-lib's `StandardFonts` are the 14 PDF base fonts, which encode text as
 * WinAnsi (cp1252). `drawText` *throws* on any character outside that set —
 * it does not substitute or drop. The clinical note routinely contains
 * characters that are not in cp1252:
 *
 *   useClinicalNote.ts:368,480  `SpO₂ 98%`            U+2082
 *   useClinicalNote.ts:262      recovery vitals row   U+2082
 *   useClinicalNote.ts:168      `≥6h solids`          U+2265
 *   useClinicalNote.ts:277      glucose trend `a → b` U+2192
 *
 * So rendering a real note with un-sanitised text throws, and every send of
 * the PDF artifact fails. Transliterating is the right trade here rather
 * than embedding a Unicode TTF: `SpO2 98%` and `>=6h solids` are unambiguous
 * to a clinician and to a court, and a ~300 KB font in the bundle and in
 * every uploaded document is not.
 *
 * The map is deliberately explicit. Anything not in it that cannot be
 * encoded becomes `?`, which is a visible defect rather than a silent one —
 * and `pdfTextTripwire.test.ts` asserts a realistic note produces **zero**
 * substitutions, so a new character entering note content fails CI instead
 * of quietly degrading a medicolegal record.
 *
 * Known limitation: a patient name outside cp1252 (non-Latin scripts) will
 * substitute. Latin names, including accented ones, encode fine. If that
 * ever matters, the fix is `@pdf-lib/fontkit` plus an embedded TTF, not a
 * wider map here.
 */

const TRANSLITERATIONS: ReadonlyMap<string, string> = new Map([
  // Subscripts — SpO₂, EtCO₂, N₂O.
  ['₀', '0'],
  ['₁', '1'],
  ['₂', '2'],
  ['₃', '3'],
  ['₄', '4'],
  // Comparison operators — NPO windows, BMI and BP thresholds.
  ['≥', '>='],
  ['≤', '<='],
  ['≠', '!='],
  ['≈', '~'],
  // Arrows — trend rows ("110 → 96 → 88") and prose.
  ['→', '->'],
  ['←', '<-'],
  ['↔', '<->'],
  ['⇒', '=>'],
  ['↶', 'undo'],
  ['↻', 'reload'],
  // Maths / units.
  ['−', '-'],
  ['∞', 'infinity'],
  ['′', "'"],
  ['″', '"'],
  ['‑', '-'],
  // Marks that can reach a value string via picklists.
  ['✓', '[x]'],
  ['✕', '[ ]'],
  ['⚠', '(!)'],
]);

/** Replacement for an un-encodable character with no explicit mapping. */
export const UNMAPPED_REPLACEMENT = '?';

function encodableInWinAnsi(ch: string): boolean {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  // Latin-1 minus the C1 control block, plus the cp1252 0x80–0x9F additions
  // that pdf-lib's WinAnsi encoding supports (typographic quotes, dashes,
  // the euro sign). Anything else is not representable.
  if (code < 0x80) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return CP1252_HIGH.has(ch);
}

/** The printable cp1252 characters that live in the 0x80–0x9F range. */
const CP1252_HIGH: ReadonlySet<string> = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ' + '‘’“”•–—˜™š›œžŸ');

export interface SanitizeResult {
  readonly text: string;
  /** Characters replaced by `UNMAPPED_REPLACEMENT` — empty on a clean note. */
  readonly unmapped: ReadonlyArray<string>;
}

/**
 * Sanitize a string to something `StandardFonts` can encode, reporting any
 * character that had no explicit mapping. Total: never throws.
 */
export function sanitizeForWinAnsi(input: string): SanitizeResult {
  const unmapped: string[] = [];
  let out = '';
  // Iterate by code point so astral characters (emoji) are handled as one
  // unit rather than as two lone surrogates.
  for (const ch of input) {
    if (encodableInWinAnsi(ch)) {
      out += ch;
      continue;
    }
    const mapped = TRANSLITERATIONS.get(ch);
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    unmapped.push(ch);
    out += UNMAPPED_REPLACEMENT;
  }
  return { text: out, unmapped };
}

/** Sanitized text only — the common case at a draw site. */
export function winAnsi(input: string): string {
  return sanitizeForWinAnsi(input).text;
}
