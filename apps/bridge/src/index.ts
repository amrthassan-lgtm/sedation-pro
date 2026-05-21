import { SessionStore } from './sessions.js';
import { createListener } from './listener.js';
import { createApi } from './api.js';

/**
 * Bridge entry point. Two listeners boot in parallel:
 *
 *   - TCP / MLLP listener for the Edan X10 (default port 2575)
 *   - HTTP REST API for the Sedation Pro app (default port 8080)
 *
 * Both share a single SessionStore writing to `STORAGE_DIR` (defaults to
 * ./recordings — set to an absolute path on the production server, e.g.
 * /var/lib/sedation-pro/recordings).
 *
 * Configuration is via env vars only — keeps the bridge simple to deploy
 * as a systemd unit or a container with no app-level config file.
 */

const HL7_PORT = Number(process.env.BRIDGE_HL7_PORT ?? '2575');
const HTTP_PORT = Number(process.env.BRIDGE_HTTP_PORT ?? '8080');
const STORAGE_DIR = process.env.BRIDGE_STORAGE_DIR ?? './recordings';

async function main(): Promise<void> {
  const store = new SessionStore(STORAGE_DIR);
  await store.init();

  createListener({ port: HL7_PORT, store });
  createApi({ port: HTTP_PORT, store });

  // eslint-disable-next-line no-console
  console.log(
    `[sedation-pro/bridge] HL7 listener on :${HL7_PORT}, HTTP API on :${HTTP_PORT}, storing in ${STORAGE_DIR}`,
  );
}

void main();
