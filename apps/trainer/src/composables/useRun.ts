import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import { playAlarm, stopAlarms, unlockAlarms, type AlarmLevel } from '@/audio/alarm';
import { hush, say } from '@/audio/voice';
import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';
import type { SyringeSize } from '@/engine/syringe';
import type { BagHolder, CutRecord, Scenario, Voice } from '@/engine/types';
import { addRecord, recordsFor, setLastRun, settings } from '@/session';

/** The sim advances four times a second; the monitor animates on its own frame clock. */
const TICK_MS = 250;
/** A tab that slept must not hand the patient a minute of desaturation in one step. */
const MAX_STEP_SEC = 1;
const CUT_CARD_MS = 2_600;
/** How long the Alarm pause key silences the tone. The banner stays. */
const ALARM_PAUSE_SEC = 120;
/** Seconds between bursts: an urgent alarm repeats faster than a breached limit. */
const REPEAT_SEC = { limit: 18, urgent: 8 } as const;
/** A spoken line stays on screen this long, then the caption clears. */
const CAPTION_SEC = 14;

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // No motor, or not allowed: sound and the banner already carry it.
  }
}

/**
 * One run, wired to the screen: the timer that moves the sim, the alarm tone,
 * the assistant's voice, and the hand-off to the debrief when it ends.
 */
export function useRun(scenario: Scenario) {
  const practice = settings.takeYourTime || settings.coached;
  const sim = new Simulation(scenario, {
    coached: settings.coached,
    forgiving: settings.takeYourTime,
    // In the room the bag is the player's to squeeze until they hand it over.
    pacedBag: true,
  });

  /** Bumped after anything changes, so computed views re-read the sim. */
  const rev = ref(0);
  const touch = (): void => {
    rev.value += 1;
  };
  const view = <T>(read: () => T) =>
    computed(() => {
      void rev.value;
      return read();
    });

  const started = ref(false);
  /** A sheet is open. In take-your-time mode that stops the clock. */
  const sheetOpen = ref(false);
  const cutCard = shallowRef<CutRecord | null>(null);
  const alarmPausedUntil = ref(0);
  /** Wall-clock seconds, for the alarm repeat and the pause key only. */
  const wall = ref(0);

  let timer: number | null = null;
  let lastFrame = 0;
  let nextAlarmAt = 0;
  let lastAlarmKey = '';
  let lastVoiceAt = -10;
  let cutTimer: number | null = null;
  let wakeLock: { release(): Promise<void> } | null = null;

  const holding = (): boolean =>
    cutCard.value !== null || (settings.takeYourTime && sheetOpen.value);

  function frame(): void {
    const now = performance.now();
    const dt = Math.min(MAX_STEP_SEC, (now - lastFrame) / 1000);
    lastFrame = now;
    wall.value += dt;
    if (!holding() && !sim.ending) {
      sim.tick(dt);
      touch();
    }
    sound();
    if (sim.ending) finish();
  }

  function sound(): void {
    const alarms = sim.monitor.alarms;
    const key = alarms.join('+');
    if (key !== lastAlarmKey) {
      // A new condition re-arms a paused alarm and sounds at once.
      if (alarms.length > 0 && !key.split('+').every((a) => lastAlarmKey.includes(a))) {
        alarmPausedUntil.value = 0;
        nextAlarmAt = 0;
        buzz([60, 60, 60]);
      }
      if (alarms.length === 0) stopAlarms();
      lastAlarmKey = key;
    }
    if (!settings.sound || alarms.length === 0 || sim.ending || cutCard.value) return;
    if (wall.value < alarmPausedUntil.value || wall.value < nextAlarmAt) return;
    const level: AlarmLevel = sim.monitor.alarmLevel === 'urgent' ? 'urgent' : 'limit';
    // Quieter under a line someone has just spoken.
    playAlarm(level, wall.value - lastVoiceAt < 3 ? 0.35 : 1);
    nextAlarmAt = wall.value + REPEAT_SEC[level];
  }

  function finish(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    stopAlarms();
    const debrief = gradeRun(scenario, sim);
    const previous = recordsFor(scenario.id).at(-1) ?? null;
    setLastRun({
      debrief,
      history: sim.history,
      cuts: sim.cuts,
      log: sim.log,
      breaths: sim.breaths,
      assistantBagging: sim.assistantBagging,
      previous,
      practice,
    });
    if (!practice) {
      addRecord(scenario.id, {
        at: Date.now(),
        done: debrief.done,
        of: debrief.of,
        lowestSpo2: debrief.lowestSpo2,
        seconds: debrief.seconds,
        outcome: debrief.ending.outcome,
      });
    }
    touch();
  }

  function start(): void {
    if (started.value) return;
    started.value = true;
    if (settings.sound) unlockAlarms();
    lastFrame = performance.now();
    timer = window.setInterval(frame, TICK_MS);
    void (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<typeof wakeLock> } }
    ).wakeLock
      ?.request('screen')
      .then((lock) => {
        wakeLock = lock;
      })
      .catch(() => undefined);
  }

  function stop(): void {
    if (timer !== null) window.clearInterval(timer);
    if (cutTimer !== null) window.clearTimeout(cutTimer);
    timer = null;
    stopAlarms();
    hush();
    void wakeLock?.release().catch(() => undefined);
  }

  // The assistant speaks each new line once. The count only goes up; the log of lines is trimmed.
  watch(
    () => (void rev.value, sim.voiceCount),
    (count, before) => {
      if (count <= (before ?? 0)) return;
      const line = sim.voices.at(-1);
      if (!line) return;
      lastVoiceAt = wall.value;
      if (settings.sound && settings.voice) say(line);
    },
  );

  // A time cut shows its card and holds the clock while it is up.
  watch(
    () => (void rev.value, sim.cuts.length),
    (count, before) => {
      if (count <= (before ?? 0)) return;
      cutCard.value = sim.cuts.at(-1) ?? null;
      stopAlarms();
      buzz(200);
      if (cutTimer !== null) window.clearTimeout(cutTimer);
      cutTimer = window.setTimeout(() => {
        cutCard.value = null;
        lastFrame = performance.now();
      }, CUT_CARD_MS);
    },
  );

  onBeforeUnmount(stop);

  /** Run a player action against the sim, then refresh the screen. */
  function play<T>(move: () => T): T {
    const result = move();
    touch();
    return result;
  }

  return {
    sim,
    practice,
    started,
    sheetOpen,
    cutCard,
    start,
    stop,

    t: view(() => sim.t),
    monitor: view(() => sim.monitor),
    scene: view(() => sim.scene),
    caption: view(() =>
      sim.t - sim.lastVoiceAt <= CAPTION_SEC ? (sim.voices.at(-1) ?? null) : null,
    ),
    prompt: view(() => sim.prompt),
    log: view(() => [...sim.log]),
    tray: view(() => [...sim.tray]),
    look: view(() => sim.look),
    ending: view(() => sim.ending),
    alarmPaused: computed(() => wall.value < alarmPausedUntil.value),

    bagHeldBy: view(() => sim.bagHeldBy),
    sinceBreath: view(() => sim.sinceBreath),
    belly: view(() => sim.belly),
    breathGoesIn: view(() => sim.breathGoesIn),
    squeeze: (heldSec: number) => play(() => sim.squeeze(heldSec)),
    handBag: (to: BagHolder) => play(() => sim.handBag(to)),

    isOn: (id: string): boolean => (void rev.value, sim.isOn(id)),
    done: (id: string): boolean => (void rev.value, sim.run.at(id) !== null),
    remaining: (id: string): number | null => (void rev.value, sim.remaining(id)),

    act: (id: string) => play(() => sim.act(id)),
    useDevice: (id: string, units = 1) => play(() => sim.useDevice(id, units)),
    answer: (optionId: string) => play(() => sim.answer(optionId)),
    cycleCuff: () => play(() => sim.cycleCuff()),
    /** A device's own voice, under the same Sound and Voice switches as the room. */
    speak: (line: Voice): void => {
      if (settings.sound && settings.voice) say(line);
    },
    pauseAlarm: (): void => {
      alarmPausedUntil.value = wall.value + ALARM_PAUSE_SEC;
      stopAlarms();
    },

    pickUpSyringe: (size: SyringeSize) => play(() => sim.pickUpSyringe(size)),
    drawFromVial: (id: string, vial: string, ml: number) =>
      play(() => sim.drawFromVial(id, vial, ml)),
    wasteTo: (id: string, ml: number) => play(() => sim.wasteTo(id, ml)),
    labelSyringe: (id: string) => play(() => sim.labelSyringe(id)),
    discard: (id: string) => play(() => sim.discard(id)),
    give: (id: string, ml: number, route: 'IV' | 'IM') => play(() => sim.give(id, ml, route)),
  };
}

export type Run = ReturnType<typeof useRun>;
