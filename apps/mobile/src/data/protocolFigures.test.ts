import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import { EMERGENCY_PROTOCOLS, type StepFigure } from '@sedation-pro/clinical';

import ProtocolFigure from '@/components/ProtocolFigure.vue';
import { ANATOMY_CREDIT, PROTOCOL_DRAWINGS } from './protocolFigures';

/** Every drawing any protocol step asks for, once each. */
const USED: ReadonlyArray<StepFigure> = [
  ...new Set(EMERGENCY_PROTOCOLS.flatMap((p) => p.steps).flatMap((s) => s.figure ?? [])),
];
const FILES = Object.entries(PROTOCOL_DRAWINGS) as ReadonlyArray<
  [StepFigure, (typeof PROTOCOL_DRAWINGS)[StepFigure]]
>;

/**
 * The numerals on a picture's markers, in the order they are drawn. A marker
 * is a group of one disc and its numeral; the Larson's point file writes the
 * group without the class the others carry.
 */
function markers(svg: string): ReadonlyArray<number> {
  return [...svg.matchAll(/<g(?: class="mk")?><circle[^>]*\/><text[^>]*>(\d+)<\/text><\/g>/g)].map(
    (m) => Number(m[1]),
  );
}
/**
 * The Larson's point file draws its second marker before its first. It ships
 * byte for byte as reviewed, so the order is recorded here, not changed there.
 */
const DRAWN_OUT_OF_ORDER: Partial<Record<StepFigure, ReadonlyArray<number>>> = {
  'larsons-point': [2, 1],
};
/** Every word written on a picture, in the order it is drawn. */
function wordsOn(svg: string): ReadonlyArray<string> {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');
}
/** Part of the outline of the head traced from the Open Critical Care / WHO figure. */
const TRACED_HEAD = 'C1100 297 1040 304 990 314';

describe('protocol drawings', () => {
  it('every drawing a step asks for is drawn, so a new kind cannot ship blank', () => {
    expect(USED.length).toBeGreaterThan(0);
    for (const kind of USED) {
      const w = mount(ProtocolFigure, { props: { kind } });
      const svg = w.find('svg');
      expect(svg.exists(), kind).toBe(true);
      expect(svg.attributes('viewBox'), kind).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
      expect(svg.findAll('path').length, kind).toBeGreaterThan(3);
      // Named for a screen reader, on the picture or on the element that holds it.
      const label = svg.attributes('aria-label') ?? w.find('[role="img"]').attributes('aria-label');
      expect(label?.length ?? 0, kind).toBeGreaterThan(20);
      w.unmount();
    }
  });

  it('the app holds no drawing that no step uses', () => {
    for (const [kind] of FILES) expect(USED, kind).toContain(kind);
  });

  it('a numbered drawing has one caption for each marker, numbered as the markers are', () => {
    let numbered = 0;
    for (const [kind, drawing] of FILES) {
      const onPicture = markers(drawing.svg);
      const inOrder = drawing.captions.map((_, i) => i + 1);
      expect(
        onPicture,
        `${kind}: ${onPicture.length} markers, ${drawing.captions.length} captions`,
      ).toEqual(DRAWN_OUT_OF_ORDER[kind] ?? inOrder);
      // Whatever the order in the file, each numeral is on the picture once.
      expect(
        [...onPicture].sort((a, b) => a - b),
        kind,
      ).toEqual(inOrder);
      for (const caption of drawing.captions)
        expect(caption.trim().length, kind).toBeGreaterThan(8);

      const w = mount(ProtocolFigure, { props: { kind } });
      const shown = w.findAll('.drawing-caption');
      expect(
        shown.map((li) => li.find('.drawing-number').text()),
        kind,
      ).toEqual(inOrder.map((n) => String(n)));
      expect(shown.map((li) => li.find('.drawing-caption-text').text())).toEqual(drawing.captions);
      // No markers, no list: an empty box under a picture would read as a fault.
      expect(w.find('.drawing-captions').exists(), kind).toBe(onPicture.length > 0);
      if (onPicture.length > 0) numbered += 1;
      w.unmount();
    }
    expect(numbered).toBe(4);
  });

  it("the captions are the owner's approved wording (Nov 2026)", () => {
    const captions = Object.fromEntries(FILES.map(([kind, d]) => [kind, d.captions]));
    expect(captions).toEqual({
      'larsons-point': [
        'Firm pressure at the laryngospasm notch: behind the earlobe, between jaw and mastoid',
        'Jaw thrust',
      ],
      'bvm-side': [
        'Head tilted back, chin up',
        'Mask from the bridge of the nose to the groove below the lower lip',
        'Fingers behind the angle of the jaw lift it up into the mask',
        'Not here: pressing the soft part under the chin pushes the tongue back',
      ],
      'bvm-one-person': [
        'Left hand: thumb and index finger press the mask onto the face (the C)',
        'Left hand: middle, ring and little fingers lift the jaw bone up into the mask, head tilted back (the E)',
        'Narrow end of the mask on the bridge of the nose, clear of the eyes',
        'Wide end of the mask below the lower lip',
        'Right hand squeezes the bag; reservoir and oxygen attached',
      ],
      'bvm-two-person': [
        'Both thumbs press the mask onto the face',
        'Fingers behind the angle of the jaw lift it up into the mask, head tilted back',
        'The second person, at the side of the chair, squeezes the bag',
      ],
      'bvm-breath': [],
      npa: [],
      lma: [],
      'king-lt': [],
    });
  });

  it('a drawing traced from the Open Critical Care / WHO head carries its licence credit', () => {
    // CC BY 4.0: the credit is a condition of using the figure, not a courtesy.
    expect(ANATOMY_CREDIT).toBe('Anatomy adapted from Open Critical Care / WHO, CC BY 4.0');
    const credited = FILES.filter(([, d]) => d.tracedAnatomy).map(([kind]) => kind);
    expect(credited).toEqual(['bvm-side', 'bvm-breath', 'npa', 'lma', 'king-lt']);
    for (const [kind, drawing] of FILES) {
      // The traced outline itself is the test: a new drawing that reuses the
      // head cannot leave the credit off.
      expect(drawing.svg.includes(TRACED_HEAD), kind).toBe(drawing.tracedAnatomy);
      const w = mount(ProtocolFigure, { props: { kind } });
      const credit = w.find('.drawing-credit');
      expect(credit.exists(), kind).toBe(drawing.tracedAnatomy);
      if (drawing.tracedAnatomy) expect(credit.text(), kind).toBe(ANATOMY_CREDIT);
      w.unmount();
    }
  });

  it("Larson's point is the reviewed drawing: its two captions, its words, and no credit (owner, Nov 2026)", () => {
    const drawing = PROTOCOL_DRAWINGS['larsons-point'];
    expect(drawing.captions).toEqual([
      'Firm pressure at the laryngospasm notch: behind the earlobe, between jaw and mastoid',
      'Jaw thrust',
    ]);
    // The file itself: its frame, a marker for each caption and the two bones it names.
    expect(
      drawing.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 540" '),
    ).toBe(true);
    expect(wordsOn(drawing.svg)).toEqual(['2', 'Jaw', 'Mastoid', '1']);
    expect([...drawing.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'lp-a-frame',
      'lp-a-bone',
      'lp-a-bone-edge',
    ]);
    // Traced from public-domain plates, not from the Open Critical Care / WHO
    // head: no credit is owed and none is printed.
    expect(drawing.tracedAnatomy).toBe(false);
    expect(drawing.svg).not.toContain(TRACED_HEAD);

    const w = mount(ProtocolFigure, { props: { kind: 'larsons-point' } });
    const figure = w.get('figure.drawing');
    expect(figure.attributes('data-figure')).toBe('larsons-point');
    expect(figure.get('.drawing-art').attributes('role')).toBe('img');
    expect(figure.get('.drawing-art svg').attributes('viewBox')).toBe('0 0 860 540');
    expect(figure.findAll('.drawing-caption').map((li) => li.text())).toEqual([
      '1Firm pressure at the laryngospasm notch: behind the earlobe, between jaw and mastoid',
      '2Jaw thrust',
    ]);
    expect(w.find('.drawing-credit').exists()).toBe(false);
    expect(w.find('figcaption').exists()).toBe(false);
    expect(w.text()).not.toContain('CC BY');
    // The drawing once made by hand in the component is gone: one picture, the file's.
    expect(w.findAll('svg')).toHaveLength(1);
    expect(w.find('svg.figure').exists()).toBe(false);
    w.unmount();
  });

  it("Larson's point is named for a screen reader in its captions' own words", () => {
    const { label, captions } = PROTOCOL_DRAWINGS['larsons-point'];
    expect(label).toBe(
      'Side view: firm pressure at the laryngospasm notch, behind the earlobe, between jaw and mastoid; jaw thrust',
    );
    const words = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];
    const fromCaptions = new Set(captions.flatMap(words));
    expect(words(label.replace(/^Side view: /, '')).filter((w) => !fromCaptions.has(w))).toEqual(
      [],
    );
    const w = mount(ProtocolFigure, { props: { kind: 'larsons-point' } });
    expect(w.get('[role="img"]').attributes('aria-label')).toBe(label);
    w.unmount();
  });

  it("Larson's point captions add a place and no instruction: each is a phrase of its step", () => {
    const steps = EMERGENCY_PROTOCOLS.flatMap((p) => p.steps).filter(
      (s) => s.figure === 'larsons-point',
    );
    expect(steps).toHaveLength(1);
    const step = steps[0]!.text.toLowerCase();
    const phrases = PROTOCOL_DRAWINGS['larsons-point'].captions.flatMap((c) => c.split(': '));
    expect(phrases).toHaveLength(3);
    for (const phrase of phrases) expect(step, phrase).toContain(phrase.toLowerCase());
  });

  it("the second person reaches in from the patient's right, and no text is mirrored (owner, Nov 2026)", () => {
    const svg = PROTOCOL_DRAWINGS['bvm-two-person'].svg;
    const flip = '<g transform="translate(800 0) scale(-1 1)">';
    expect(svg.split(flip)).toHaveLength(2);
    // The picture is flipped as one group; every numeral and the label are
    // drawn after it, upright.
    const afterPicture = svg.indexOf('<path stroke="#0b1220" stroke-opacity="0.55"');
    expect(afterPicture).toBeGreaterThan(svg.indexOf(flip));
    expect(svg.slice(svg.indexOf(flip), afterPicture)).not.toContain('<text');
    expect(svg.slice(afterPicture)).toContain('You, at the head of the chair');
    // Seen from the head of the chair, the patient's right is the picture's
    // right: the frame runs 40 to 760, so right of 400.
    const third = /<g class="mk"><circle cx="(\d+)"[^>]*\/><text[^>]*>3<\/text>/.exec(svg);
    expect(Number(third?.[1])).toBeGreaterThan(400);
    // The one-person drawing is as it was reviewed: not flipped.
    expect(PROTOCOL_DRAWINGS['bvm-one-person'].svg).not.toContain('scale(-1');
  });

  it('every drawing is whole in the bundle: nothing fetched, nothing that runs, nothing that moves', () => {
    for (const [kind, { svg }] of FILES) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'), kind).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>'), kind).toBe(true);
      const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
      expect(body, kind).not.toMatch(/https?:|href|<image|<use|<script|<foreignObject|@import/i);
      expect(body, kind).not.toMatch(/\son[a-z]+=/i);
      // The animated breath pacer was a proposal; the app ships the still.
      expect(body, kind).not.toMatch(/<animate|<set\b|@keyframes|animation|<style/i);
    }
  });

  it('ids are unique across the drawings, which sit inline on one page', () => {
    const ids = FILES.flatMap(([, { svg }]) =>
      [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    // And every reference resolves inside its own drawing.
    for (const [kind, { svg }] of FILES) {
      for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(svg, `${kind} #${ref[1]}`).toContain(`id="${ref[1]}"`);
      }
    }
  });
});
