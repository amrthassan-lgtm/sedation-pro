import { findAction, findDevice, findVial, TUBES } from './catalog';
import {
  concentrationMcgPerMl,
  drawDrug,
  drawSaline,
  emptySyringe,
  give,
  label,
  snapMl,
  wasteTo,
  type Syringe,
  type SyringeSize,
} from './syringe';
import type {
  AlarmId,
  Beat,
  Capno,
  Ctx,
  CutRecord,
  BagHolder,
  Breath,
  Compressions,
  CyclePause,
  DoseEvent,
  Drive,
  Ending,
  LogEntry,
  Look,
  MonitorView,
  NibpReading,
  PlayerEvent,
  Prompt,
  Rhythm,
  Sample,
  Scenario,
  Target,
  TimeCut,
  Transition,
  Vitals,
  Voice,
} from './types';
import { numberInStep, phraseInStep } from './protocol';

const BREATH_STEP = 'just enough to see the chest rise';

/**
 * The breath as the BVM page writes it: one every so many seconds, each over
 * so long. Read from the page, so the bag and its pacer keep no number of
 * their own and follow a reworded page.
 */
export const BREATH = {
  everySec: numberInStep('bvm', BREATH_STEP, /1 breath every (\d+) seconds/),
  overSec: numberInStep('bvm', BREATH_STEP, /each over (\d+) second/),
} as const;

const nSeconds = (n: number): string => `${n} second${n === 1 ? '' : 's'}`;
const EVERY_WORDS = `1 breath every ${nSeconds(BREATH.everySec)}`;
const OVER_WORDS = `each over ${nSeconds(BREATH.overSec)}`;

/**
 * The same line's words for each of its two numbers, to print beside a
 * breath that missed one. Borrowed, so a reworded page fails a test instead
 * of leaving the pad quoting a line the page no longer has.
 */
export const BREATH_WORDS = {
  every: phraseInStep('bvm', BREATH_STEP, EVERY_WORDS),
  over: phraseInStep('bvm', BREATH_STEP, OVER_WORDS),
  both: phraseInStep('bvm', BREATH_STEP, `${EVERY_WORDS}, ${OVER_WORDS}`),
} as const;

/** Breaths a minute when someone is bagging as the page writes it. */
export const BAG_RATE = 60 / BREATH.everySec;

/** The sign the BVM page names for air going to the stomach, in its own words. */
const BELLY_RISING = phraseInStep('bvm', 'Belly rising', 'Belly rising');

/*
 * Pacing for a bag the player squeezes, each hung on the page's own numbers.
 * A squeeze goes on moving air for a breath and a half: a bag nobody has
 * squeezed lately is not ventilating him. Squeezes closer together than half
 * the page's gap, or held for more than twice its breath, are the ones that
 * fill the stomach; a few in a row and the belly is seen to rise.
 */
const BREATH_CARRIES_SEC = BREATH.everySec * 1.5;
const TOO_SOON_SEC = BREATH.everySec / 2;
const TOO_LONG_SEC = BREATH.overSec * 2;
const BELLY_AFTER = 4;
/** The monitor's breath rate is counted over this many of the latest squeezes. */
const RATE_OVER_BREATHS = 4;
/** As many squeezes as a minute can hold are kept for the rate and for "bagging". */
const RECENT_SQUEEZES = 60;

/*
 * How near the page's numbers a squeeze has to land to be the page's breath.
 * Pacing for a thumb on a screen, not physiology: the gap within a quarter of
 * the page's, the hold between half and one and a half times its length.
 */
const PACE_GAP = { from: BREATH.everySec * 0.75, to: BREATH.everySec * 1.25 } as const;
const PACE_HOLD = { from: BREATH.overSec * 0.5, to: BREATH.overSec * 1.5 } as const;
/** This many breaths in a row on pace, and the assistant will take the bag. */
export const HAND_OVER_AFTER = 3;

const CPR_STEP = 'CPR on the CPR board';

/**
 * CPR as the arrest pages write it, read from the page so the assistant on
 * the chest keeps no number of her own: so many compressions a minute (the
 * middle of the page's range), and so many of them to so many breaths until
 * a tube is in.
 */
export const CPR = (() => {
  const from = numberInStep('vfib_vtach', CPR_STEP, /(\d+)-\d+\/min/);
  const to = numberInStep('vfib_vtach', CPR_STEP, /\d+-(\d+)\/min/);
  return {
    perMin: (from + to) / 2,
    compressions: numberInStep('vfib_vtach', CPR_STEP, /(\d+):\d+ until/),
    breaths: numberInStep('vfib_vtach', CPR_STEP, /\d+:(\d+) until/),
  } as const;
})();

const RATIO_WORDS = `${CPR.compressions}:${CPR.breaths}`;

/** The page's words for that cycle, to print beside a pause that missed it. */
export const CPR_WORDS = {
  ratio: phraseInStep('vfib_vtach', CPR_STEP, RATIO_WORDS),
  until: phraseInStep('vfib_vtach', CPR_STEP, `${RATIO_WORDS} until an LMA/King/ET tube is placed`),
} as const;

/** The cart's compressions: one toggle, the assistant's hands on the chest. */
const COMPRESSIONS = 'cpr';

/** One set of compressions takes this long at the page's rate. */
const SET_SEC = (CPR.compressions * 60) / CPR.perMin;
/**
 * In a pause she waits for each breath as long as the BVM page puts between
 * two. None in that time, and she is back on the chest. Pacing.
 */
const PAUSE_WAIT_SEC = BREATH.everySec;
/** A bag the story squeezes gives the pause its breaths in this long: each one in and out again. */
const PAUSE_GIVEN_SEC = CPR.breaths * BREATH.overSec * 2;
/**
 * In the page's cycle the breaths come a set of compressions apart, so one
 * goes on counting as bagging for a round and a half of it.
 */
const CYCLE_CARRIES_SEC = (SET_SEC + PAUSE_WAIT_SEC) * 1.5;
/** Breaths a minute when the cycle is given as the page writes it. */
const CYCLE_RATE = Math.round((60 * CPR.breaths) / (SET_SEC + PAUSE_GIVEN_SEC));

/**
 * The gap from the breath before was the page's, near enough. The first
 * breath since the bag came to hand has none before it to be measured from.
 */
export function gapOnPace(gap: number | null): boolean {
  return gap === null || (gap >= PACE_GAP.from && gap <= PACE_GAP.to);
}

/** The squeeze was held for the page's length, near enough. */
export function holdOnPace(held: number): boolean {
  return held >= PACE_HOLD.from && held <= PACE_HOLD.to;
}

/** The cuff takes this long to inflate and read. */
const CUFF_SECONDS = 20;
/** The monitor cycles the cuff on its own this often. */
const CUFF_INTERVAL = 300;

const SPO2_ALARM_BELOW = 90;
/** Below this the saturation alarm is the urgent one. */
const SPO2_URGENT_BELOW = 80;
/** A line of scene written in response to the player gives way to the story after this long. */
const REACTION_SCENE_SECONDS = 10;
/** No CO₂ waveform for this long raises the apnea alarm. */
const APNEA_SECONDS = 20;

const SPO2_MAX = 100;
/** In "take your time" mode the saturation stops falling here. */
const FORGIVING_FLOOR = 70;
const SAMPLE_EVERY = 2;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** To the millisecond: finer than any thumb, and it keeps float dust out of a count of whole seconds. */
function toMillis(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function approach(value: number, target: Target, dt: number): number {
  const gap = target.to - value;
  const step = Math.abs(target.rate) * dt;
  return Math.abs(gap) <= step ? target.to : value + Math.sign(gap) * step;
}

interface ActionRecord {
  first: number;
  last: number;
  count: number;
}

/**
 * One run of one scenario.
 *
 * Time only moves through `tick(dt)`: the engine never reads a clock, so a
 * test can play ten minutes in a millisecond and get the same run every
 * time. The screens call `tick` from a timer and redraw from the getters.
 */
export class Simulation {
  readonly scenario: Scenario;
  /** In coached mode the assistant also says the nudges that give a step away. */
  readonly coached: boolean;
  /** "Take your time": the patient cannot be lost, so no arrest ending is ever taken. */
  readonly forgiving: boolean;
  /**
   * The player squeezes the bag themselves until they hand it over. Off, the
   * assistant has the bag from the moment it is picked up and bags as the
   * page writes, which is all a story test needs.
   */
  readonly pacedBag: boolean;

  private time = 0;
  private phaseId: string;
  private phaseStart = 0;
  private readonly body: Vitals;
  private capnoNow: Capno;
  private rhythmNow: Rhythm = 'sinus';
  private pulseNow = true;
  private lookNow: Look;
  private airwayOpen = true;

  private bagHolder: BagHolder;
  private readonly breathLog: Breath[] = [];
  private readonly assistantSpans: Array<{ from: number; to: number | null }> = [];
  /** The story's line about the bag waits for the first breath to go in. */
  private bagLinePending = false;
  private hardBreaths = 0;
  private bellyUp = false;
  private nextAssistantBreathAt = 0;
  /** Where in the log the player's present stretch of squeezes begins. */
  private inHandFrom = 0;
  /**
   * When the latest squeezes were let go, by a clock that a time cut does not
   * move: bagging the story skipped over was still bagging when it resumes.
   */
  private squeezedAt: number[] = [];
  private onPaceInARow = 0;
  private handOverWon = false;

  /** Where the assistant's hands are while CPR is on: on the chest for a set, or off it for the breaths. */
  private chest: { compressing: boolean; since: number } | null = null;
  private readonly pauseLog: Array<{
    t: number;
    ended: number | null;
    breaths: number;
    wentIn: number;
  }> = [];
  /** What she is waiting from in a pause: its start, or the breath before. */
  private pauseWaitFrom = 0;

  private readonly toggles = new Set<string>();
  /** When each toggle was on, so a story can ask for how long. */
  private readonly spans = new Map<string, Array<{ from: number; to: number | null }>>();
  private benchTouched: number | null = null;
  private readonly actions = new Map<string, ActionRecord>();
  private readonly doseLog: DoseEvent[] = [];
  private readonly flagSet = new Set<string>();
  private readonly answers = new Map<string, string>();
  private readonly deviceUses = new Map<string, number>();
  private readonly firedNudges = new Set<string>();
  private readonly phaseEntered = new Map<string, number>();
  private readonly heldIn = new Map<string, Set<string>>();

  private syringes: Syringe[] = [];
  private syringeSeq = 0;

  private sceneText: string;
  /** Scene text from a reaction, and when it gives way to the story's own. */
  private passing: { text: string; until: number } | null = null;
  private voiceLog: Voice[] = [];
  private voiceAt = -Infinity;
  private voiceTotal = 0;
  private openPrompt: Prompt | null = null;
  private readonly timeline: LogEntry[] = [];
  private finished: Ending | null = null;
  private finishedKey: string | null = null;
  private beats = 0;

  private nibp: NibpReading | null;
  private cuffDoneAt: number | null = null;
  private nextAutoCuff = CUFF_INTERVAL;
  private noWaveformSince: number | null = null;
  private lowest: number;
  /** Lowest saturation the recorder has a point for, as the monitor shows it. */
  private lowestSampled = Infinity;
  private readonly samples: Sample[] = [];
  private nextSampleAt = 0;
  private readonly cutLog: CutRecord[] = [];
  private readonly drawnInto = new Set<string>();

  constructor(
    scenario: Scenario,
    options: { coached?: boolean; forgiving?: boolean; pacedBag?: boolean } = {},
  ) {
    this.scenario = scenario;
    this.coached = options.coached ?? false;
    this.forgiving = options.forgiving ?? false;
    this.pacedBag = options.pacedBag ?? false;
    this.bagHolder = this.pacedBag ? 'player' : 'da';
    const init = scenario.initial;
    if (scenario.phases[init.phase] === undefined) {
      throw new Error(`Scenario "${scenario.id}" starts in unknown phase "${init.phase}"`);
    }
    this.phaseId = init.phase;
    this.body = { ...init.vitals };
    this.capnoNow = init.capno;
    this.lookNow = init.look;
    this.sceneText = init.scene;
    if (init.voice) {
      this.voiceLog.push(init.voice);
      this.voiceAt = 0;
      this.voiceTotal = 1;
    }
    for (const id of init.on ?? []) this.switchOn(id);
    const cuffAge = Math.max(0, init.nibpAgeSec ?? 0);
    this.nibp = {
      sbp: Math.round(init.vitals.sbp),
      dbp: Math.round(init.vitals.dbp),
      at: -cuffAge,
    };
    this.nextAutoCuff = Math.max(0, CUFF_INTERVAL - cuffAge);
    this.lowest = init.vitals.spo2;
    this.phaseEntered.set(init.phase, 0);
    this.holdToggles();
    // Known before the first tick: a scene may open on a patient who has no pulse.
    this.pulseNow = this.currentPhase().drive(this.live).pulse !== false;
  }

  /** Remember which toggles were on in this phase, so the grader can ask afterwards. */
  private holdToggles(): void {
    let held = this.heldIn.get(this.phaseId);
    if (!held) {
      held = new Set();
      this.heldIn.set(this.phaseId, held);
    }
    // A bag in the hand that nobody is squeezing was not "held" for the story's purposes.
    for (const id of this.toggles) if (id !== 'bvm' || this.bagging()) held.add(id);
  }

  // ---------------------------------------------------------------- read

  get t(): number {
    return this.time;
  }
  get phase(): string {
    return this.phaseId;
  }
  get ending(): Ending | null {
    return this.finished;
  }
  get endingKey(): string | null {
    return this.finishedKey;
  }
  get scene(): string {
    return this.passing && this.time < this.passing.until ? this.passing.text : this.sceneText;
  }
  /** Scenario seconds when the newest line was spoken. */
  get lastVoiceAt(): number {
    return this.voiceAt;
  }
  /** Newest last. Only the most recent lines are kept. */
  get voices(): ReadonlyArray<Voice> {
    return this.voiceLog;
  }
  /** Lines spoken so far. Only ever goes up, so a listener can tell a new line from a trimmed log. */
  get voiceCount(): number {
    return this.voiceTotal;
  }
  get prompt(): Prompt | null {
    return this.openPrompt;
  }
  get log(): ReadonlyArray<LogEntry> {
    return this.timeline;
  }
  get tray(): ReadonlyArray<Syringe> {
    return this.syringes;
  }
  get doses(): ReadonlyArray<DoseEvent> {
    return this.doseLog;
  }
  get look(): Look {
    return this.lookNow;
  }
  /** Vitals over the run, one point every two seconds. */
  get history(): ReadonlyArray<Sample> {
    return this.samples;
  }
  get cuts(): ReadonlyArray<CutRecord> {
    return this.cutLog;
  }
  get lowestSpo2(): number {
    return this.lowest;
  }
  /** Goes up every time the story does something. A "wait" stops fast-forwarding when it changes. */
  get beatCount(): number {
    return this.beats;
  }

  isOn(toggle: string): boolean {
    return this.toggles.has(toggle);
  }

  /** Who is squeezing the bag while it is on. */
  get bagHeldBy(): BagHolder {
    return this.bagHolder;
  }

  /** Every squeeze the player gave, oldest first. */
  get breaths(): ReadonlyArray<Breath> {
    return this.breathLog;
  }

  /** The stretches the assistant had the bag, closed at the present for one still running. */
  get assistantBagging(): ReadonlyArray<{ from: number; to: number }> {
    return this.assistantSpans.map((s) => ({ from: s.from, to: s.to ?? this.time }));
  }

  /** The latest squeeze of the player's present stretch on the bag, or null before its first. */
  get lastBreath(): Breath | null {
    return this.breathLog.length > this.inHandFrom ? (this.breathLog.at(-1) ?? null) : null;
  }

  /**
   * Seconds since that squeeze began, or null before the first. From where it
   * began, not where it was let go: the page's gap is breath to breath.
   */
  get sinceBreath(): number | null {
    const last = this.lastBreath;
    return last ? toMillis(this.time - (last.t - last.held)) : null;
  }

  /** Breaths on pace in a row in the present stretch, up to now. */
  get paceRun(): number {
    return this.onPaceInARow;
  }

  /**
   * The assistant will take the bag: the player has given enough breaths in a
   * row on pace, at some point in this run. A story test asks for no proof.
   */
  get handOverEarned(): boolean {
    return !this.pacedBag || this.handOverWon;
  }

  /**
   * A breath from the bag would go in as things stand: the story has his
   * airway open. Asked of the story now, not of the last tick, so the screen
   * can show a squeeze that raises nothing.
   */
  get breathGoesIn(): boolean {
    return this.currentPhase().drive(this.live).airway === 'open';
  }

  /** The belly is seen to rise: too many breaths too close together or held too long. */
  get belly(): boolean {
    return this.bellyUp && this.toggles.has('bvm');
  }

  /**
   * The bag is on and air is being pushed: the assistant has it, or the
   * player squeezed it a moment ago. This, not the bag being in a hand, is
   * what a story means by "bagging".
   */
  private bagging(): boolean {
    if (!this.toggles.has('bvm')) return false;
    if (this.bagHolder === 'da') return true;
    const last = this.squeezedAt.at(-1);
    const carries = this.cycling() ? CYCLE_CARRIES_SEC : BREATH_CARRIES_SEC;
    return last !== undefined && this.time - last <= carries;
  }

  /** Breaths a minute as the latest squeezes make it; the page's rate for the assistant. */
  private bagRate(): number {
    if (this.cycling()) {
      // A pause's two come a second apart and the next pair a whole set later: counted over the minute.
      if (this.bagHolder === 'da') return CYCLE_RATE;
      return this.squeezedAt.filter((t) => this.time - t <= 60).length;
    }
    if (this.bagHolder === 'da') return BAG_RATE;
    const recent = this.breathLog.slice(-RATE_OVER_BREATHS);
    const first = recent[0];
    const last = recent.at(-1);
    if (!first || !last || recent.length < 2 || last.t === first.t) return 0;
    return Math.round((60 * (recent.length - 1)) / (last.t - first.t));
  }

  private strain(hard: boolean): void {
    this.hardBreaths = clamp(this.hardBreaths + (hard ? 1 : -1), 0, BELLY_AFTER + 2);
    if (!this.bellyUp && this.hardBreaths >= BELLY_AFTER) {
      this.bellyUp = true;
      this.timeline.push({ t: this.time, text: BELLY_RISING, tone: 'bad' });
      this.beats += 1;
    } else if (this.bellyUp && this.hardBreaths === 0) {
      this.bellyUp = false;
    }
  }

  /** The story's line about the bag, held back until air is going in. */
  private bagLine(): void {
    if (!this.bagLinePending) return;
    this.bagLinePending = false;
    this.react('bvm', { kind: 'action', id: 'bvm', on: true });
  }

  /**
   * Nothing of the player's to measure the next breath from: the bag has just
   * come into their hand, or the clock has just jumped. The count of breaths
   * on pace in a row starts again with it.
   */
  private newStretch(): void {
    this.inHandFrom = this.breathLog.length;
    this.onPaceInARow = 0;
  }

  /** One squeeze of the bag by the player, held for `heldSec` and let go now. */
  squeeze(heldSec: number): boolean {
    if (this.finished || !this.toggles.has('bvm') || this.bagHolder !== 'player') return false;
    const before = this.breathLog.at(-1);
    const held = clamp(heldSec, 0.1, 10);
    const since = this.sinceBreath;
    // This squeeze began `held` ago: the gap is start to start.
    const gap = since === null ? null : toMillis(Math.max(0, since - held));
    const cycle = this.cycling() ? this.takeCycleBreath(held) : null;
    // In the page's cycle a breath is on pace when it is one of a pause's and held as the page writes.
    const onPace =
      cycle === null ? gapOnPace(gap) && holdOnPace(held) : cycle === 'pause' && holdOnPace(held);
    // In an arrest the bag stays with the player: there is no hand-over to count toward.
    const counts = this.chest === null && this.pulseNow;
    this.onPaceInARow = onPace && counts ? this.onPaceInARow + 1 : 0;
    const towardHandOver = onPace && counts && !this.handOverWon ? this.onPaceInARow : null;
    if (this.onPaceInARow >= HAND_OVER_AFTER) this.handOverWon = true;
    this.breathLog.push({
      t: this.time,
      held,
      gap,
      onPace,
      towardHandOver,
      ...(cycle === null ? {} : { cycle }),
    });
    this.squeezedAt = [...this.squeezedAt.slice(-RECENT_SQUEEZES + 1), this.time];
    this.strain(
      held > TOO_LONG_SEC || (before !== undefined && this.time - before.t < TOO_SOON_SEC),
    );
    this.bagLine();
    this.holdToggles();
    this.beats += 1;
    return true;
  }

  /**
   * Hand the bag to the assistant, or take it back. She takes it only once
   * the hand-over is earned; false when the bag stayed where it was.
   */
  handBag(to: BagHolder): boolean {
    if (this.finished || !this.toggles.has('bvm') || this.bagHolder === to) return false;
    if (to === 'da' && !this.handOverEarned) return false;
    // Her hands are on the chest, or about to be: with no pulse, the bag is the player's.
    if (to === 'da' && (this.chest !== null || !this.pulseNow)) return false;
    if (to === 'player') {
      this.bagBackInHand();
      return true;
    }
    this.bagHolder = 'da';
    this.timeline.push({ t: this.time, text: 'DA takes the bag', tone: 'neutral' });
    const saidBefore = this.voiceTotal;
    this.bagLine();
    this.assistantSpans.push({ from: this.time, to: null });
    this.nextAssistantBreathAt = this.time + BREATH.everySec;
    // The story's own line about the bag, if this is the first air to go in, is hers already.
    if (this.voiceTotal === saidBefore) this.say({ who: 'DA', line: 'I have the bag.' });
    this.holdToggles();
    this.beats += 1;
    return true;
  }

  /** The bag comes back to the player from the assistant, who was squeezing it. */
  private bagBackInHand(): void {
    this.bagHolder = 'player';
    this.timeline.push({ t: this.time, text: 'Bag taken back', tone: 'neutral' });
    this.bagLine();
    this.closeAssistantSpan();
    this.newStretch();
    this.holdToggles();
    this.beats += 1;
  }

  private closeAssistantSpan(): void {
    const open = this.assistantSpans.at(-1);
    if (open && open.to === null) open.to = this.time;
  }

  // ---------------------------------------------------------------- compressions

  /** A tube is in: from then on the page's compressions are continuous. */
  private tubeIn(): boolean {
    return TUBES.some((id) => this.toggles.has(id));
  }

  /**
   * The page's cycle applies: she is on the chest, a bag is in a hand to give
   * the breaths, and no tube is in. With no bag she has nothing to pause for.
   */
  private cycling(): boolean {
    return this.chest !== null && this.toggles.has('bvm') && !this.tubeIn();
  }

  /** Where the assistant's hands are, for the pad that counts with her; `null` while CPR is off. */
  get compressions(): Compressions | null {
    const chest = this.chest;
    if (!chest) return null;
    return {
      mode: this.cycling() ? 'cycle' : 'continuous',
      compressing: chest.compressing,
      elapsed: toMillis(this.time - chest.since),
      breaths: chest.compressing ? 0 : (this.pauseLog.at(-1)?.breaths ?? 0),
    };
  }

  /** Every pause for breaths so far, oldest first. */
  get pauses(): ReadonlyArray<CyclePause> {
    return this.pauseLog;
  }

  private backOnTheChest(at: number): void {
    const open = this.pauseLog.at(-1);
    if (open && open.ended === null) open.ended = at;
    this.chest = { compressing: true, since: at };
  }

  /** The set is counted out and her hands come off, or the pause has had its breaths or its wait. */
  private runCompressions(): void {
    const chest = this.chest;
    if (!chest) return;
    if (!this.cycling()) {
      if (!chest.compressing) this.backOnTheChest(this.time);
      return;
    }
    if (chest.compressing) {
      const due = chest.since + SET_SEC;
      if (this.time < due) return;
      this.chest = { compressing: false, since: due };
      this.pauseLog.push({ t: due, ended: null, breaths: 0, wentIn: 0 });
      this.pauseWaitFrom = due;
      return;
    }
    const pause = this.pauseLog.at(-1);
    // A bag the story squeezes gives the page's breaths: both, each over its second.
    if (this.bagHolder === 'da' && pause && this.time - pause.t >= PAUSE_GIVEN_SEC) {
      pause.breaths = CPR.breaths;
      pause.wentIn = this.breathGoesIn ? CPR.breaths : 0;
      this.backOnTheChest(this.time);
      return;
    }
    if (this.time - this.pauseWaitFrom >= PAUSE_WAIT_SEC) this.backOnTheChest(this.time);
  }

  /**
   * Which part of the cycle a squeeze let go now belongs to. One begun or let
   * go inside a pause that still wanted a breath is that pause's, even when
   * she had gone back on the chest a moment before it was let go.
   */
  private takeCycleBreath(held: number): 'pause' | 'compressions' {
    const began = this.time - held;
    const pause = this.pauseLog.at(-1);
    if (
      !pause ||
      pause.breaths >= CPR.breaths ||
      this.time < pause.t ||
      began > (pause.ended ?? this.time)
    ) {
      return 'compressions';
    }
    pause.breaths += 1;
    if (this.breathGoesIn) pause.wentIn += 1;
    this.pauseWaitFrom = this.time;
    if (pause.ended === null && pause.breaths >= CPR.breaths) this.backOnTheChest(this.time);
    return 'pause';
  }

  // ---------------------------------------------------------------- toggles

  private switchOn(id: string): void {
    if (this.toggles.has(id)) return;
    this.toggles.add(id);
    const spans = this.spans.get(id) ?? [];
    spans.push({ from: this.time, to: null });
    this.spans.set(id, spans);
    if (id !== COMPRESSIONS) return;
    this.chest = { compressing: true, since: this.time };
    // Her hands are on the chest now: a bag she had is the player's again.
    if (this.pacedBag && this.bagHolder === 'da') {
      if (this.toggles.has('bvm')) this.bagBackInHand();
      else this.bagHolder = 'player';
    }
  }

  private switchOff(id: string): void {
    if (!this.toggles.delete(id)) return;
    const open = this.spans.get(id)?.at(-1);
    if (open && open.to === null) open.to = this.time;
    if (id !== COMPRESSIONS) return;
    const pause = this.pauseLog.at(-1);
    if (pause && pause.ended === null) pause.ended = this.time;
    this.chest = null;
  }

  /** Seconds a toggle has been on in all, from `since` to now. */
  private onFor(toggle: string, since: number): number {
    let total = 0;
    for (const span of this.spans.get(toggle) ?? []) {
      total += Math.max(0, (span.to ?? this.time) - Math.max(span.from, since));
    }
    return total;
  }

  private lastOff(toggle: string): number | null {
    const spans = this.spans.get(toggle) ?? [];
    for (let i = spans.length - 1; i >= 0; i -= 1) {
      const to = spans[i]?.to ?? null;
      if (to !== null) return to;
    }
    return null;
  }

  /** How many of a counted device are left; `null` when it is not counted. */
  remaining(deviceId: string): number | null {
    const device = findDevice(deviceId);
    if (!device || device.stock === null) return null;
    return Math.max(0, device.stock - (this.deviceUses.get(deviceId) ?? 0));
  }

  get monitor(): MonitorView {
    const bagged = this.bagging() && this.airwayOpen;
    const own = Math.round(this.body.rr);
    const alarms = this.alarms();
    return {
      hr: Math.round(this.body.hr),
      spo2: Math.round(this.body.spo2),
      etco2: this.body.etco2 === null ? null : Math.round(this.body.etco2),
      // The bag sets the rate only for a patient breathing slower than it, and only
      // while there is a CO₂ trace to count it from: with no pulse and nobody on the
      // chest, air goes in and none comes back to the monitor.
      rr: bagged && this.body.etco2 !== null ? Math.max(this.bagRate(), own) : own,
      bagged,
      capno: this.capnoNow,
      rhythm: this.rhythmNow,
      nibp: this.nibp,
      cuffCycling: this.cuffDoneAt !== null,
      perfusion: this.pulseNow ? clamp((this.body.sbp - 40) / 70, 0.15, 1) : 0,
      alarms,
      alarmLevel:
        alarms.length === 0
          ? 'none'
          : alarms.includes('apnea') || Math.round(this.body.spo2) < SPO2_URGENT_BELOW
            ? 'urgent'
            : 'limit',
    };
  }

  /** One stable object, so a scenario may hold on to it between ticks. */
  private readonly live: Ctx = (() => {
    const sim = this as Simulation;
    const live: Ctx = {
      get t() {
        return sim.time;
      },
      get phase() {
        return sim.phaseId;
      },
      get phaseT() {
        return sim.time - sim.phaseStart;
      },
      get vitals() {
        return sim.body;
      },
      on: (toggle) => (toggle === 'bvm' ? sim.bagging() : sim.toggles.has(toggle)),
      at: (action) => sim.actions.get(action)?.first ?? null,
      last: (action) => sim.actions.get(action)?.last ?? null,
      count: (action) => sim.actions.get(action)?.count ?? 0,
      given: (drugKey) => sim.doseLog.filter((d) => d.drugKey === drugKey),
      has: (flag) => sim.flagSet.has(flag),
      answer: (promptId) => sim.answers.get(promptId) ?? null,
      entered: (phase) => sim.phaseEntered.get(phase) ?? null,
      onDuring: (toggle, phase) => sim.heldIn.get(phase)?.has(toggle) ?? false,
      onFor: (toggle, since = 0) => sim.onFor(toggle, since),
      lastOff: (toggle) => sim.lastOff(toggle),
      pauses: () => sim.pauseLog,
      get benchAt() {
        return sim.benchTouched;
      },
    };
    return live;
  })();

  /** Read-only view of the run for scenarios, the grader and tests. */
  get run(): Ctx {
    return this.live;
  }

  private alarms(): ReadonlyArray<AlarmId> {
    const out: AlarmId[] = [];
    // The number on the screen is what breaches the limit, as on a real monitor: with no pulse there is none.
    if (this.pulseNow && Math.round(this.body.spo2) < SPO2_ALARM_BELOW) out.push('spo2_low');
    if (this.noWaveformSince !== null && this.time - this.noWaveformSince >= APNEA_SECONDS) {
      out.push('apnea');
    }
    return out;
  }

  // ---------------------------------------------------------------- time

  tick(dt: number): void {
    if (this.finished || dt <= 0) return;
    // Long steps (a fast-forward) are cut up so a transition is never skipped past.
    let left = dt;
    while (left > 0 && !this.finished) {
      const step = Math.min(left, 0.5);
      this.step(step);
      left -= step;
    }
  }

  private step(dt: number): void {
    this.time += dt;
    this.runCompressions();
    const phase = this.currentPhase();
    const drive = phase.drive(this.live);
    this.applyDrive(drive, dt);
    this.runCuff();
    // The assistant's breaths are the page's: each one lets a risen belly settle.
    if (this.toggles.has('bvm') && this.bagHolder === 'da') {
      while (this.time >= this.nextAssistantBreathAt) {
        this.strain(false);
        this.nextAssistantBreathAt += BREATH.everySec;
      }
    }
    this.holdToggles();

    for (const nudge of phase.nudges ?? []) {
      const key = `${this.phaseId}:${nudge.after}:${nudge.voice.line}`;
      if (this.firedNudges.has(key)) continue;
      if (nudge.coachedOnly && !this.coached) continue;
      if (this.time - this.phaseStart >= nudge.after && nudge.when(this.live)) {
        this.firedNudges.add(key);
        this.play({ voice: nudge.voice });
      }
    }

    const hit = this.firstTransition([...(this.scenario.always ?? []), ...phase.transitions]);
    if (hit) this.follow(hit);
  }

  private currentPhase() {
    const phase = this.scenario.phases[this.phaseId];
    if (phase === undefined) throw new Error(`Unknown phase "${this.phaseId}"`);
    return phase;
  }

  private applyDrive(drive: Drive, dt: number): void {
    this.body.spo2 = clamp(
      this.body.spo2 + drive.spo2Rate * dt,
      this.forgiving ? FORGIVING_FLOOR : 0,
      SPO2_MAX,
    );
    this.body.hr = approach(this.body.hr, drive.hr, dt);
    this.body.sbp = approach(this.body.sbp, drive.sbp, dt);
    this.body.dbp = approach(this.body.dbp, drive.dbp, dt);
    this.body.rr = drive.rr;
    this.airwayOpen = drive.airway === 'open';
    if (drive.etco2 === null) {
      this.body.etco2 = null;
      this.noWaveformSince ??= this.time;
    } else {
      this.body.etco2 = approach(this.body.etco2 ?? drive.etco2.to, drive.etco2, dt);
      this.noWaveformSince = null;
    }
    this.capnoNow = drive.etco2 === null ? 'flat' : drive.capno;
    this.rhythmNow = drive.rhythm ?? 'sinus';
    const hadPulse = this.pulseNow;
    this.pulseNow = drive.pulse !== false;
    if (drive.look) this.lookNow = drive.look;
    // With no pulse the oximeter reads nothing: there is no number to be the lowest.
    if (this.pulseNow) this.lowest = Math.min(this.lowest, this.body.spo2);
    // A new low is always recorded, so the recorder and the debrief agree on the lowest value.
    // So is the moment the pulse goes or comes back, so the gap in the trace starts and ends on it.
    if (
      this.time >= this.nextSampleAt ||
      hadPulse !== this.pulseNow ||
      (this.pulseNow && Math.round(this.body.spo2) < this.lowestSampled)
    ) {
      this.sample();
    }
  }

  private sample(): void {
    const spo2 = Math.round(this.body.spo2);
    this.samples.push({
      t: this.time,
      spo2,
      hr: Math.round(this.body.hr),
      sbp: Math.round(this.body.sbp),
      ...(this.pulseNow ? {} : { pulseless: true as const }),
    });
    if (this.pulseNow) this.lowestSampled = Math.min(this.lowestSampled, spo2);
    this.nextSampleAt = this.time + SAMPLE_EVERY;
  }

  /** What the cuff finds: a pressure, or nothing to read on an arm with no pulse. */
  private cuffReading(): NibpReading | null {
    if (!this.pulseNow) return null;
    return { sbp: Math.round(this.body.sbp), dbp: Math.round(this.body.dbp), at: this.time };
  }

  private runCuff(): void {
    if (this.cuffDoneAt === null && this.time >= this.nextAutoCuff) {
      this.cuffDoneAt = this.time + CUFF_SECONDS;
    }
    if (this.cuffDoneAt !== null && this.time >= this.cuffDoneAt) {
      this.nibp = this.cuffReading();
      this.cuffDoneAt = null;
      this.nextAutoCuff = this.time + CUFF_INTERVAL;
    }
  }

  private firstTransition(list: ReadonlyArray<Transition>): Transition | undefined {
    return list.find((t) => this.allowed(t) && t.when(this.live));
  }

  /** In "take your time" mode the patient cannot be lost, whatever the scenario's arrest line is. */
  private allowed(transition: Transition): boolean {
    if (!this.forgiving || !transition.to.startsWith('end:')) return true;
    return this.scenario.endings[transition.to.slice(4)]?.outcome !== 'arrest';
  }

  private follow(transition: Transition): void {
    const beat =
      typeof transition.beat === 'function' ? transition.beat(this.live) : transition.beat;
    if (beat) this.play(beat);
    if (transition.to === 'stay') return;
    if (transition.to.startsWith('end:')) {
      const key = transition.to.slice(4);
      const ending = this.scenario.endings[key];
      if (ending === undefined) throw new Error(`Unknown ending "${key}"`);
      this.finished = ending;
      this.finishedKey = key;
      this.openPrompt = null;
      this.sample();
      return;
    }
    if (this.scenario.phases[transition.to] === undefined) {
      throw new Error(`Unknown phase "${transition.to}"`);
    }
    this.phaseId = transition.to;
    this.phaseStart = this.time;
    if (!this.phaseEntered.has(transition.to)) this.phaseEntered.set(transition.to, this.time);
    this.holdToggles();
  }

  private say(voice: Voice): void {
    this.voiceAt = this.time;
    this.voiceTotal += 1;
    this.voiceLog.push(voice);
    if (this.voiceLog.length > 40) this.voiceLog = this.voiceLog.slice(-40);
  }

  private play(beat: Beat, fromPlayer = false): void {
    this.beats += 1;
    // The clock jumps first: what the beat says and logs belongs to the moment the story resumes.
    if (beat.cut) this.jump(beat.cut);
    if (beat.scene !== undefined) {
      if (fromPlayer) {
        this.passing = { text: beat.scene, until: this.time + REACTION_SCENE_SECONDS };
      } else {
        this.sceneText = beat.scene;
        this.passing = null;
      }
    }
    if (beat.voice) this.say(beat.voice);
    if (beat.log !== undefined) {
      this.timeline.push({ t: this.time, text: beat.log, tone: beat.tone ?? 'neutral' });
    }
    for (const flag of beat.flags ?? []) this.flagSet.add(flag);
    for (const action of beat.counts ?? []) this.note(action);
    for (const toggle of beat.off ?? []) this.switchOff(toggle);
    if (beat.settles !== undefined && this.openPrompt?.id === beat.settles) this.openPrompt = null;
    if (beat.prompt) {
      this.openPrompt = beat.prompt;
      // A question is said out loud like any other line: it must be heard by
      // a team with a drawer open, not only seen on the screen behind it.
      this.say(beat.prompt.voice);
    }
    if (beat.bump) {
      const b = beat.bump;
      if (b.spo2 !== undefined) this.body.spo2 = clamp(this.body.spo2 + b.spo2, 0, SPO2_MAX);
      if (b.hr !== undefined) this.body.hr += b.hr;
      if (b.sbp !== undefined) this.body.sbp += b.sbp;
      if (b.dbp !== undefined) this.body.dbp += b.dbp;
    }
  }

  /** A time cut: the clock jumps, and the monitor shows a fresh pressure when the story resumes. */
  private jump(cut: TimeCut): void {
    const seconds = Math.max(0, cut.seconds);
    this.cutLog.push({ at: this.time, seconds, title: cut.title });
    const from = this.time;
    this.time += seconds;
    if (cut.vitals) Object.assign(this.body, cut.vitals);
    this.nibp = this.cuffReading();
    this.cuffDoneAt = null;
    this.nextAutoCuff = this.time + CUFF_INTERVAL;
    // The minutes skipped were not a gap between two of the player's breaths.
    this.newStretch();
    // Nor minutes with nobody squeezing: what was skipped went on as it was going.
    this.squeezedAt = this.squeezedAt.map((t) => t + seconds);
    // Nor part of a set she was counting: the story resumes with her hands on the chest.
    if (this.chest) {
      const pause = this.pauseLog.at(-1);
      if (pause && pause.ended === null) pause.ended = from;
      this.chest = { compressing: true, since: this.time };
    }
    // No waveform before the cut and none after: the apnea alarm is still on when the story resumes.
    this.noWaveformSince = this.body.etco2 === null ? (this.noWaveformSince ?? this.time) : null;
    if (this.pulseNow) this.lowest = Math.min(this.lowest, this.body.spo2);
    this.sample();
  }

  private react(key: string, event: PlayerEvent): boolean {
    const reaction = this.scenario.reactions?.[key];
    const beat = reaction?.(this.live, event);
    if (beat) {
      this.play(beat, true);
      return true;
    }
    return false;
  }

  private note(id: string): void {
    const rec = this.actions.get(id);
    if (rec) {
      rec.last = this.time;
      rec.count += 1;
    } else {
      this.actions.set(id, { first: this.time, last: this.time, count: 1 });
    }
  }

  // ---------------------------------------------------------------- player

  /** Tap a cart action. Toggles flip; instant actions are done once more. */
  act(id: string): void {
    if (this.finished) return;
    const action = findAction(id);
    if (!action) throw new Error(`Unknown cart action "${id}"`);
    if (action.kind === 'toggle') {
      const turningOn = !this.toggles.has(id);
      if (turningOn) {
        for (const other of action.excludes ?? []) this.switchOff(other);
        this.switchOn(id);
        this.note(id);
      } else {
        this.switchOff(id);
      }
      // With the assistant on the chest, a bag picked up is in the player's hand.
      if (id === 'bvm' && turningOn && this.pacedBag && this.chest !== null) {
        this.bagHolder = 'player';
      }
      // A bag the player has to squeeze says nothing until a breath goes in.
      const silent = id === 'bvm' && turningOn && this.bagHolder === 'player';
      if (id === 'bvm') {
        this.bagLinePending = silent;
        if (turningOn && this.bagHolder === 'player') this.newStretch();
        if (this.bagHolder === 'da') {
          if (turningOn) {
            this.assistantSpans.push({ from: this.time, to: null });
            this.nextAssistantBreathAt = this.time + BREATH.everySec;
          } else {
            this.closeAssistantSpan();
          }
        }
      }
      const spoke = silent ? false : this.react(id, { kind: 'action', id, on: turningOn });
      // After the reaction: a toggle the story switched straight back off was never held.
      this.holdToggles();
      if (!spoke) {
        this.timeline.push({
          t: this.time,
          text: turningOn ? action.label : `${action.label}: stopped`,
          tone: 'neutral',
        });
        this.beats += 1;
      }
      return;
    }
    this.note(id);
    const spoke = this.react(id, { kind: 'action', id });
    if (!spoke) {
      this.timeline.push({ t: this.time, text: action.label, tone: 'neutral' });
      this.beats += 1;
    }
  }

  /** The monitor's own control: start a cuff reading now. It takes a while to come back. */
  cycleCuff(): void {
    if (this.finished || this.cuffDoneAt !== null) return;
    this.cuffDoneAt = this.time + CUFF_SECONDS;
    this.note('cuff');
  }

  /**
   * Use an auto-injector, or give `units` puffs of the inhaler. Returns false
   * when none is left.
   */
  useDevice(id: string, units = 1): boolean {
    if (this.finished) return false;
    const device = findDevice(id);
    if (!device) throw new Error(`Unknown cart device "${id}"`);
    const left = this.remaining(id);
    if (left !== null && left <= 0) return false;
    // A pen is one dose however it is asked for; only a counted device takes a number.
    const count =
      device.maxUnits === undefined ? 1 : clamp(Math.round(units) || 1, 1, device.maxUnits);
    this.deviceUses.set(id, (this.deviceUses.get(id) ?? 0) + 1);
    this.note(id);
    const dose: DoseEvent = {
      t: this.time,
      phase: this.phaseId,
      drugKey: device.drugKey,
      drugName: device.drugName,
      mcg: device.mcg * count,
      ml: 0,
      route: device.route,
      mcgPerMl: 0,
      syringeMl: null,
      labeled: true,
      device: id,
    };
    this.recordDose(dose, count > 1 ? `${device.label} × ${count}` : device.label);
    return true;
  }

  private recordDose(dose: DoseEvent, what: string): void {
    this.doseLog.push(dose);
    const event: PlayerEvent = { kind: 'dose', dose };
    const spoke =
      (dose.device !== null && this.react(dose.device, event)) ||
      this.react(`give:${dose.drugKey}`, event);
    if (!spoke) {
      this.timeline.push({ t: this.time, text: what, tone: 'neutral' });
      this.beats += 1;
    }
  }

  answer(optionId: string): void {
    const prompt = this.openPrompt;
    if (this.finished || !prompt) return;
    if (!prompt.options.some((o) => o.id === optionId)) {
      throw new Error(`Prompt "${prompt.id}" has no option "${optionId}"`);
    }
    this.answers.set(prompt.id, optionId);
    this.openPrompt = null;
    this.react(`answer:${prompt.id}`, { kind: 'answer', promptId: prompt.id, optionId });
  }

  // ---------------------------------------------------------------- bench

  /** Pick up an empty syringe. Returns its id. */
  pickUpSyringe(sizeMl: SyringeSize): string {
    this.syringeSeq += 1;
    const id = `syringe-${this.syringeSeq}`;
    this.syringes = [...this.syringes, emptySyringe(id, sizeMl)];
    this.benchTouched = this.time;
    return id;
  }

  private edit(id: string, change: (s: Syringe) => Syringe): void {
    if (this.finished) return;
    this.syringes = this.syringes.map((s) => (s.id === id ? change(s) : s));
    this.benchTouched = this.time;
  }

  syringe(id: string): Syringe | undefined {
    return this.syringes.find((s) => s.id === id);
  }

  drawFromVial(id: string, vialKey: string, ml: number): void {
    const vial = findVial(vialKey);
    if (!vial) throw new Error(`Unknown vial "${vialKey}"`);
    const before = this.syringe(id);
    this.edit(id, (s) => drawDrug(s, vial, ml));
    const after = this.syringe(id);
    if (
      after &&
      after.drugKey === vialKey &&
      before?.drugKey !== vialKey &&
      !this.drawnInto.has(id)
    ) {
      this.drawnInto.add(id);
      this.react(`draw:${vialKey}`, { kind: 'draw', drugKey: vialKey, syringeMl: after.sizeMl });
    }
  }

  drawSaline(id: string, ml: number): void {
    this.edit(id, (s) => drawSaline(s, ml));
  }

  wasteTo(id: string, toMl: number): void {
    this.edit(id, (s) => wasteTo(s, toMl));
  }

  labelSyringe(id: string): void {
    this.edit(id, label);
  }

  /** Put an unused or empty syringe in the sharps. */
  discard(id: string): void {
    this.syringes = this.syringes.filter((s) => s.id !== id);
  }

  /** Push `ml` from a tray syringe. An emptied syringe leaves the tray. */
  give(id: string, ml: number, route: 'IV' | 'IM'): DoseEvent | null {
    const s = this.syringe(id);
    if (this.finished || !s || s.volumeMl <= 0) return null;
    const mcgPerMl = concentrationMcgPerMl(s);
    const push = give(s, ml, route);
    if (push.ml <= 0) return null;
    this.syringes =
      push.syringe.volumeMl <= 0
        ? this.syringes.filter((x) => x.id !== id)
        : this.syringes.map((x) => (x.id === id ? push.syringe : x));
    const dose: DoseEvent = {
      t: this.time,
      phase: this.phaseId,
      drugKey: s.drugKey ?? 'saline',
      drugName: s.drugName ?? 'Saline',
      mcg: push.mcg,
      ml: push.ml,
      route,
      mcgPerMl,
      syringeMl: s.sizeMl,
      labeled: s.labeled,
      device: null,
    };
    this.note(`give:${dose.drugKey}`);
    this.recordDose(
      dose,
      `${dose.drugName} ${snapMl(push.ml).toFixed(1)} ml ${route}${s.labeled ? '' : ' (unlabeled)'}`,
    );
    return dose;
  }
}
