import { createServer, type Server, type Socket } from 'node:net';
import { MllpStreamParser } from './mllp.js';
import { extractMrn } from './hl7.js';
import type { SessionStore } from './sessions.js';

/**
 * TCP listener for the Edan X10 (or any HL7 v2 MLLP sender). One socket
 * per monitor; each socket drives its own MllpStreamParser so a packet
 * that splits a message across two TCP chunks reassembles correctly.
 *
 * Per-message flow:
 *   1. Pull the MRN out of PID-3.
 *   2. Hand the raw message bytes to the SessionStore. If no session is
 *      active for that MRN, the message is dropped — bytes outside a
 *      charted case window aren't medicolegal record.
 *   3. Send back an MLLP ACK so the monitor knows the message landed
 *      and doesn't retransmit. Most Edan monitors accept the simplest
 *      AA (application accept) ACK we can craft.
 */

export interface ListenerOptions {
  readonly port: number;
  readonly store: SessionStore;
  /** Optional hook for tests + observability. */
  readonly onMessage?: (mrn: string | null, message: Buffer) => void;
}

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

function ack(controlId: string): Buffer {
  // Minimal MSH + MSA structure — Edan monitors don't validate beyond
  // the AA code. Timestamp omitted; controlId echoed.
  const body = [
    'MSH|^~\\&|BRIDGE|SEDPRO|EDAN|MON|||ACK|' + controlId + '|P|2.5',
    'MSA|AA|' + controlId,
  ].join('\r');
  return Buffer.concat([Buffer.from([VT]), Buffer.from(body, 'utf8'), Buffer.from([FS, CR])]);
}

function controlIdFrom(message: string): string {
  const fields = (message.split('\r', 1)[0] ?? '').split('|');
  return fields[9]?.trim() || 'unknown';
}

export function createListener(opts: ListenerOptions): Server {
  const server = createServer((socket: Socket) => {
    const parser = new MllpStreamParser();
    socket.on('data', (chunk) => {
      const messages = parser.push(chunk);
      for (const msg of messages) {
        const text = msg.toString('utf8');
        const mrn = extractMrn(text);
        opts.onMessage?.(mrn, msg);
        if (mrn) {
          // Fire-and-forget — the store's append is durable on its own;
          // we don't want a slow disk to back-pressure the TCP read.
          void opts.store.append(mrn, msg);
        }
        socket.write(ack(controlIdFrom(text)));
      }
    });
    socket.on('error', () => {
      // Monitor will retry; nothing to do.
    });
  });
  server.listen(opts.port);
  return server;
}
