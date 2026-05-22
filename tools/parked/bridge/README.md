# @sedation-pro/bridge

HL7-to-REST bridge for the Sedation Pro app. Listens to an Edan X10 (or any
HL7 v2 sender that speaks MLLP over TCP) on the office LAN and exposes the
recorded vitals stream as files the app can attach to the chart.

## What it does

1. **Receives** a continuous HL7 stream from the patient monitor over Wi-Fi.
2. **Buffers** the bytes into a per-case recording, keyed by MRN. The Sedation
   Pro app opens a recording session at the first Phase 3 vitals stamp and
   closes it at Phase 4 release.
3. **Stores** each recording as a `<mrn>-<UTC-timestamp>.hl7` (raw MLLP stream)
   - `<mrn>-<UTC-timestamp>.json` (metadata) pair on disk.
4. **Exposes** a tiny REST surface so the app can drive the lifecycle and
   download the recording for the printed clinical note's monitor appendix.

## Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @sedation-pro/bridge build
pnpm --filter @sedation-pro/bridge start
```

Or in dev:

```sh
pnpm --filter @sedation-pro/bridge dev
```

## Config (env vars)

| Var                  | Default        | Meaning                                 |
| -------------------- | -------------- | --------------------------------------- |
| `BRIDGE_HL7_PORT`    | `2575`         | TCP port the monitor sends HL7 to       |
| `BRIDGE_HTTP_PORT`   | `8080`         | HTTP port the app calls                 |
| `BRIDGE_STORAGE_DIR` | `./recordings` | Directory for `.hl7` + `.json` per case |

For production set `BRIDGE_STORAGE_DIR` to a path the service user can write
(e.g. `/var/lib/sedation-pro/recordings`) and run via systemd or a container.

## Monitor configuration (Edan X10)

In the monitor's **Network** → **HL7** (or **EMR**) menu set:

- **Destination IP** → the bridge server's LAN IP
- **Destination port** → whatever `BRIDGE_HL7_PORT` is set to (default 2575)
- **Protocol** → MLLP / HL7 v2
- **Patient ID** → MRN (so the bridge can route by MRN)

## REST surface

| Method | Path                   | Body      | Returns                            |
| ------ | ---------------------- | --------- | ---------------------------------- |
| GET    | `/healthz`             | —         | `{ ok: true }`                     |
| POST   | `/sessions`            | `{ mrn }` | session metadata (201)             |
| POST   | `/sessions/:id/stop`   | —         | final metadata                     |
| GET    | `/sessions`            | —         | `{ sessions: [...] }` newest-first |
| GET    | `/sessions/:id`        | —         | session metadata                   |
| GET    | `/sessions/:id/raw`    | —         | raw MLLP `.hl7` bytes (download)   |
| GET    | `/sessions/:id/vitals` | —         | parsed time-series JSON            |
| GET    | `/sessions/:id/codes`  | —         | unrecognised OBX-3 codes (debug)   |

`/vitals` returns a normalised time-series of every recognised vital
(HR, SpO₂, NIBP sys/dia/mean, RESP, TEMP, EtCO₂, FiCO₂, pulse) regardless
of whether the monitor encoded OBX-3 as a manufacturer short code (`HR`,
`SpO2`, `NIBP_SYS` …), a LOINC code (`8867-4`, `2708-6`, `8480-6` …), or
an ISO/IEEE 11073 MDC code (`MDC_ECG_HEART_RATE`, `MDC_PULS_OXIM_SAT_O2`
…). `/codes` lists any OBX-3 codes the dictionary in `parse.ts` did NOT
recognise — point your monitor at the bridge for one test session, then
hit `/codes` to see what to add.

No authentication — the bridge is intended to run behind the practice
firewall on the LAN. If exposing externally, terminate TLS + add a bearer
token at the reverse proxy.

## Implementation notes

- Pure Node — only `@types/node`, `tsx`, `typescript`, and `vitest` as deps.
  No Express / Fastify / HL7 library. The MLLP parser and the minimal
  PID-3 extractor are ~100 lines combined and fully tested.
- One in-memory `SessionStore` instance fronts the disk; the `.json`
  sidecar is rewritten on every appended message so a crash mid-case loses
  at most one HL7 frame.
- Each appended message is itself MLLP-framed in the `.hl7` file, so the
  stored file is a replayable MLLP stream — easier downstream parsing than
  ad-hoc delimiters.
