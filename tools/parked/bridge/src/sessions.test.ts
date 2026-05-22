import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './sessions.js';

async function freshStore(): Promise<{ store: SessionStore; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sedpro-bridge-'));
  const store = new SessionStore(dir);
  await store.init();
  return { store, dir };
}

describe('SessionStore', () => {
  let dir: string;
  let store: SessionStore;

  beforeEach(async () => {
    const fresh = await freshStore();
    dir = fresh.dir;
    store = fresh.store;
  });

  it('starts a session with a deterministic id keyed by MRN + UTC stamp', async () => {
    const t = new Date(Date.UTC(2026, 4, 21, 14, 32, 5));
    const meta = await store.start('12345', t);
    expect(meta.id).toBe('12345-20260521-143205');
    expect(meta.mrn).toBe('12345');
    expect(meta.startedAt).toBe('2026-05-21T14:32:05.000Z');
    expect(meta.stoppedAt).toBeNull();
    expect(meta.byteCount).toBe(0);
    expect(meta.messageCount).toBe(0);
    expect(store.isActive(meta.id)).toBe(true);
  });

  it('starting a second session for the same MRN auto-stops the first', async () => {
    const a = await store.start('12345', new Date(Date.UTC(2026, 4, 21, 9, 0, 0)));
    const b = await store.start('12345', new Date(Date.UTC(2026, 4, 21, 14, 0, 0)));
    expect(a.id).not.toBe(b.id);
    expect(store.isActive(a.id)).toBe(false);
    expect(store.isActive(b.id)).toBe(true);
    const aDisk = await store.get(a.id);
    expect(aDisk?.stoppedAt).not.toBeNull();
  });

  it('append() writes framed HL7 to the raw file and increments counters', async () => {
    const meta = await store.start('12345', new Date(Date.UTC(2026, 4, 21, 9, 0, 0)));
    await store.append('12345', Buffer.from('MSH|^~\\&|EDAN|FAC|RX|DEST|TIME||ORU^R01|M1|P|2.5'));
    await store.append('12345', Buffer.from('MSH|^~\\&|EDAN|FAC|RX|DEST|TIME||ORU^R01|M2|P|2.5'));

    // Counters update on the on-disk meta (active session is persisted
    // every append for crash-tolerance).
    const onDisk = await store.get(meta.id);
    expect(onDisk?.messageCount).toBe(2);
    expect(onDisk?.byteCount).toBeGreaterThan(0);

    // Raw file contains two MLLP-framed messages.
    await store.stop(meta.id);
    const raw = await readFile(store.rawFilePath(meta.id));
    const vt = raw.filter((b) => b === 0x0b).length;
    const fs = raw.filter((b) => b === 0x1c).length;
    expect(vt).toBe(2);
    expect(fs).toBe(2);
  });

  it('append() is a no-op when no session is active for the MRN', async () => {
    await store.append('UNKNOWN', Buffer.from('MSH|^~\\&|EDAN|...'));
    const all = await store.list();
    expect(all).toEqual([]);
  });

  it('stop() flushes the file, persists stoppedAt, and removes from active set', async () => {
    const meta = await store.start('12345', new Date(Date.UTC(2026, 4, 21, 9, 0, 0)));
    const stopped = await store.stop(meta.id, new Date(Date.UTC(2026, 4, 21, 9, 45, 0)));
    expect(stopped?.stoppedAt).toBe('2026-05-21T09:45:00.000Z');
    expect(store.isActive(meta.id)).toBe(false);
    const onDisk = await store.get(meta.id);
    expect(onDisk?.stoppedAt).toBe('2026-05-21T09:45:00.000Z');
  });

  it('stop() returns null for an unknown session id', async () => {
    const result = await store.stop('does-not-exist');
    expect(result).toBeNull();
  });

  it('list() returns newest-first ordering', async () => {
    const earlier = new Date(Date.UTC(2026, 4, 21, 8, 0, 0));
    const later = new Date(Date.UTC(2026, 4, 21, 14, 0, 0));
    await store.start('A', earlier);
    await store.start('B', later);
    const all = await store.list();
    expect(all.map((m: { mrn: string }) => m.mrn)).toEqual(['B', 'A']);
  });

  it('cleans up after itself', async () => {
    await rm(dir, { recursive: true, force: true });
  });
});
