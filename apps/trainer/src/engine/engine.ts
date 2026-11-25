import { findAction, findDevice, findVial } from './catalog';
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

/**
 * The breath as the BVM page writes it: one every so many seconds, each over
 * so long. Read from the page, so the bag and its pacer keep no number of
 * their own and follow a reworded page.
 */
export const BREATH = {
  everySec: numberInStep(
    'bvm',
    'just enough to see the chest rise',
    /1 breath every (\d+) seconds/,
  ),
  overSec: numberInStep('bvm', 'just enough to see the chest rise', /each over (\d+) second/),
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

  private readonly toggles = new Set<string>();
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
    for (const id of init.on ?? []) this.toggles.add(id);
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

  /** Seconds since the player's last squeeze, or null before the first of this stretch. */
  get sinceBreath(): number | null {
    const last = this.breathLog.at(-1);
    const since = this.actions.get('bvm')?.last;
    return last && since !== undefined && last.t >= since ? this.time - last.t : null;
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
    const last = this.breathLog.at(-1);
    return last !== undefined && this.time - last.t <= BREATH_CARRIES_SEC;
  }

  /** Breaths a minute as the latest squeezes make it; the page's rate for the assistant. */
  private bagRate(): number {
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

  /** One squeeze of the bag by the player, held for `heldSec`. */
  squeeze(heldSec: number): boolean {
    if (this.finished || !this.toggles.has('bvm') || this.bagHolder !== 'player') return false;
    const before = this.breathLog.at(-1);
    const held = clamp(heldSec, 0.1, 10);
    this.breathLog.push({ t: this.time, held });
    this.strain(
      held > TOO_LONG_SEC || (before !== undefined && this.time - before.t < TOO_SOON_SEC),
    );
    this.bagLine();
    this.holdToggles();
    this.beats += 1;
    return true;
  }

  /** Hand the bag to the assistant, or take it back. */
  handBag(to: BagHolder): void {
    if (this.finished || !this.toggles.has('bvm') || this.bagHolder === to) return;
    this.bagHolder = to;
    this.timeline.push({
      t: this.time,
      text: to === 'da' ? 'DA takes the bag' : 'Bag taken back',
      tone: 'neutral',
    });
    const saidBefore = this.voiceTotal;
    this.bagLine();
    if (to === 'da') {
      this.assistantSpans.push({ from: this.time, to: null });
      this.nextAssistantBreathAt = this.time + BREATH.everySec;
      // The story's own line about the bag, if this is the first air to go in, is hers already.
      if (this.voiceTotal === saidBefore) this.say({ who: 'DA', line: 'I have the bag.' });
    } else {
      this.closeAssistantSpan();
    }
    this.holdToggles();
    this.beats += 1;
  }

  private closeAssistantSpan(): void {
    const open = this.assistantSpans.at(-1);
    if (open && open.to === null) open.to = this.time;
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
      // The bag sets the rate only for a patient breathing slower than it.
      rr: bagged ? Math.max(this.bagRate(), own) : own,
      bagged,
      capno: this.capnoNow,
      rhythm: this.rhythmNow,
      nibp: this.nibp,
      cuffCycling: this.cuffDoneAt !== null,
      perfusion: clamp((this.body.sbp - 40) / 70, 0.15, 1),
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
    };
    return live;
  })();

  /** Read-only view of the run for scenarios, the grader and tests. */
  get run(): Ctx {
    return this.live;
  }

  private alarms(): ReadonlyArray<AlarmId> {
    const out: AlarmId[] = [];
    // The number on the screen is what breaches the limit, as on a real monitor.
    if (Math.round(this.body.spo2) < SPO2_ALARM_BELOW) out.push('spo2_low');
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
    if (drive.look) this.lookNow = drive.look;
    this.lowest = Math.min(this.lowest, this.body.spo2);
    // A new low is always recorded, so the recorder and the debrief agree on the lowest value.
    if (this.time >= this.nextSampleAt || Math.round(this.body.spo2) < this.lowestSampled) {
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
    });
    this.lowestSampled = Math.min(this.lowestSampled, spo2);
    this.nextSampleAt = this.time + SAMPLE_EVERY;
  }

  private runCuff(): void {
    if (this.cuffDoneAt === null && this.time >= this.nextAutoCuff) {
      this.cuffDoneAt = this.time + CUFF_SECONDS;
    }
    if (this.cuffDoneAt !== null && this.time >= this.cuffDoneAt) {
      this.nibp = { sbp: Math.round(this.body.sbp), dbp: Math.round(this.body.dbp), at: this.time };
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
    for (const toggle of beat.off ?? []) this.toggles.delete(toggle);
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
    this.time += seconds;
    if (cut.vitals) Object.assign(this.body, cut.vitals);
    this.nibp = { sbp: Math.round(this.body.sbp), dbp: Math.round(this.body.dbp), at: this.time };
    this.cuffDoneAt = null;
    this.nextAutoCuff = this.time + CUFF_INTERVAL;
    // No waveform before the cut and none after: the apnea alarm is still on when the story resumes.
    this.noWaveformSince = this.body.etco2 === null ? (this.noWaveformSince ?? this.time) : null;
    this.lowest = Math.min(this.lowest, this.body.spo2);
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
        for (const other of action.excludes ?? []) this.toggles.delete(other);
        this.toggles.add(id);
        this.note(id);
      } else {
        this.toggles.delete(id);
      }
      // A bag the player has to squeeze says nothing until a breath goes in.
      const silent = id === 'bvm' && turningOn && this.bagHolder === 'player';
      if (id === 'bvm') {
        this.bagLinePending = silent;
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
    return id;
  }

  private edit(id: string, change: (s: Syringe) => Syringe): void {
    if (this.finished) return;
    this.syringes = this.syringes.map((s) => (s.id === id ? change(s) : s));
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
