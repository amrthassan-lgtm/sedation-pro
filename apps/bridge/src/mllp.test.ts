import { describe, it, expect } from 'vitest';
import { MllpStreamParser, frame } from './mllp.js';

describe('MllpStreamParser', () => {
  it('emits a single message from a single chunk', () => {
    const p = new MllpStreamParser();
    const out = p.push(frame('MSH|^~\\&|EDAN|...'));
    expect(out.map((b: Buffer) => b.toString())).toEqual(['MSH|^~\\&|EDAN|...']);
  });

  it('emits two messages from one chunk', () => {
    const p = new MllpStreamParser();
    const concatenated = Buffer.concat([frame('first'), frame('second')]);
    const out = p.push(concatenated);
    expect(out.map((b: Buffer) => b.toString())).toEqual(['first', 'second']);
  });

  it('reassembles a message split across multiple chunks', () => {
    const p = new MllpStreamParser();
    const full = frame('the body has multiple words');
    const split1 = full.subarray(0, 5);
    const split2 = full.subarray(5, 12);
    const split3 = full.subarray(12);
    expect(p.push(split1)).toEqual([]);
    expect(p.push(split2)).toEqual([]);
    const out = p.push(split3);
    expect(out.map((b: Buffer) => b.toString())).toEqual(['the body has multiple words']);
  });

  it('discards stray bytes outside framing markers', () => {
    const p = new MllpStreamParser();
    const junkBefore = Buffer.from([0x20, 0x20]); // two spaces, no <VT>
    const between = Buffer.from([0x09]); // tab between messages, no <VT>
    const out = p.push(Buffer.concat([junkBefore, frame('a'), between, frame('b')]));
    expect(out.map((b: Buffer) => b.toString())).toEqual(['a', 'b']);
  });

  it('tolerates a missing trailing <CR> after <FS>', () => {
    const p = new MllpStreamParser();
    // Build a frame manually with only <FS> and no <CR>.
    const noCr = Buffer.concat([Buffer.from([0x0b]), Buffer.from('x'), Buffer.from([0x1c])]);
    const out = p.push(noCr);
    expect(out.map((b: Buffer) => b.toString())).toEqual(['x']);
  });

  it('reports a partial message after a chunk that opens without closing', () => {
    const p = new MllpStreamParser();
    p.push(Buffer.from([0x0b, 0x41])); // <VT> + 'A', no <FS> yet
    expect(p.hasPartial()).toBe(true);
    p.push(Buffer.from([0x1c, 0x0d])); // <FS><CR> closes
    expect(p.hasPartial()).toBe(false);
  });
});
