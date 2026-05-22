# tools/parked — preserved-but-inactive code

Code in this folder is **not** part of the active build, test, or lint
pipeline. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`, so
anything under `tools/parked/` is automatically excluded from `pnpm
install`, `pnpm typecheck`, `pnpm test`, and CI.

The point is to keep substantive work preserved + discoverable in the
repo (rather than buried in a deleted-files git revision) for features
that are postponed but worth picking back up later.

---

## What's here

### `bridge/` — HL7-to-REST monitor recorder (Phase 3+ feature)

A complete Node.js service that listens for HL7 v2 ORU^R01 messages over
MLLP/TCP from an Edan X10 (or any HL7 monitor), buffers per-case
recordings keyed by MRN, and exposes a small REST API for the Sedation
Pro app to drive the lifecycle. The OBX parser supports manufacturer-
short codes, LOINC, and ISO/IEEE 11073 MDC identifiers via a single
dictionary so it works against any monitor without code changes.

**Status:** parked pending Phase 3 of the product roadmap. The
medicolegal capture path was fully functional + tested (41 tests across
MLLP framing, HL7 parsing, sessions, REST API, OBX-vital extraction)
when it was parked.

**Why parked:** the practice-software business model + Apple/Google
distribution path are higher-priority foundations to lock first. The
monitor-bridge integration is differentiating once a single hosted
customer asks for it; it doesn't pay for itself as day-one engineering.

**How to revive:**

1. `git mv tools/parked/bridge apps/bridge` — restores it to the
   workspace, `pnpm install` then picks up its dev deps automatically.
2. Restore the app-side integration files that were removed when the
   bridge was parked (recover from git history at commit
   `bd89e78` / `bc86290`):
   - `apps/mobile/src/stores/monitor.ts`
   - `apps/mobile/src/composables/useMonitorRecording.ts`
   - `bridgeUrl: string | null` field on `Formulary` in
     `packages/clinical/src/formulary/types.ts` + `default.ts`
   - StickyBar.vue — `monitorPill` computed + render
   - Phase3View.vue — `monitorRecording.start(patient.mrn)` in
     `stampPreOpVitals()`
   - Phase4View.vue — `monitorRecording.stop()` in `releasePatient()`,
     `monitorBridgeConfigured` + `monitorSummary` + Card 14 sub-section
   - App.vue — `monitorRecording.beginHealthPolling()` in setup
   - useCaseReset.ts — `void monitorRecording.stop()` before localStorage wipe
3. Bridge's own `README.md` (inside `bridge/`) documents env vars,
   monitor setup, REST surface, and the deliberately-shallow security
   posture (LAN-only, no auth).

**Spec it was designed to:** record continuous monitor stream → attach
to chart as the medicolegal "monitor strip" → replace the printed-then-
scanned pulse-ox printout workflow. Recording opens at first Phase 3
vitals stamp, closes at Phase 4 release, keyed by MRN, with per-case
`.hl7` (raw MLLP) + `.json` (metadata) files on disk.
