import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import type { SessionStore } from './sessions.js';

/**
 * Tiny REST surface the app calls to drive recording lifecycle.
 *
 *   POST /sessions          body: { mrn }      → open a recording for MRN
 *   POST /sessions/:id/stop                    → close a recording
 *   GET  /sessions                             → list all (newest first)
 *   GET  /sessions/:id                         → metadata
 *   GET  /sessions/:id/raw                     → download raw MLLP bytes
 *   GET  /healthz                              → liveness probe
 *
 * No auth — the bridge lives on the office LAN behind the practice's
 * firewall, talking only to the monitor and the iPad. If we ever publish
 * the API beyond the LAN, a static bearer-token check goes here.
 */

export interface ApiOptions {
  readonly port: number;
  readonly store: SessionStore;
}

interface RouteContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly store: SessionStore;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw === '') return {};
  return JSON.parse(raw);
}

async function handleStart(ctx: RouteContext): Promise<void> {
  const body = (await readJsonBody(ctx.req)) as { mrn?: unknown };
  const mrn = typeof body.mrn === 'string' ? body.mrn.trim() : '';
  if (mrn === '') {
    json(ctx.res, 400, { error: 'mrn is required' });
    return;
  }
  const meta = await ctx.store.start(mrn);
  json(ctx.res, 201, meta);
}

async function handleStop(ctx: RouteContext, id: string): Promise<void> {
  const meta = await ctx.store.stop(id);
  if (!meta) {
    json(ctx.res, 404, { error: 'session not found or already stopped' });
    return;
  }
  json(ctx.res, 200, meta);
}

async function handleGet(ctx: RouteContext, id: string): Promise<void> {
  const meta = await ctx.store.get(id);
  if (!meta) {
    json(ctx.res, 404, { error: 'session not found' });
    return;
  }
  json(ctx.res, 200, meta);
}

async function handleList(ctx: RouteContext): Promise<void> {
  const all = await ctx.store.list();
  json(ctx.res, 200, { sessions: all });
}

async function handleRaw(ctx: RouteContext, id: string): Promise<void> {
  const meta = await ctx.store.get(id);
  if (!meta) {
    json(ctx.res, 404, { error: 'session not found' });
    return;
  }
  ctx.res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${meta.id}.hl7"`,
  });
  createReadStream(ctx.store.rawFilePath(id)).pipe(ctx.res);
}

export function createApi(opts: ApiOptions): Server {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const ctx: RouteContext = { req, res, store: opts.store };

      if (req.method === 'GET' && url.pathname === '/healthz') {
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/sessions') {
        await handleStart(ctx);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/sessions') {
        await handleList(ctx);
        return;
      }
      const stopMatch = url.pathname.match(/^\/sessions\/(.+)\/stop$/);
      if (req.method === 'POST' && stopMatch) {
        await handleStop(ctx, decodeURIComponent(stopMatch[1]!));
        return;
      }
      const rawMatch = url.pathname.match(/^\/sessions\/(.+)\/raw$/);
      if (req.method === 'GET' && rawMatch) {
        await handleRaw(ctx, decodeURIComponent(rawMatch[1]!));
        return;
      }
      const getMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && getMatch) {
        await handleGet(ctx, decodeURIComponent(getMatch[1]!));
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
    }
  });
  server.listen(opts.port);
  return server;
}
