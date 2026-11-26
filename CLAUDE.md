# CLAUDE.md

Future Claude sessions: read this first.

## What this repo is

**Sedation Pro** is a Vue 3 web app (installable PWA) for moderate IV
sedation in dental practices, deployed to GitHub Pages and run from the home
screen of the practice's Samsung tablet. There is no App Store / Play Store
build: the owner chose to stay a web app (Nov 2026), and the Capacitor
native-shell setup was removed. It's the production rebuild of a
single-file legacy app; this repo is a workspace monorepo with a pure-TS
clinical engine and a Vue 3 UI.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the nine-phase plan.

## Current status

- **Phase 0 — Foundation scaffold:** done.
- **Phase 1 — Clinical engine:** done (`@sedation-pro/clinical` v0.1.0).
- **Version 1 (Nov 2026, now 1.1.34):** the app the practice runs: assessment, oral
  and IV sedation, recovery, clinical note, Open Dental filing, emergency
  protocols and the crash-cart inventory. `APP_VERSION` in
  `apps/mobile/src/config/version.ts` is the number shown on screen and on
  every note; bump it with `apps/mobile/package.json`.

## Workspace layout

```
apps/
  mobile/                  Vue 3 + Vite web app (PWA)
  trainer/                 Emergency training simulator (served at /trainer/)
packages/
  clinical/                Pure-TS clinical engine (formulary + rules)
  ui/                      Vue UI primitives (Phase 2)
  persistence/             Storage adapter (Phase 5)
tools/
  store-assets/            App Store / Play Store screenshots + metadata
.github/workflows/         CI (format · typecheck · test · build)
docs/                      DEVELOPMENT.md, ROADMAP.md
```

## Conventions

- **Strict TypeScript everywhere.** `noUnusedLocals`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `isolatedModules`. Use `import type` for
  type-only imports.
- **Formulary is data, not constants.** Every clinical-engine function takes
  a `Formulary` parameter that defaults to `DEFAULT_FORMULARY`. Practices
  ship their own drugs, ceilings, and wait windows without touching code.
- **Tests are the spec.** The legacy app is no longer the source of truth
  for the clinical rules — the Vitest cases in `packages/clinical` are.
  Coverage floor is 80% (currently 99%). Bump the floor over time, never
  drop it.
- **Pure functions in `@sedation-pro/clinical`.** No I/O, no `Date.now()`
  inside the engine — callers pass `now: Millis` explicitly. Keeps tests
  deterministic and the engine portable.
- **Universal clinical math stays fixed.** Half-life decay, Malamed
  combined-percent, OSA-diazepam interlock, AHA BP stages, CDC BMI ranges
  are anchored to clinical standards, not practice preference. Per-practice
  drug data lives in the formulary; per-practice algorithm changes do not.
- **No comments that restate the code.** Comments should explain _why_, not
  _what_. Prefer well-named exports.

## Design bar

**Premium iOS look, always.** This is a standing instruction from the owner,
not a per-task preference. Every new surface is held to it: grouped inset
lists with hairline separators on the card's own surface, destructive and
reordering controls behind an `Edit` toggle rather than a button on every
row, 44px minimum tap targets, and a resting state that reads before it
invites action.

- **Buttons are always buttons, in one family (owner, Nov 2026).** No
  outlines and no blue: blue already means links, Fentanyl and the airway
  category. `UiButton` tone `nav` (solid grey) for anything that moves
  between screens; tone `key` (white fill, dark label) for the one main way
  forward on a screen; `compact` (48 px) in toolbars and navigation rows;
  clinical actions keep the default 56 px. Small inline actions are 44 px
  pills: grey, or white for the main one. Red stays reserved for Emergency
  and CALL 911; green for Print and success. `PicklistEditor.vue` and `InventoryView.vue` are the reference rows.

- **One-time steps on the IV sedation screen fold to one line (owner, Nov
  2026).** `StepCard.vue` and `useStepFold.ts`. Only steps done once fold
  (1, 2, 3, 5, 7, 8). The gas switch (4) and the doses (6) are tapped again
  and again through a case and stay open. A step never folds under the
  finger: one finished while you are on it stays open until it is scrolled
  past, and the page is moved by what the fold took away. Steps already
  finished come up folded on arrival, a tap opens one, and Undo reopens the
  step it undid. The folded line is read from the stamp, never from a field
  that may have been retyped. The dock follows the step 6 sedative
  buttons exactly (owner, Nov 2026): away only while all four are whole on
  screen between the top bar and the bottom edge, up the moment one is cut.
  The top edge is the bar as measured (`useDockVisibility.ts`), never a
  pixel count tuned on one tablet, so it holds on any screen. The gas (owner, Nov 2026): step 2 starts the
  mix once and then folds; from then on it is flipped from step 4 or the
  dock, which show the same two-sided control (`GasSwitch.vue`). All three
  go through `useGasSwitch.ts` and write the same two log lines, a tap that
  changes nothing writes nothing, and the time on the lit side is read from
  the log row so Undo moves it back. A step finished from elsewhere while it
  is already above the screen folds at once.
- **Never invent a CSS custom property.** The token vocabulary lives in
  `packages/ui/src/styles/tokens.css` — read it, don't guess from memory. An
  undefined `var(--whatever)` resolves to nothing and fails **silently**:
  format, typecheck, tests and build all stay green while the screen is
  wrong. Real names are `--r-sm|md|lg|xl|pill` (not `--radius-*`),
  `--color-surface-subtle|elevated|overlay` (there is no `--sunken`),
  `--sp-1..8`, `--type-caption|footnote|body|heading|title|display`.
- **Dark is the only theme.** The light palette and the theme toggle were
  removed on purpose (owner, Nov 2026): the app lives under operatory
  lighting and nobody used light. Do not add a second palette back. Check
  computed values in a real browser rather than assuming a token resolves.
- **Drive it in a browser before claiming it works.** Repeated experience in
  this repo: a dead button, a control that unmounts mid-tap, a guard that
  never fires, an unstyled row — none were visible to the suite, typecheck
  or build. Only a live drive caught them.

## Common commands

Run from the repo root:

```sh
pnpm install --frozen-lockfile
pnpm dev          # apps/mobile in browser
pnpm typecheck    # tsc/vue-tsc across all packages
pnpm test         # Vitest across all packages, with coverage in @sedation-pro/clinical
pnpm build        # apps/mobile and apps/trainer production bundles
pnpm format       # Prettier (write)
pnpm format:check # Prettier (verify, used by CI)
```

Target a single workspace:

```sh
pnpm --filter @sedation-pro/clinical test
pnpm --filter @sedation-pro/mobile dev
```

## Things to know before changing files

- **`@sedation-pro/clinical`** is consumed by both `apps/mobile` and (later)
  `packages/persistence`. Any export change is a contract change — add tests
  first, then change the export.
- **Emergency drug inventory data** lives at
  `apps/mobile/src/data/emergency-inventory.ts` and is the owner-editable
  source of truth for the practice's crash-cart stock — the owner updates
  it through Claude sessions ("labetalol arrived, lot X, expires May-28")
  or GitHub edits; every deploy updates all devices. Rules: expirations
  are month-precision pharma convention (end of labeled month);
  `protocolDrugNames` is an opt-in link to protocol callout names (absence
  renders nothing — never map the infiltration lidocaines to 'Cardiac
  Lidocaine'); `useInventoryStatus.test.ts` carries a gap-list tripwire
  that fails when protocol edits add new drug callouts, on purpose.
- **The note and the event log are a medicolegal record (owner, Nov 2026).**
  They hold what was done and when, in the doctor's words or as bare facts,
  and nothing the app inferred. A log line never names the protocol page it
  was tapped on, a diagnosis, a reason, or a word like "emergency": a doctor
  who opens the wrong page under stress must not leave a record that reads
  as the wrong diagnosis. The app writes no narrative about a rescue; when
  the log holds one (`RESCUE_EVENTS` in `composables/emergencyLog.ts`), a
  blank complications box prints "See chronological record", not "None".
  The note states what was recorded, never a conclusion: no "sedation
  achieved", no "without complication", the one sentence about the
  patient leaving is written only from the Release Patient stamp, and the
  instructions sentence only from its ticked boxes. The tables print the
  word on the button that was tapped, never a stored code. The note names
  no limit the app worked out: no dose ceiling, no percentage of one, no
  "safe". Those stay on the sedation screens, where they guide the hand. Any new sentence
  the note writes by itself, and any new log line, is shown to the owner for
  approval first. Audit for this whenever the note or the log is touched.
- **"EKG leads placed" lives on the Pre-Op Vitals card, and the first stamp
  there ticks it (owner, Nov 2026).** It left the Phase 1 safety checklist
  because a run of taps down that list could tick it with the leads still in
  the drawer, and the tick is what unlocks the IV sedatives. The stamp ticks
  it by his decision, made knowing it is the one assessment field the app
  sets by itself: the leads go on with the monitor just before those vitals.
  Until it is ticked the card reads "Place EKG leads and record pre-op
  vitals" (his wording). By hand or by the stamp, a locked assessment gets
  the same amendment row a hand tick always wrote, and Undo takes it back
  (`composables/ekgWithVitals.ts`). Do not extend the automatic tick to
  another field without asking him.
- **No staff names in the code (owner, Nov 2026).** The repo and the site
  are public. `DEFAULT_PICKLISTS.providers` and `.dentalAssistants` ship
  empty and `default.test.ts` keeps them so; test fixtures use invented
  names. Each tablet types its doctors and assistants at first-run setup
  (`components/DeviceGate.vue`), at least one of each. A new case
  pre-selects the top entry of the doctors, assistants, IV sites, IV fluids
  and catheter gauges (`PRESELECTED_LISTS` in `stores/formulary.ts`), and
  those five lists can never be emptied, so a case never opens blank. The four-digit app PIN (`stores/device.ts`, salted SHA-256) is
  asked again after 12 hours without use: a gate against a casual hand, not
  encryption. The protocol pages (`OPEN_ROUTES` in
  `composables/useDeviceGate.ts`) are never behind setup or the PIN, setup
  waits while a sedation is underway, Reset this tablet is refused during
  one, and nothing in setup writes to the case or its event log.
- **Yearly evidence review (owner, Nov 2026).** The inventory row
  `evidence-review-annual` comes due each November and warns on every tablet
  like an expiring drug. When it does, re-check every emergency protocol
  against the highest current authority: AHA ACLS (adult ALS, the bradycardia
  and tachycardia algorithms, special circumstances), the ACC/AHA atrial
  fibrillation and SVT guidelines, the anaphylaxis guidelines (AAAAI/ACAAI,
  Resuscitation Council UK), ASRA's LAST checklist and Florida 64B5-14.009.
  Show the owner each change as current vs proposed. A step that departs
  from its guideline says "office" in its text and joins the departure list
  in `emergency.test.ts` only after the owner approves it with the evidence
  in front of him: a label is never a substitute for that decision (the AF,
  junctional and anaphylaxis steps stayed off-guideline for ten days behind
  labels). Then move the row's date forward a year. This environment blocks
  heart.org; say which sources were read and which were summaries.
- **Protocol drawings are reviewed art (owner, Nov 2026).** They live in
  `apps/mobile/src/assets/protocol-figures/`, are listed in
  `apps/mobile/src/data/protocolFigures.ts` and are attached by `figure` on a
  step. Their captions are owner-approved wording, the credit line is
  required by the CC BY licence of the traced head (Larson's point is traced
  from public-domain plates and so carries no credit), and a drawing is
  medically reviewed before it ships: the tube-in-airway check and the
  generators are kept in the owner's private "Airway device references"
  artifact, not in this repo.
- **Do not touch the legacy `sedation-app` GitHub repo.** It's the only
  copy of the original single-file app now (the local `tools/legacy-source/`
  copy was removed, Nov 2026) and is read-only reference. Changes go in
  this repo (`sedation-pro`).

## Training simulator (`apps/trainer`)

A separate app in the same site, at `…/sedation-pro/trainer/`. It plays an
emergency in real time (a monitor, a patient, the practice's cart) and
debriefs the run against the practice's own protocols. It is not part of
the clinical app and must stay that way:

- **It holds no clinical wording of its own.** Every line the debrief
  prints about what should have happened is protocol text looked up through
  a `ProtocolRef`, and doses are graded from the callout's own `dose`
  string (`engine/protocol.ts`). Never write a dose, a step or advice into
  a scenario's rubric. Tests fail when a reference stops resolving.
- **The cart is the same in every scenario** (`engine/catalog.ts`). Labels
  are phrases from protocol steps and carry no dose, rate or technique. A
  scenario decides what an action does, never whether it is offered.
- **Scenario numbers are pacing, not pharmacology** (how fast a saturation
  falls, how long a drug takes). A skipped protocol wait is a `cut` with a
  card, never a silently shortened wait.
- **Unmistakably training, and walled off.** The gold TRAINING band is on
  every screen. Storage keys are all under `sedation-trainer:`; the app
  shares an origin with the clinical app, and `isolation.test.ts` forbids
  any other key, any import from `apps/mobile`, and any network request.
  No patient fields, ever: the patients are invented.
- **No pulse beep.** The practice's Edan runs on minimal alerts, so the
  monitor makes alarm tones only.
- **Deploy:** built with the clinical app and copied into its `dist/trainer`
  by `deploy-pages.yml`, so it is never in the clinical app's offline
  cache. The clinical service worker's `navigateFallbackDenylist`
  (`apps/mobile/src/config/trainer-path.ts`) keeps it from answering
  `/trainer/` with the clinical shell. Hash routing, because the site's 404
  fallback is the clinical app. The deploy runs the trainer's tests first:
  rewording a protocol step a scenario points at fails them, so fix the
  reference in the same change.
- **No lazy chunks and no worker.** The four views are imported whole in
  `router.ts`. A deploy that lands mid-drill would otherwise remove the
  chunk the debrief needs.
- **A drug acts on the patient, not on the scenario.** What a vial does in
  every room lives in `scenarios/shared.ts`; a dose of a drug the run's
  protocols never mention is listed in the debrief and withholds "Clean
  run" (`outsideProtocols` in `engine/grade.ts`).
- **A drill is titled with a sign, but not the classic one (owner, Nov
  2026).** The second sign on the page hints at the emergency without
  handing it over: "Stridor", "Cough", "Shallow", "Shockable", and "Wheeze"
  for the anaphylaxis drill. "Crown" is the exception, named for what was
  dropped.
  The title is never the emergency's name or the page's first sign, and the
  tagline gives no sign away; `scenarios.test.ts` holds both. Run records
  are kept per scenario `id`, so a drill is renamed by its `title` alone:
  "Shallow" is still `quiet` and "Cough" is still `tight`.
- **The cart reads in one order, and does not sprawl (owner, Nov 2026).** Six
  tiles: Team, Position, Airway, Breathing, Circulation, Drug tray. That is
  position, airway, breathing, circulation, drugs, with "stop and call" in
  front, so the team learns one scan. It is the default scan, not a rule over
  a page: anaphylaxis starts with epinephrine and no pulse with compressions,
  and the debrief grades against the page. Each drawer is a grid of buttons
  three across that fits one tablet screen with no scrolling
  (`drawerSections` in `engine/catalog.ts`). A button is added only when a
  drill needs it and a page names it. `kit` under a label is the practice's
  own equipment, brand only, held to the inventory by a test; `section` is a
  heading inside a drawer. In "Shallow" the front desk asks "Do you want me to
  call 911?" after the BVM page's 2 minutes of bagging with no call.
- **A step counts only while it applied (Nov 2026 review).** Oxygen put on
  with EMS at the door, or 911 called once he breathes again, reads "Not
  done". A rubric check that reads "on at the end" also asks "on while it
  mattered" (`heldBeforeEms`, `called911InSpasm`, `oxygenWhileSick`). A scene
  borrows a protocol's words through `phraseInStep`, and a pen's buttons come
  from its note (`penControls`), so both fail a test when the page is reworded.
- **The room is never left behind the debrief.** Opening the room starts a
  run, so the debrief replaces it in the history; Back must not start one. A
  call-out never undoes: an act that is on opens its drawer instead.
- **The bag is the player's to squeeze, and the pad keeps the page's time
  (owner asked for the timer, the hint and the earned hand-over, Nov 2026).**
  In the room the engine runs with `pacedBag`: a tap on BVM puts the bag in
  the player's hand, each press of `BagPad.vue` is one breath, and "bagging"
  to a story (`ctx.on('bvm')`) means air went in within the last breath and a
  half, or the assistant has the bag. While the bag is in the player's hand
  the timer is always there, in a scored run as in a practice one: a ring
  that fills over the page's gap from where the last squeeze began and reads
  as due once it has passed, and a fill that crosses the button to a mark at
  the page's breath length. After each breath one line states the fact
  ("3 s since the last breath", "Held 0.4 s") beside the page's own words for
  what it missed (`BREATH_WORDS`, borrowed with `phraseInStep`), or "On
  pace": never "too fast", never advice. What is on pace is the engine's to
  say, not the pad's (`gapOnPace`, `holdOnPace`: tolerances hung on the
  page's numbers, the gap measured from where one squeeze began to where the
  next did). The assistant takes the bag only once the player has given three
  breaths in a row on pace (`HAND_OVER_AFTER`, `handOverEarned`); earned, it
  stays earned for the run. A practice run prints the page's whole line as
  well. The gap and the length are read from the BVM page's own sentence
  (`BREATH` in `engine/engine.ts`), and the debrief draws the squeezes as
  facts (`BreathStrip.vue`: solid on pace, outlined off it), never as advice.
  A story test leaves `pacedBag` off, which is the assistant on the bag from
  the start with nothing to earn. No sound: the pacer keeps the alarms-only
  rule.
- **A bag moves air only through a way in.** In "Shallow" a jaw thrust held
  or an NPA in; in "Stridor" the pack out as well (`bagMovesAir`,
  `bagNeedsWayIn` in `scenarios/shared.ts`). Without one the assistant says
  the BVM page's own "Chest not rising", he goes on as if nobody were
  bagging, and the BVM step is not credited.
- **An ambulance that was called arrives.** Eight minutes after the call, in
  whatever phase the story is in (`emsArrives` in `scenarios/shared.ts`), and
  the run ends in a handover whose one sentence is true of the state he is
  in. A sedative given mid-emergency deepens him in every drill
  (`sedatable`), not only in "Shallow".
- **An add-on drug is graded three ways.** Left out reads "Not done · add-on"
  and costs nothing; given as written reads "Done"; given any other way reads
  "Given, not as written" and withholds "Clean run" (`wrong` in
  `engine/grade.ts`).
- **"Shockable" is the one room with no pulse (owner approved the plan and
  the mock-up, Nov 2026).** CPR is one button: the assistant compresses and
  the player runs the code from the bag, which is his for the whole arrest.
  Until an LMA or King is in, the pad's ring counts her compressions to the
  page's thirty and stands white for the two breaths of her pause (`CPR`,
  `compressions`, `pauses` in `engine/engine.ts`, read from the arrest page's
  own line). The AED is one button and says three lines (`AED_SAYS`): when it
  analyses her hands come off by themselves, and after a shock nobody is on
  the chest until the player says so. A round is played for half a minute and
  the rest of its two minutes is a `cut`. The 1 mg ampule into the vein is the
  page's dose only while he has no pulse, and the same mistake as in every
  other room once he has one (`hadPulse` in `epinephrineOverdose`). With no
  pulse the monitor draws a flat pulse wave and no SpO₂ (`Drive.pulse`), and
  the debrief draws no saturation there. In the five other rooms the same
  buttons meet a patient who has a pulse (`WITH_A_PULSE` in
  `scenarios/shared.ts`).
- `pnpm dev:trainer` runs it locally on port 5174.

## Branching and commits

- Develop on the branch the session is checked out on. The agent harness
  authorises pushes to that branch only.
- Commit messages: detailed subject + body. Body explains the _why_ and
  notes which quality gates were verified.

## When in doubt

- Read [`docs/ROADMAP.md`](docs/ROADMAP.md) to see which phase is current
  and what its exit gates are.
- Read [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the developer
  workflow (Node/pnpm versions, scripts).
- Read `packages/clinical/src/**/*.test.ts` for the executable spec of the
  clinical rules. If you're unsure about a clinical behaviour, the answer
  is in the tests.
