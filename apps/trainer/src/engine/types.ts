import type { Syringe, SyringeSize } from './syringe';

/**
 * The contract between a scenario (content), the engine (time and
 * physiology) and the screens (display).
 *
 * A scenario never touches the clock or the DOM. It answers two questions
 * with plain functions of a read-only `Ctx`: "given what the team is doing,
 * where is this patient heading?" (`drive`) and "has something happened that
 * changes the story?" (`transitions`, `reactions`). The engine does the
 * rest, which is what keeps a scenario short and makes it testable without
 * a browser.
 */

export interface Vitals {
  hr: number;
  spo2: number;
  /** True arterial pressure. The monitor only shows it at its next cuff cycle. */
  sbp: number;
  dbp: number;
  /** `null` while no CO₂ waveform is being read. */
  etco2: number | null;
  /** The patient's own breaths per minute; 0 is apnea. */
  rr: number;
}

/** Capnography trace: square, obstructed "shark fin", or no waveform at all. */
export type Capno = 'normal' | 'sharkfin' | 'flat';

export type Rhythm = 'sinus' | 'vtach';

/** How the patient looks, for the figure beside the monitor. */
export interface Look {
  readonly color: 'pink' | 'pale' | 'flushed' | 'dusky' | 'grey';
  readonly eyes: 'open' | 'closed';
  /** Free text under the figure: "hives on the neck and chest". */
  readonly note?: string;
}

/** A value drifting toward a target at a fixed rate (units per second). */
export interface Target {
  readonly to: number;
  readonly rate: number;
}

/** What a phase says the patient is doing right now. Re-asked every tick. */
export interface Drive {
  /** SpO₂ change per second, signed. */
  readonly spo2Rate: number;
  readonly hr: Target;
  readonly sbp: Target;
  readonly dbp: Target;
  readonly rr: number;
  /** `null` = no waveform (apnea with nobody bagging, or a shut airway). */
  readonly etco2: Target | null;
  readonly capno: Capno;
  /** `closed` means bagging moves no air (complete laryngospasm). */
  readonly airway: 'open' | 'closed';
  readonly rhythm?: Rhythm;
  readonly look?: Look;
}

/** 'Pen': the adult Auvi-Q, which speaks its own steps once out of its case. */
export type Speaker = 'DA' | 'Front desk' | 'Patient' | 'You' | 'EMS' | 'Pen';

export interface Voice {
  readonly who: Speaker;
  readonly line: string;
}

export interface PromptOption {
  readonly id: string;
  readonly label: string;
}

/** A decision the story forces. The clock keeps running while it is open. */
export interface Prompt {
  readonly id: string;
  readonly voice: Voice;
  readonly options: ReadonlyArray<PromptOption>;
}

export type Tone = 'good' | 'bad' | 'neutral';

/** One thing the story does: a line of scene, a voice, a timeline entry. */
export interface Beat {
  readonly scene?: string;
  readonly voice?: Voice;
  /** Timeline entry. Omit for beats that are only atmosphere. */
  readonly log?: string;
  readonly tone?: Tone;
  readonly flags?: ReadonlyArray<string>;
  /** Cart actions this beat counts as done (the front desk calls 911 once told to). */
  readonly counts?: ReadonlyArray<string>;
  /** Toggles this beat switches back off (an awake patient pushes the mask away). */
  readonly off?: ReadonlyArray<string>;
  readonly prompt?: Prompt;
  /** Immediate nudge to the vitals (a stimulated breath, a cough). */
  readonly bump?: Partial<Record<'spo2' | 'hr' | 'sbp' | 'dbp', number>>;
  /**
   * Skip a protocol wait. The clock jumps and a card says so, because a
   * silent skip would teach "second dose after forty seconds".
   */
  readonly cut?: TimeCut;
}

export interface TimeCut {
  readonly seconds: number;
  /** The card: "Five minutes after the pen". */
  readonly title: string;
  /** Where the patient is when the story resumes. */
  readonly vitals?: Partial<Vitals>;
}

export interface DoseEvent {
  readonly t: number;
  readonly phase: string;
  readonly drugKey: string;
  readonly drugName: string;
  readonly mcg: number;
  /** 0 for a device with nothing drawn (auto-injector, inhaler). */
  readonly ml: number;
  readonly route: 'IV' | 'IM' | 'inhaled';
  readonly mcgPerMl: number;
  readonly syringeMl: SyringeSize | null;
  readonly labeled: boolean;
  /** Cart device id when it was not drawn from a vial. */
  readonly device: string | null;
}

/** Everything a scenario may ask about the run so far. Read-only. */
export interface Ctx {
  /** Seconds since the scenario started. */
  readonly t: number;
  readonly phase: string;
  /** Seconds since the current phase began. */
  readonly phaseT: number;
  readonly vitals: Readonly<Vitals>;
  /** Is this toggle (BVM, jaw thrust, 100% O₂, a position) on right now? */
  on(toggle: string): boolean;
  /** When the action was first done (scenario seconds), or `null`. */
  at(action: string): number | null;
  /** When it was last done, or `null`. For a toggle: when it was last switched on. */
  last(action: string): number | null;
  count(action: string): number;
  /** Doses of a drug so far, oldest first. */
  given(drugKey: string): ReadonlyArray<DoseEvent>;
  has(flag: string): boolean;
  answer(promptId: string): string | null;
  /** When the run first entered a phase (scenario seconds), or `null` if it never did. */
  entered(phase: string): number | null;
  /** Was this toggle on at any moment while the run was in that phase? */
  onDuring(toggle: string, phase: string): boolean;
}

export interface Transition {
  when(ctx: Ctx): boolean;
  /**
   * A phase id, `end:<ending key>`, or `stay` to play the beat without
   * leaving the phase (guard it with a flag so it plays once).
   */
  readonly to: string;
  /** A function when the beat depends on the run (a cut sized to land on a protocol time). */
  readonly beat?: Beat | ((ctx: Ctx) => Beat);
}

/** A line the assistant says once if the team has not acted by then. */
export interface Nudge {
  /** Seconds into the phase. */
  readonly after: number;
  when(ctx: Ctx): boolean;
  readonly voice: Voice;
  /** Shown only in coached mode (it gives the next step away). */
  readonly coachedOnly?: boolean;
}

export interface Phase {
  drive(ctx: Ctx): Drive;
  readonly transitions: ReadonlyArray<Transition>;
  readonly nudges?: ReadonlyArray<Nudge>;
}

export type PlayerEvent =
  | { readonly kind: 'action'; readonly id: string; readonly on?: boolean }
  | { readonly kind: 'dose'; readonly dose: DoseEvent }
  | { readonly kind: 'draw'; readonly drugKey: string; readonly syringeMl: SyringeSize }
  | { readonly kind: 'answer'; readonly promptId: string; readonly optionId: string };

/** A scenario's response to something the player did. Return nothing to stay silent. */
export type Reaction = (ctx: Ctx, event: PlayerEvent) => Beat | void;

export type Outcome = 'recovered' | 'handover' | 'harm' | 'arrest';

export interface Ending {
  readonly outcome: Outcome;
  readonly title: string;
  readonly text: string;
}

/**
 * Points at the protocol text an item grades. The debrief prints that text,
 * never a paraphrase, and a test fails if the protocol no longer says it.
 */
export type ProtocolRef =
  | { readonly protocol: string; readonly step: string }
  | { readonly protocol: string; readonly drug: string; readonly note: string };

/** One act inside a step that bundles several ("Jaw thrust plus firm pressure at…"). */
export interface RubricPart {
  /** The words of the step this part stands for. A test holds it to the step text. */
  readonly quote: string;
  check(run: Ctx): boolean | null;
}

interface RubricBase {
  readonly id: string;
  readonly ref: ProtocolRef;
  /**
   * `core` counts toward the score. `extra` is an add-on the protocol lists
   * but the run does not need. `echo` is an act already scored under another
   * protocol, shown again where a sibling protocol words it; neither of the
   * last two is scored.
   */
  readonly tier: 'core' | 'extra' | 'echo';
  /** When it was done, for the debrief timeline. */
  when?(run: Ctx): number | null;
}

/**
 * A step is graded whole (`check`) or act by act (`parts`). Either way
 * `true` is done, `false` is missed, and `null` means the run never reached
 * the point where it applies.
 */
export type RubricItem = RubricBase &
  (
    | { check(run: Ctx): boolean | null; readonly parts?: undefined }
    | { readonly parts: ReadonlyArray<RubricPart>; readonly check?: undefined }
  );

export interface Scenario {
  readonly id: string;
  /**
   * One word, in quotes on screen: "Quiet". It may be the sign the team would
   * see ("Stridor": owner, Nov 2026, so a drill can be found by it). It is
   * never the name of the emergency.
   */
  readonly title: string;
  /** One line for the scenario card. No spoilers. */
  readonly tagline: string;
  /** Protocol ids the run is graded against. Revealed in the debrief only. */
  readonly protocols: ReadonlyArray<string>;
  /** The Florida-required topics this covers, as the rule names them. */
  readonly floridaTopics: ReadonlyArray<string>;
  readonly patient: { readonly summary: string; readonly name: string };
  /** Briefing lines: procedure, IV, what has been given. */
  readonly setup: ReadonlyArray<string>;
  /** Story clock at t = 0, minutes after midnight. */
  readonly startsAtMin: number;
  readonly initial: {
    readonly vitals: Vitals;
    readonly phase: string;
    readonly scene: string;
    readonly voice?: Voice;
    readonly look: Look;
    readonly capno: Capno;
    /** Toggles already on when the scene opens (e.g. N₂O still running is the absence of `o2`). */
    readonly on?: ReadonlyArray<string>;
    /** How old the pressure on the monitor already is when the scene opens, in seconds. */
    readonly nibpAgeSec?: number;
  };
  readonly phases: Readonly<Record<string, Phase>>;
  /** Checked before the phase's own transitions, in every phase. */
  readonly always?: ReadonlyArray<Transition>;
  /**
   * Keyed by cart action id, cart device id, `give:<drugKey>` for a dose from
   * the bench, `draw:<drugKey>` the first time a drug goes into a syringe, or
   * `answer:<promptId>`.
   */
  readonly reactions?: Readonly<Record<string, Reaction>>;
  readonly endings: Readonly<Record<string, Ending>>;
  readonly rubric: ReadonlyArray<RubricItem>;
}

export interface LogEntry {
  readonly t: number;
  readonly text: string;
  readonly tone: Tone;
}

export type AlarmId = 'spo2_low' | 'apnea';

export type AlarmLevel = 'none' | 'limit' | 'urgent';

/** One point of the flight recorder the debrief draws. */
export interface Sample {
  readonly t: number;
  readonly spo2: number;
  readonly hr: number;
  readonly sbp: number;
}

/** A time cut that happened, for the card on screen and the break in the recorder. */
export interface CutRecord {
  readonly at: number;
  readonly seconds: number;
  readonly title: string;
}

export interface NibpReading {
  readonly sbp: number;
  readonly dbp: number;
  /** Scenario seconds when the cuff finished. */
  readonly at: number;
}

/** What the monitor shows. Derived by the engine; screens only draw it. */
export interface MonitorView {
  readonly hr: number;
  readonly spo2: number;
  readonly etco2: number | null;
  readonly rr: number;
  /** True while someone is bagging and air is moving. */
  readonly bagged: boolean;
  readonly capno: Capno;
  readonly rhythm: Rhythm;
  readonly nibp: NibpReading | null;
  /** True while the cuff is inflating for a reading. */
  readonly cuffCycling: boolean;
  /** 0..1 pleth amplitude: a weak trace when the pressure is low. */
  readonly perfusion: number;
  readonly alarms: ReadonlyArray<AlarmId>;
  /** How urgent the worst active alarm is: `limit` a breached limit, `urgent` no breath or a deep desaturation. */
  readonly alarmLevel: AlarmLevel;
}

export type { Syringe, SyringeSize };
