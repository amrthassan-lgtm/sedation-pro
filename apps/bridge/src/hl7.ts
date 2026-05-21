/**
 * Tiny HL7 v2 helper — we don't try to be a general parser. The bridge
 * only needs two things from each incoming message:
 *
 *   1. The MRN (PID-3, the patient identifier list) so the right
 *      recording session captures the bytes.
 *   2. The message control id (MSH-10) for the audit trail.
 *
 * Everything else is stored raw and parsed later by whatever renders the
 * trend graph in the chart appendix. That keeps this module small and
 * lets us upgrade the parser without re-spooling already-recorded cases.
 */

/** HL7 v2 segment terminator. */
const SEGMENT_SEP = '\r';

/**
 * Extract the MRN from a PID segment, if present. Returns null when no
 * PID exists in the message (acceptable — the app's session POST is the
 * authoritative MRN; PID is a cross-check and falls back gracefully).
 *
 * PID-3 is a repeating field of CX (extended composite id) types; the MRN
 * is component 1 of the first repetition. Field delimiter is `|`,
 * repetition is `~`, component is `^`.
 */
export function extractMrn(message: string): string | null {
  for (const segment of message.split(SEGMENT_SEP)) {
    if (!segment.startsWith('PID|')) continue;
    const fields = segment.split('|');
    const pid3 = fields[3];
    if (!pid3) return null;
    const firstRepetition = pid3.split('~')[0] ?? '';
    const id = firstRepetition.split('^')[0] ?? '';
    return id.trim() || null;
  }
  return null;
}

/**
 * Extract MSH-10 (message control id). Useful for de-duplication if the
 * sender retransmits, and for the recorded-bytes audit trail.
 */
export function extractControlId(message: string): string | null {
  const firstSegment = message.split(SEGMENT_SEP, 1)[0] ?? '';
  if (!firstSegment.startsWith('MSH|')) return null;
  const fields = firstSegment.split('|');
  return fields[9]?.trim() || null;
}
