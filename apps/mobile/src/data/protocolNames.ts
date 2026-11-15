import { EMERGENCY_PROTOCOLS, findProtocol } from '@sedation-pro/clinical';

import { CATEGORY_LABEL } from './protocolCategories';

/** "Anaphylaxis (Severe Allergic Reaction)" → "Anaphylaxis"; "LMA (…) - If …" → "LMA". */
function shortOf(name: string): string {
  return name.split(/ \(| - /)[0] ?? name;
}

/** Short names more than one protocol would share ("Oversedation"). */
const SHARED = new Set(
  EMERGENCY_PROTOCOLS.map((p) => shortOf(p.name)).filter((s, i, all) => all.indexOf(s) !== i),
);

/**
 * The name to show for a protocol where space is short (a link, the top
 * bar): the part before any "(…)" or " - …", unless that would not tell it
 * from another protocol, then the full name.
 */
export function protocolShortName(id: string): string {
  const name = findProtocol(id)?.name ?? id;
  const short = shortOf(name);
  return SHARED.has(short) ? name : short;
}

/** What the top bar says on a protocol's page: its name, and its category under it. */
export function protocolBarTitle(id: string): { label: string; sub: string } | null {
  const p = findProtocol(id);
  return p ? { label: protocolShortName(id), sub: CATEGORY_LABEL[p.category] } : null;
}
