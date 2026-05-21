import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { MllpStreamParser } from './mllp.js';

/**
 * Per-case recording session. The app POSTs an MRN at the first Phase 3
 * vitals stamp to open a session; bytes received from the monitor between
 * then and the stop POST are appended to the session's `.hl7` file. The
 * sidecar `.json` carries the metadata so the app's "Monitor record
 * attached" indicator can render without having to read + scan the raw
 * HL7 bytes.
 *
 * Session id is `<mrn>-<YYYYMMDD-HHMMSS>` so the same patient charted
 * twice in a day each get a distinct recording.
 */

export interface SessionMeta {
  readonly id: string;
  readonly mrn: string;
  readonly startedAt: string;
  /** ISO timestamp set when the session is stopped. */
  stoppedAt: string | null;
  /** Bytes written to the raw HL7 file so far. */
  byteCount: number;
  /** Number of complete HL7 messages received. */
  messageCount: number;
}

interface ActiveSession extends SessionMeta {
  readonly stream: WriteStream;
}

export class SessionStore {
  private active = new Map<string, ActiveSession>();

  constructor(private readonly rootDir: string) {}

  /** Ensure the storage directory exists. Called once at boot. */
  async init(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  private metaPath(id: string): string {
    return join(this.rootDir, `${id}.json`);
  }

  private rawPath(id: string): string {
    return join(this.rootDir, `${id}.hl7`);
  }

  /**
   * Open a new recording for the given MRN. Stops any session already
   * active for the same MRN first so a forgotten previous case can't
   * silently keep buffering into the wrong recording.
   */
  async start(mrn: string, now: Date = new Date()): Promise<SessionMeta> {
    const existing = this.findActiveByMrn(mrn);
    if (existing) await this.stop(existing.id, now);

    const id = `${mrn}-${formatStamp(now)}`;
    const meta: SessionMeta = {
      id,
      mrn,
      startedAt: now.toISOString(),
      stoppedAt: null,
      byteCount: 0,
      messageCount: 0,
    };
    const stream = createWriteStream(this.rawPath(id), { flags: 'w' });
    await writeFile(this.metaPath(id), JSON.stringify(meta, null, 2));
    this.active.set(id, { ...meta, stream });
    return meta;
  }

  /**
   * Append a complete HL7 message to whichever session is currently
   * active for `mrn`. No-op when no session is open — the monitor may
   * already be streaming before the app opens a session, and dropping
   * those bytes is correct (they belong to no charted case).
   */
  async append(mrn: string, message: Buffer): Promise<void> {
    const session = this.findActiveByMrn(mrn);
    if (!session) return;
    // Frame each message with its MLLP envelope so the file is itself a
    // valid MLLP byte stream — easier downstream parsing than ad-hoc
    // delimiters.
    const VT = 0x0b;
    const FS = 0x1c;
    const CR = 0x0d;
    const framed = Buffer.concat([Buffer.from([VT]), message, Buffer.from([FS, CR])]);
    await new Promise<void>((resolve, reject) => {
      session.stream.write(framed, (err) => (err ? reject(err) : resolve()));
    });
    session.byteCount += framed.length;
    session.messageCount += 1;
    await this.persistMeta(session);
  }

  /** Close the session, flush the file, and persist final metadata. */
  async stop(id: string, now: Date = new Date()): Promise<SessionMeta | null> {
    const session = this.active.get(id);
    if (!session) return null;
    await new Promise<void>((resolve, reject) => {
      session.stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
    session.stoppedAt = now.toISOString();
    await this.persistMeta(session);
    this.active.delete(id);
    return this.toMeta(session);
  }

  /** Read metadata for any session — active or stopped — from disk. */
  async get(id: string): Promise<SessionMeta | null> {
    try {
      const raw = await readFile(this.metaPath(id), 'utf8');
      return JSON.parse(raw) as SessionMeta;
    } catch {
      return null;
    }
  }

  /** List all sessions on disk, newest first. */
  async list(): Promise<ReadonlyArray<SessionMeta>> {
    let entries: string[];
    try {
      entries = await readdir(this.rootDir);
    } catch {
      return [];
    }
    const metas: SessionMeta[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.rootDir, e), 'utf8');
        metas.push(JSON.parse(raw) as SessionMeta);
      } catch {
        // skip unreadable entries
      }
    }
    metas.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return metas;
  }

  /** Absolute path of the raw HL7 file for a session id. */
  rawFilePath(id: string): string {
    return this.rawPath(id);
  }

  /**
   * Read the stored MLLP stream for a session back into individual HL7
   * v2 messages (each one a string, no MLLP framing). The bridge stores
   * each appended message wrapped in its own MLLP envelope, so the file
   * is itself a valid MLLP byte stream — the same parser used on the
   * live TCP socket parses it.
   *
   * Returns an empty array when the session file doesn't exist.
   */
  async readMessages(id: string): Promise<ReadonlyArray<string>> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.rawPath(id));
    } catch {
      return [];
    }
    const parser = new MllpStreamParser();
    const messages = parser.push(bytes);
    return messages.map((m) => m.toString('utf8'));
  }

  /** Check whether a session is currently recording (open file). */
  isActive(id: string): boolean {
    return this.active.has(id);
  }

  private findActiveByMrn(mrn: string): ActiveSession | null {
    for (const s of this.active.values()) {
      if (s.mrn === mrn) return s;
    }
    return null;
  }

  private async persistMeta(session: ActiveSession): Promise<void> {
    await writeFile(this.metaPath(session.id), JSON.stringify(this.toMeta(session), null, 2));
  }

  private toMeta(session: ActiveSession): SessionMeta {
    return {
      id: session.id,
      mrn: session.mrn,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      byteCount: session.byteCount,
      messageCount: session.messageCount,
    };
  }
}

/** YYYYMMDD-HHMMSS in UTC — embedded in the session id for uniqueness. */
function formatStamp(d: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

/** Test-friendly export — also used by `list()` recovery on boot. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
