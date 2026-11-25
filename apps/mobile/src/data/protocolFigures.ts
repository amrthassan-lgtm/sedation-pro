import type { StepFigure } from '@sedation-pro/clinical';

import bvmBreath from '@/assets/protocol-figures/bvm-breath.svg?raw';
import bvmOnePerson from '@/assets/protocol-figures/bvm-one-person.svg?raw';
import bvmSide from '@/assets/protocol-figures/bvm-side.svg?raw';
import bvmTwoPerson from '@/assets/protocol-figures/bvm-two-person.svg?raw';
import kingLt from '@/assets/protocol-figures/king-lt.svg?raw';
import larsonsPoint from '@/assets/protocol-figures/larsons-point.svg?raw';
import lma from '@/assets/protocol-figures/lma.svg?raw';
import npa from '@/assets/protocol-figures/npa.svg?raw';

/**
 * The drawings a protocol step can carry.
 *
 * Each is a file in `assets/protocol-figures`, imported as text so it is part
 * of the app's own script: nothing is fetched, and it is there offline. A
 * drawing is medically reviewed before it ships, and its captions are the
 * owner's approved wording, so neither is edited here by hand.
 */
export interface ProtocolDrawing {
  readonly svg: string;
  /** What the picture shows, for a screen reader, in the picture's own words. */
  readonly label: string;
  /** One line for each numbered marker on the picture, in the markers' order. */
  readonly captions: ReadonlyArray<string>;
  /** The head is traced from the Open Critical Care / WHO figure, so its credit is owed. */
  readonly tracedAnatomy: boolean;
}

/** Required by the CC BY 4.0 licence of the figure the heads are traced from. */
export const ANATOMY_CREDIT = 'Anatomy adapted from Open Critical Care / WHO, CC BY 4.0';

export const PROTOCOL_DRAWINGS: Readonly<Record<StepFigure, ProtocolDrawing>> = {
  'larsons-point': {
    svg: larsonsPoint,
    label:
      'Side view: firm pressure at the laryngospasm notch, behind the earlobe, between jaw and mastoid; jaw thrust',
    captions: [
      'Firm pressure at the laryngospasm notch: behind the earlobe, between jaw and mastoid',
      'Jaw thrust',
    ],
    // No credit is owed: this head is traced from public-domain sources
    // (Gray's Anatomy, 1918, and a public-domain skull drawing), not from the
    // Open Critical Care / WHO figure.
    tracedAnatomy: false,
  },
  'bvm-side': {
    svg: bvmSide,
    label:
      'Side view: head tilted back, chin up, the mask from the bridge of the nose to below the lower lip, fingers behind the angle of the jaw',
    captions: [
      'Head tilted back, chin up',
      'Mask from the bridge of the nose to the groove below the lower lip',
      'Fingers behind the angle of the jaw lift it up into the mask',
      'Not here: pressing the soft part under the chin pushes the tongue back',
    ],
    tracedAnatomy: true,
  },
  'bvm-one-person': {
    svg: bvmOnePerson,
    label:
      'One person, seen from the head of the chair: the left hand presses the mask and lifts the jaw bone, the right hand squeezes the bag',
    captions: [
      'Left hand: thumb and index finger press the mask onto the face (the C)',
      'Left hand: middle, ring and little fingers lift the jaw bone up into the mask, head tilted back (the E)',
      'Narrow end of the mask on the bridge of the nose, clear of the eyes',
      'Wide end of the mask below the lower lip',
      'Right hand squeezes the bag; reservoir and oxygen attached',
    ],
    tracedAnatomy: false,
  },
  'bvm-two-person': {
    svg: bvmTwoPerson,
    label:
      'Two people, seen from the head of the chair: both thumbs press the mask, fingers behind the angle of the jaw, the second person squeezes the bag',
    captions: [
      'Both thumbs press the mask onto the face',
      'Fingers behind the angle of the jaw lift it up into the mask, head tilted back',
      'The second person, at the side of the chair, squeezes the bag',
    ],
    tracedAnatomy: false,
  },
  'bvm-breath': {
    svg: bvmBreath,
    label:
      '1 breath every 6 seconds, each squeezed over 1 second, just enough to see the chest rise',
    captions: [],
    tracedAnatomy: true,
  },
  npa: {
    svg: npa,
    label: 'NPA in place, side view: flange at the nostril, tip behind the tongue',
    captions: [],
    tracedAnatomy: true,
  },
  lma: {
    svg: lma,
    label:
      'LMA in place, side view: cuff over the larynx, tip at the top of the esophagus, air into the larynx',
    captions: [],
    tracedAnatomy: true,
  },
  'king-lt': {
    svg: kingLt,
    label:
      'King LT in place, side view: large cuff seals the throat, tip seals the esophagus, air out to the larynx',
    captions: [],
    tracedAnatomy: true,
  },
};
