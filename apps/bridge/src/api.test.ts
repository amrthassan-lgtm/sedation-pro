import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { SessionStore } from './sessions.js';
import { createApi } from './api.js';

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

describe('bridge HTTP API', () => {
  let store: SessionStore;
  let dir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sedpro-api-'));
    store = new SessionStore(dir);
    await store.init();
    server = createApi({ port: 0, store });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  it('GET /healthz returns ok', async () => {
    const { status, body } = await fetchJson(`${base}/healthz`);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('POST /sessions opens a session and returns metadata', async () => {
    const { status, body } = await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrn: '12345' }),
    });
    expect(status).toBe(201);
    const meta = body as { id: string; mrn: string; stoppedAt: string | null };
    expect(meta.mrn).toBe('12345');
    expect(meta.id).toMatch(/^12345-\d{8}-\d{6}$/);
    expect(meta.stoppedAt).toBeNull();
  });

  it('POST /sessions without mrn returns 400', async () => {
    const { status, body } = await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'mrn is required' });
  });

  it('POST /sessions/:id/stop closes an active session', async () => {
    const start = await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrn: '12345' }),
    });
    const { id } = start.body as { id: string };
    const { status, body } = await fetchJson(`${base}/sessions/${id}/stop`, { method: 'POST' });
    expect(status).toBe(200);
    expect((body as { stoppedAt: string | null }).stoppedAt).not.toBeNull();
  });

  it('POST /sessions/:id/stop on unknown id returns 404', async () => {
    const { status } = await fetchJson(`${base}/sessions/nope-20260101-000000/stop`, {
      method: 'POST',
    });
    expect(status).toBe(404);
  });

  it('GET /sessions lists recordings newest-first', async () => {
    await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrn: 'A' }),
    });
    await new Promise((r) => setTimeout(r, 1100));
    await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrn: 'B' }),
    });
    const { status, body } = await fetchJson(`${base}/sessions`);
    expect(status).toBe(200);
    const list = (body as { sessions: Array<{ mrn: string }> }).sessions;
    expect(list.length).toBe(2);
    expect(list[0]!.mrn).toBe('B');
    expect(list[1]!.mrn).toBe('A');
  });

  it('GET /sessions/:id returns metadata; 404 for unknown', async () => {
    const start = await fetchJson(`${base}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mrn: '12345' }),
    });
    const { id } = start.body as { id: string };
    const { status, body } = await fetchJson(`${base}/sessions/${id}`);
    expect(status).toBe(200);
    expect((body as { mrn: string }).mrn).toBe('12345');

    const unknown = await fetchJson(`${base}/sessions/nope-20260101-000000`);
    expect(unknown.status).toBe(404);
  });

  it('returns 404 for an unknown path', async () => {
    const { status } = await fetchJson(`${base}/unknown`);
    expect(status).toBe(404);
  });
});
