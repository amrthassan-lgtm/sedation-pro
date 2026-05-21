/**
 * Minimum Lower Layer Protocol (MLLP) framing — HL7 v2's wire envelope.
 *
 * Each HL7 message is wrapped:
 *   <VT> message-bytes <FS><CR>
 *   0x0b ...           0x1c 0x0d
 *
 * `MllpStreamParser` is a tiny stateful chunk consumer: feed it whatever
 * the TCP socket delivers (chunks can split a message arbitrarily or pack
 * many messages into one chunk) and it emits whole messages as Buffers in
 * arrival order. Bytes outside the framing markers are discarded — Edan
 * monitors don't send any but the spec allows trailing keep-alives that
 * we should be robust to.
 */

const VT = 0x0b; // <SB> start of block
const FS = 0x1c; // <EB> end of block
const CR = 0x0d; // end of message after FS

export class MllpStreamParser {
  /** Bytes accumulated since the last <VT>, awaiting an <FS><CR> close. */
  private buf: number[] = [];
  /** Whether we are currently inside a framed message (between VT and FS). */
  private inside = false;

  /**
   * Feed one chunk of TCP data. Returns the messages that completed inside
   * this chunk, in order. Returns an empty array when the chunk only
   * partially overlaps a message.
   */
  push(chunk: Uint8Array): Buffer[] {
    const out: Buffer[] = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const b = chunk[i]!;
      if (!this.inside) {
        if (b === VT) {
          this.inside = true;
          this.buf = [];
        }
        // Bytes before <VT> are stray; ignore.
        continue;
      }
      if (b === FS) {
        // Expect a trailing <CR> right after. Some senders omit it; we
        // accept either, but if a <CR> follows we consume it.
        out.push(Buffer.from(this.buf));
        this.buf = [];
        this.inside = false;
        if (i + 1 < chunk.length && chunk[i + 1] === CR) i += 1;
        continue;
      }
      this.buf.push(b);
    }
    return out;
  }

  /**
   * True iff there is an in-flight (unclosed) message in the buffer. Used
   * to surface "the sender disconnected mid-message" as an error in
   * tests / production.
   */
  hasPartial(): boolean {
    return this.inside;
  }
}

/** Wrap raw HL7 message bytes in an MLLP envelope — used by tests. */
export function frame(message: string | Buffer): Buffer {
  const body = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
  return Buffer.concat([Buffer.from([VT]), body, Buffer.from([FS, CR])]);
}
