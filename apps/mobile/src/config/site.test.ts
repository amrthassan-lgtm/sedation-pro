import { describe, expect, it } from 'vitest';

import {
  ACTIVE_SITE,
  APEX_DENTAL,
  monitorAttestationLabel,
  monitorTraceDescription,
  type SiteProfile,
} from './site';

/** A second site that does not exist yet — the point is that it could. */
const OTHER_SITE: SiteProfile = {
  practice: 'Second Office',
  monitor: { name: 'Mindray uMEC', traceDelivery: 'uploaded' },
  openDental: { commTypeSedationNote: 42, docCategorySedation: 7 },
  noteAttribution: (provider) => `Filed by ${provider}.`,
};

describe('the active site', () => {
  /**
   * These are definition rows inside this practice's Open Dental. Filing
   * under the wrong number is not reversible through the API, so they are
   * pinned here as well as at the service boundary.
   */
  it('pins the practice-specific Open Dental identifiers', () => {
    expect(ACTIVE_SITE).toBe(APEX_DENTAL);
    expect(ACTIVE_SITE.openDental.commTypeSedationNote).toBe(711);
    expect(ACTIVE_SITE.openDental.docCategorySedation).toBe(136);
  });

  it('attributes the note to the provider on the case, not a fixed name', () => {
    expect(ACTIVE_SITE.noteAttribution('Dr. Chen, DMD')).toContain('Dr. Chen, DMD');
    expect(ACTIVE_SITE.noteAttribution('Dr. Chen, DMD')).not.toContain('Hassan');
  });

  it('falls back to a neutral phrase rather than naming nobody', () => {
    expect(ACTIVE_SITE.noteAttribution('  ')).toContain('the treating provider');
  });
});

describe('monitor-derived wording', () => {
  it('describes a scanned printout for the current monitor', () => {
    expect(monitorTraceDescription()).toBe('Edan X10 printout scanned into the patient chart');
    expect(monitorAttestationLabel()).toBe('Pulse-ox printout (Edan X10) scanned to chart');
  });

  /**
   * Swapping the monitor — including one that files its own output, which is
   * the planned WiFi upload — changes the note's wording without touching
   * the note builder or the Phase 4 template.
   */
  it('switches to upload wording for a monitor that files its own trace', () => {
    expect(monitorTraceDescription(OTHER_SITE)).toBe(
      'Mindray uMEC trace uploaded to the patient chart',
    );
    expect(monitorAttestationLabel(OTHER_SITE)).toBe(
      'Pulse-ox trace (Mindray uMEC) uploaded to chart',
    );
  });
});
