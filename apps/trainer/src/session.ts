import { reactive, shallowRef } from 'vue';

import type { Debrief } from './engine/grade';
import type { Breath, CutRecord, LogEntry, Sample } from './engine/types';

/**
 * What the trainer keeps. Everything is under one prefix that the clinical
 * app never uses: on GitHub Pages the two share an origin, so the prefix is
 * the only wall between this and a live case's storage. A test forbids any
 * other key in this app.
 */
const PREFIX = 'sedation-trainer:';
const SETTINGS_KEY = `${PREFIX}settings:v1`;
const RECORDS_KEY = `${PREFIX}records:v1`;
const LAST_RUN_KEY = `${PREFIX}last-run:v1`;

export interface Settings {
  /** Alarm tones. There is no pulse beep to turn on. */
  sound: boolean;
  /** The assistant's lines spoken aloud as well as captioned. */
  voice: boolean;
  /** The clock stops while a sheet is open and the patient cannot be lost. */
  takeYourTime: boolean;
  /** The assistant suggests the next step when the team stalls. */
  coached: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  voice: true,
  takeYourTime: false,
  coached: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store only costs remembered preferences and records.
  }
}

export const settings = reactive<Settings>(read(SETTINGS_KEY, DEFAULT_SETTINGS));

export function saveSettings(): void {
  write(SETTINGS_KEY, settings);
}

/** One finished run, for "beat your last run". No names, no free text. */
export interface RunRecord {
  readonly at: number;
  readonly done: number;
  readonly of: number;
  readonly lowestSpo2: number;
  readonly seconds: number;
  readonly outcome: string;
}

type Records = Record<string, RunRecord[]>;

const records = reactive<Records>(read<Records>(RECORDS_KEY, {}));

export function recordsFor(scenarioId: string): ReadonlyArray<RunRecord> {
  return records[scenarioId] ?? [];
}

/** Keeps the last ten runs of each scenario. */
export function addRecord(scenarioId: string, record: RunRecord): void {
  records[scenarioId] = [...(records[scenarioId] ?? []), record].slice(-10);
  write(RECORDS_KEY, records);
}

/**
 * The run that just ended, handed from the room to the debrief. Kept for the
 * tab only, so opening a protocol in the clinical app and coming Back still
 * finds the debrief. An invented patient's run: nothing here is clinical data.
 */
export interface FinishedRun {
  readonly debrief: Debrief;
  readonly history: ReadonlyArray<Sample>;
  readonly cuts: ReadonlyArray<CutRecord>;
  readonly log: ReadonlyArray<LogEntry>;
  /** The squeezes the player gave the bag. Absent in a run saved before the pacer. */
  readonly breaths?: ReadonlyArray<Breath>;
  /** The stretches the assistant had the bag. */
  readonly assistantBagging?: ReadonlyArray<{ readonly from: number; readonly to: number }>;
  /** The run before this one, for the comparison. */
  readonly previous: RunRecord | null;
  /** Take-your-time or coached runs are practice: shown, not recorded. */
  readonly practice: boolean;
}

function readLastRun(): FinishedRun | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_RUN_KEY);
    const run = raw === null ? null : (JSON.parse(raw) as Partial<FinishedRun>);
    return run && Array.isArray(run.debrief?.rows) && Array.isArray(run.history)
      ? (run as FinishedRun)
      : null;
  } catch {
    return null;
  }
}

export const lastRun = shallowRef<FinishedRun | null>(readLastRun());

export function setLastRun(run: FinishedRun): void {
  lastRun.value = run;
  try {
    window.sessionStorage.setItem(LAST_RUN_KEY, JSON.stringify(run));
  } catch {
    // A blocked store only costs the debrief surviving a reload.
  }
}
