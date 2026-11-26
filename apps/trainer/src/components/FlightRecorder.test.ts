import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { CutRecord, LogEntry, Sample } from '@/engine/types';

import FlightRecorder from './FlightRecorder.vue';

const read = (t: number, spo2: number): Sample => ({ t, spo2, hr: 80, sbp: 130 });
const unread = (t: number): Sample => ({ t, spo2: 80, hr: 188, sbp: 130, pulseless: true });

const recorder = (
  history: ReadonlyArray<Sample>,
  log: ReadonlyArray<LogEntry> = [],
  cuts: ReadonlyArray<CutRecord> = [],
) => mount(FlightRecorder, { props: { history, cuts, log } });

/** Every point of every stretch of the saturation trace, as [x, y]. */
function points(wrapper: ReturnType<typeof recorder>): number[][][] {
  return wrapper
    .find('svg')
    .findAll('.trace')
    .map((line) =>
      (line.attributes('points') ?? '')
        .split(' ')
        .filter(Boolean)
        .map((pair) => pair.split(',').map(Number)),
    );
}

describe('the saturation through a stretch with no pulse (owner, Nov 2026)', () => {
  /** A reading for six seconds, none for fifty, then a reading again. */
  const arrest = [
    read(0, 97),
    read(2, 97),
    read(4, 97),
    unread(6),
    unread(20),
    unread(40),
    read(56, 92),
    read(58, 93),
    read(60, 94),
  ];

  it('draws no line where the oximeter read nothing: the trace stops, and starts again', () => {
    const drawn = recorder(arrest);
    const lines = points(drawn);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(3);
    expect(lines[1]).toHaveLength(3);
    // Nothing joins the last reading before to the first one after.
    expect(lines[0]!.at(-1)![0]).toBeLessThan(lines[1]![0]![0]!);
  });

  it('shades that stretch, from the sample that lost the pulse to the one that found it', () => {
    const drawn = recorder(arrest);
    const bands = drawn.find('svg').findAll('.unread');
    expect(bands).toHaveLength(1);
    const lines = points(drawn);
    const from = Number(bands[0]!.attributes('x'));
    const to = from + Number(bands[0]!.attributes('width'));
    expect(from).toBeGreaterThan(lines[0]!.at(-1)![0]!);
    expect(to).toBeCloseTo(lines[1]![0]![0]!, 0);
  });

  it('says what the shade is, and names no number for it', () => {
    const drawn = recorder(arrest);
    expect(drawn.find('.legend').text()).toContain('No pulse: no reading');
    expect(drawn.find('svg').attributes('aria-label')).toBe(
      'Oxygen saturation over 1:00 of play. Lowest 92 percent. No reading while he had no pulse.',
    );
  });

  it('the lowest it labels is the lowest that was read, not the number kept behind the gap', () => {
    const drawn = recorder(arrest);
    expect(drawn.find('.low').text()).toBe('92%');
  });

  it('what the team did in that stretch is pinned along the foot of the chart, at no value', () => {
    const log: LogEntry[] = [
      { t: 3, text: 'Before', tone: 'good' },
      { t: 20, text: 'CPR started', tone: 'good' },
      { t: 40, text: 'Shock 1 delivered', tone: 'good' },
      { t: 58, text: 'After', tone: 'good' },
    ];
    const pins = recorder(arrest, log)
      .findAll('.pin')
      .map((pin) => Number(pin.attributes('cy')));
    expect(pins).toHaveLength(4);
    expect(pins[1]).toBe(pins[2]);
    // Lower on the chart than any reading drawn in this run.
    expect(pins[1]!).toBeGreaterThan(pins[0]!);
    expect(pins[1]!).toBeGreaterThan(pins[3]!);
  });

  it('a lowest reading at the right-hand edge is labelled to its left, so the label is not cut off', () => {
    const atTheEnd = recorder([read(0, 97), unread(6), unread(50), read(58, 91), read(60, 93)]);
    const label = atTheEnd.find('.low');
    expect(label.text()).toBe('91%');
    expect(label.attributes('text-anchor')).toBe('end');
    expect(Number(label.attributes('x'))).toBeLessThan(590);

    const early = recorder([read(0, 97), read(10, 88), read(60, 95)]).find('.low');
    expect(early.attributes('text-anchor')).toBe('start');
  });

  it('a stretch that runs to the end of the run is shaded to the end', () => {
    const drawn = recorder([read(0, 97), read(4, 97), unread(6), unread(30), unread(60)]);
    expect(points(drawn)).toHaveLength(1);
    const band = drawn.find('svg').find('.unread');
    expect(Number(band.attributes('x')) + Number(band.attributes('width'))).toBeCloseTo(590, 0);
  });

  it('a run where he always had a pulse is drawn as it always was', () => {
    const drawn = recorder([read(0, 97), read(10, 91), read(20, 88)]);
    expect(drawn.findAll('.unread')).toHaveLength(0);
    expect(points(drawn)).toHaveLength(1);
    expect(drawn.find('.legend').text()).not.toContain('No pulse');
    expect(drawn.find('svg').attributes('aria-label')).toBe(
      'Oxygen saturation over 0:30 of play. Lowest 88 percent.',
    );
  });
});

describe('the cards of a run that was skipped the same way several rounds running', () => {
  const steady = [read(0, 97), read(30, 96), read(190, 95), read(350, 95), read(400, 95)];
  const cuts: CutRecord[] = [
    { at: 30, seconds: 90, title: 'Two minutes of CPR' },
    { at: 150, seconds: 90, title: 'Two minutes of CPR' },
    { at: 270, seconds: 90, title: 'Two minutes of CPR' },
    { at: 395, seconds: 60, title: 'EMS arrives' },
  ];

  it('are each marked with a line, and named once, with how many there were', () => {
    const drawn = recorder(steady, [], cuts);
    expect(drawn.find('svg').findAll('.cut line')).toHaveLength(4);
    expect(
      drawn
        .find('svg')
        .findAll('.cut text')
        .map((t) => t.text()),
    ).toEqual(['Two minutes of CPR ×3', 'EMS arrives']);
  });

  it('a cut that came once is named as it always was', () => {
    const drawn = recorder(steady, [], cuts.slice(0, 1));
    expect(drawn.find('.cut text').text()).toBe('Two minutes of CPR');
  });
});
