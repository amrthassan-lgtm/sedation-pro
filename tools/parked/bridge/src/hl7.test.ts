import { describe, it, expect } from 'vitest';
import { extractMrn, extractControlId } from './hl7.js';

describe('extractMrn', () => {
  it('reads MRN from PID-3 first repetition first component', () => {
    const msg =
      'MSH|^~\\&|EDAN|FAC|RX|DEST|202605211530||ORU^R01|MSG001|P|2.5\r' +
      'PID|||12345^^^FAC^MR||DOE^JANE\r' +
      'OBR|1|||VITALS\r' +
      'OBX|1|NM|HR^Heart Rate||72|/min\r';
    expect(extractMrn(msg)).toBe('12345');
  });

  it('returns null when no PID segment is present', () => {
    const msg = 'MSH|^~\\&|EDAN|FAC|RX|DEST|202605211530||ORU^R01|MSG001|P|2.5\r';
    expect(extractMrn(msg)).toBeNull();
  });

  it('returns null when PID-3 is empty', () => {
    const msg = 'MSH|^~\\&|EDAN|FAC|RX|DEST|202605211530||ORU^R01|MSG001|P|2.5\rPID|||||DOE\r';
    expect(extractMrn(msg)).toBeNull();
  });

  it('strips whitespace from the extracted id', () => {
    const msg = 'MSH|^~\\&|EDAN|...\rPID||| 12345 ^^^FAC^MR\r';
    expect(extractMrn(msg)).toBe('12345');
  });
});

describe('extractControlId', () => {
  it('reads MSH-10', () => {
    const msg =
      'MSH|^~\\&|EDAN|FAC|RX|DEST|202605211530||ORU^R01|MSG12345|P|2.5\r' + 'PID|||1^^^FAC^MR\r';
    expect(extractControlId(msg)).toBe('MSG12345');
  });

  it('returns null when MSH is missing or malformed', () => {
    expect(extractControlId('PID|||1\r')).toBeNull();
    expect(extractControlId('')).toBeNull();
  });
});
