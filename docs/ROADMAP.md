# Roadmap

Production rebuild of the Apex Dental IV-sedation app as a Capacitor +
Vue 3 hybrid for the App Store and Google Play.

The nine phases below take the project from an empty repo to a submitted
build. Each phase has a single deliverable, an explicit exit gate, and
its scope is small enough to land in one focused session.

## Status

| Phase                                | Status     | Package(s)                              |
| ------------------------------------ | ---------- | --------------------------------------- |
| 0 · Foundation scaffold              | ✅ Done    | repo · `apps/mobile` · `packages/*`     |
| 1 · Clinical engine                  | ✅ Done    | `@sedation-pro/clinical` v0.1.0         |
| 2 · UI primitives                    | ⏳ Next    | `@sedation-pro/ui`                      |
| 3 · App shell + navigation           | ⏳ Pending | `apps/mobile`                           |
| 4 · Assessment + premed screens      | ⏳ Pending | `apps/mobile`                           |
| 5 · Persistence + custom formularies | ⏳ Pending | `@sedation-pro/persistence`             |
| 6 · IV sedation + recovery + note    | ⏳ Pending | `apps/mobile`                           |
| 7 · Native integration               | ⏳ Pending | Capacitor (iOS + Android)               |
| 8 · Store readiness                  | ⏳ Pending | `tools/store-assets/`                   |
| 9 · Submission + launch              | ⏳ Pending | App Store Connect · Google Play Console |

## Phase 0 — Foundation scaffold ✅

**Deliverable.** Empty repo to a working pnpm workspace monorepo with CI,
formatting, typecheck, test, and build all wired up.

**Shipped.**

- pnpm 10 + Node 22 + TS 5.9 strict mode across four workspaces.
- `apps/mobile` (Vue 3.5 + Vite 6 + Pinia + Vue Router + Capacitor 6.2)
  with iOS-style design tokens (`tokens.css`) and base typography
  (`base.css`).
- `packages/clinical`, `packages/ui`, `packages/persistence` placeholders.
- `.github/workflows/ci.yml` — format · typecheck · test · build on push
  and PR.
- `docs/DEVELOPMENT.md`, `LICENSE` (proprietary placeholder).

**Exit gate.** All four `pnpm` scripts green on a clean
`--frozen-lockfile` install. Bundle ~38 KB gzipped.

## Phase 1 — Clinical engine ✅

**Deliverable.** Pure-TS engine implementing every clinical rule the legacy
app encoded, with the formulary modelled as data so practices can ship
their own drugs and ceilings without touching code.

**Shipped.**

- `DEFAULT_FORMULARY` with Apex's drugs (5 IV, 3 oral, 1 bedtime,
  5 local anesthetics), ceilings, and wait windows.
- Dosing math: half-life decay, IV synergy ceiling (benzo reduced 30%
  when any opioid is on board), Malamed combined-percent with active-dose
  decay, oral anxiolytic max-dose calculator.
- Gates: OSA-diazepam interlock, release eligibility (20 min standard,
  120 min after flumazenil), pre-med wait (30 min), drug timers (Versed
  cooling/ramping/ready, Fentanyl cooling/ready), last-exam age-tiered
  cutoffs, Phase 1 required-fields registry.
- Vitals: BMI categories (CDC ranges), BP stages (AHA 2017+), SpO₂ tiers.
- Protocols: nicotine pre-op cessation tiers.
- 94 Vitest cases, 99.21 % statement coverage, 100 % function coverage.

**Exit gate.** Coverage ≥ 80 %, all engine functions accept a `Formulary`
override, no I/O or non-deterministic calls inside the engine.

## Phase 2 — UI primitives (`@sedation-pro/ui`) ⏳

**Deliverable.** Headless and styled Vue components consumed by
`apps/mobile`. Every component reads its design tokens from
`tokens.css` so theming and dark mode are centralised.

**Scope.**

- Layout: `<Card>`, `<Stack>`, `<Row>`, `<Sheet>`, `<Section>`.
- Form: `<TextInput>`, `<NumberInput>`, `<Select>`, `<Checkbox>`,
  `<RadioGroup>`, `<DateInput>`, `<BpInput>` (paired sys/dia).
- Action: `<Button>`, `<DrugButton>` (with cooldown + check overlay),
  `<IconButton>`.
- Feedback: `<Toast>`, `<UndoToast>`, `<Modal>`, `<BottomSheet>`,
  `<Banner>`.
- Display: `<DrugSwatch>`, `<TimerPill>`, `<PercentBar>`, `<StatusPill>`,
  `<SyringeIllustration>` (5 SVG variants).
- Story-style examples in `packages/ui/src/__demos__/` so apps/mobile can
  iframe them during development.

**Exit gate.** Components type-check, render in `apps/mobile`'s
`HomeView`, and have a `@sedation-pro/ui` smoke test asserting key exports.

## Phase 3 — App shell + navigation ⏳

**Deliverable.** The four-phase workflow scaffolding: phase headers,
sticky progress bar, navigation drawer, undo toast queue, modal stack.
No clinical screens yet — just the shell that hosts them.

**Scope.**

- Vue Router routes per phase + a "Quick Reference" route.
- Pinia stores for: current phase/step, event log (chronological),
  undo stack, modal/toast queues.
- Sticky progress bar with phase-tinted theme (blue / purple / orange /
  green) driven by the active phase store.
- Nav drawer with phase ring progress + per-step completion ticks.
- Phase-gating: Phase 2/3/4 disabled until `@sedation-pro/clinical`'s
  `phase1Completeness` returns `complete: true`.
- Undo toast: slides in after each logged event, 8-second auto-dismiss,
  one-tap reverse.
- Global emergency button → jumps to Quick Reference → Emergency
  Protocols. No matter which phase is active.

**Exit gate.** Empty phase screens reachable via header taps and via nav
drawer, gating respected, undo round-trips for a synthetic event.

## Phase 4 — Assessment + premed screens ⏳

**Deliverable.** Phase 1 (pre-sedation assessment) and Phase 2 (oral
premedication) screens, fully wired to the clinical engine.

**Scope.**

- Phase 1 cards: Patient ID · Caregiver · Vitals & Metrics · Medical
  History · Social Screening · Safety Checklist · Bedtime Premedication.
- Live BMI / BP / SpO₂ / nicotine readouts via `@sedation-pro/clinical`.
- Phase 1 required-fields driven by `PHASE1_REQUIRED_FIELDS`. Clearance
  percentage in sticky bar.
- Diazepam button cluster uses `diazepamGate` — blocks on missing OSA,
  shows override modal on documented OSA/CPAP.
- Phase 2: Triazolam · Lorazepam · Hydroxyzine dose buttons with
  max-dose hint from `triazolamMax`/`lorazepamMax` (using entered
  weight). Logs to the event store with timestamp.

**Exit gate.** Filling in mock patient data unlocks Phase 2; a premed tap
logs a stamped event and updates the sticky bar.

## Phase 5 — Persistence + custom formularies ⏳

**Deliverable.** `@sedation-pro/persistence` package — adapter interface,
Capacitor Preferences implementation, and IndexedDB fallback for web
development.

**Scope.**

- `StorageAdapter` interface (get / set / delete / clear, all
  Promise-based).
- Capacitor `Preferences` plugin wrapper.
- Web IndexedDB fallback (via `idb-keyval`) used when Capacitor is
  unavailable.
- Stores: current session (autosave + restore on reload), practice
  profile (provider name, practice name, assistants list), **custom
  formulary** (replaces or extends `DEFAULT_FORMULARY`).
- Schema versioning so a stored session from v0.1.x can migrate forward
  on engine upgrades.
- Custom-formulary editor UI hidden behind a settings screen — full
  editing in Phase 8.

**Exit gate.** Reload preserves a half-filled Phase 1 session; a custom
formulary entry overrides `DEFAULT_FORMULARY` for one engine call.

## Phase 6 — IV sedation + recovery + clinical note ⏳

**Deliverable.** Phase 3 (IV sedation and procedure) plus Phase 4
(recovery, discharge, and clinical note) screens.

**Scope.**

- Phase 3: N₂O on/off, IV start (with pre-med wait chip), initial dose,
  additional doses, sedation level vitals, procedure start, local
  anesthesia. All buttons use `exec()` cooldown + check overlay.
- Drug timer pills powered by `versedTimer` / `fentanylTimer`.
- IV sedation max-dose tracker + Malamed combined-percent card live
  via `ivSedationStatus` / `localCombined`.
- Reversal panel: flumazenil + naloxone with the process boxes the
  legacy app shows on first tap.
- Phase 4: recovery vitals stamp, IV-out countdown chip
  (`releaseEligibility`), discharge checklist, release-patient button
  (with "do not dismiss" guards), clinical note review bottom sheet,
  signature pad, generated clinical note ready to print or share.

**Exit gate.** A full mock session — Phase 1 → release — produces a
clinical note that includes every logged event in chronological order,
with the provider's signature.

## Phase 7 — Native integration ⏳

**Deliverable.** Real iOS and Android builds running on device.

**Scope.**

- `cap add ios` + `cap add android` on developer machines (not in CI).
- Wake-lock plugin (`@capacitor-community/keep-awake` or platform APIs).
- Haptics plugin (`@capacitor/haptics`) — replaces the web
  `navigator.vibrate` patterns from the legacy app.
- Native share for clinical-note export (`@capacitor/share`).
- Safe-area insets handled in CSS (already wired in `base.css`).
- Status bar styling, splash screen, app icon (1024 + 512).
- Permissions plist / manifest entries for the plugins above.

**Exit gate.** App installs from Xcode and Android Studio onto physical
devices; running a mock session keeps the screen awake and produces
haptic feedback on dose taps.

## Phase 8 — Store readiness ⏳

**Deliverable.** App Store Connect and Google Play Console listings
populated, screenshots prepared, privacy and clinical disclaimers
authored, internal audit passed.

**Scope.**

- Real `appId` chosen and replaced (placeholder is
  `com.example.sedationpro` — irreversible after first upload).
- Screenshots at required device sizes (`tools/store-assets/`).
- App Store description, keywords, support URL, marketing URL, privacy
  policy URL.
- App Privacy disclosures (data collection: none by default; sessions
  stored locally only unless the practice opts into export).
- Clinical / medical-device disclaimer: this app is a documentation aid,
  not a medical device; clinical decisions remain the prescriber's
  responsibility.
- Settings screen for practice profile + custom formulary editor.
- Final security review: no PHI in logs, no third-party trackers, all
  storage local, no network calls without explicit user action.

**Exit gate.** TestFlight build delivered to the practice; internal
review sign-off; legal review of disclaimers complete.

## Phase 9 — Submission + launch ⏳

**Deliverable.** App accepted on both stores and a v1.0.0 tagged
release.

**Scope.**

- App Store: submit via Xcode → App Store Connect, respond to review
  notes, hit "Release this version" once approved.
- Google Play: production track release via Play Console, complete the
  data safety form, await review.
- Post-launch: crash reporting (opt-in), version tag, changelog,
  release notes.
- A first practice runs a real (non-clinical) dry run end-to-end with
  staff observation — sign-off before clinical use.

**Exit gate.** Both store listings live, the practice has installed the
production build, a recorded dry-run case completes without engine
errors or undo regrets.

## Out of scope (for v1)

- Multi-tenant cloud sync — sessions stay on-device.
- Telehealth / remote monitoring.
- Pediatric sedation — adult workflow only.
- Non-IV sedation modalities beyond oral premedication.
- EHR integration (Open Dental, Dentrix) — exportable note only.

Each is a candidate for v2 once v1 is live and stable.
