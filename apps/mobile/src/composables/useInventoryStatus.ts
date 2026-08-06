import { EMERGENCY_PROTOCOLS, expiryStatus, type ExpiryStatus } from '@sedation-pro/clinical';
import type { Severity } from '@sedation-pro/clinical';

import {
  CONTROLLED_EXCLUSIONS,
  EMERGENCY_INVENTORY,
  type InventoryItem,
} from '@/data/emergency-inventory';

/**
 * Single source for every inventory-derived readout (drawer sub-line,
 * launch banner, inventory screen, protocol stock pills, Phase 1 kit
 * warning, Quick Reference link row). Pure functions over the static
 * data file — inventory only changes with a deploy, so callers pass a
 * mount-time `now` and plain values suffice (the established
 * day-granularity idiom).
 */

export interface ClassifiedItem {
  readonly item: InventoryItem;
  readonly status: ExpiryStatus;
}

export interface InventorySummary {
  /** 'limit' bucket — truly expired OR blank/unreadable expiry. */
  readonly expired: number;
  readonly expiringSoon: number;
  readonly ok: number;
  /** Non-safe items whose replacement is already on order. */
  readonly onOrder: number;
  readonly total: number;
  /** Most urgent non-safe item; unknown-expiry (−∞) sorts first. */
  readonly soonest: { readonly drug: string; readonly daysLeft: number } | null;
}

export function classifyInventory(
  now: number,
  items: ReadonlyArray<InventoryItem> = EMERGENCY_INVENTORY,
): ReadonlyArray<ClassifiedItem> {
  return items.map((item) => ({ item, status: expiryStatus(item.expiresOn, now) }));
}

export function byUrgency(a: ClassifiedItem, b: ClassifiedItem): number {
  return a.status.daysLeft - b.status.daysLeft;
}

export function summarizeInventory(classified: ReadonlyArray<ClassifiedItem>): InventorySummary {
  let expired = 0;
  let expiringSoon = 0;
  let ok = 0;
  let onOrder = 0;
  let soonest: InventorySummary['soonest'] = null;
  for (const c of classified) {
    if (c.status.severity === 'limit') expired += 1;
    else if (c.status.severity === 'caution') expiringSoon += 1;
    else ok += 1;
    if (c.status.severity !== 'safe') {
      if (c.item.onOrder) onOrder += 1;
      if (soonest === null || c.status.daysLeft < soonest.daysLeft) {
        soonest = { drug: c.item.drug, daysLeft: c.status.daysLeft };
      }
    }
  }
  return { expired, expiringSoon, ok, onOrder, total: classified.length, soonest };
}

/** Drawer/link-row sub-line — one shared phrasing for stock at a glance. */
export function inventorySubLine(summary: InventorySummary): string {
  if (summary.expired > 0)
    return `${summary.expired} expired · ${summary.expiringSoon} expiring soon`;
  if (summary.expiringSoon > 0) return `${summary.expiringSoon} expiring within 60 days`;
  return `${summary.total} items · all in date`;
}

const SEVERITY_RANK: Record<Severity, number> = { safe: 0, caution: 1, limit: 2, crisis: 3 };

/**
 * Stock status for a protocol drug-callout name, or null when no
 * inventory item maps to it (render nothing — never "not stocked").
 *
 * BEST (least-severe) status across mapped lots, deliberately: the
 * protocol pill answers the crisis-moment question "can I grab an
 * in-date unit right now?" If one in-date epinephrine vial exists, the
 * answer is yes even though another lot expired — a worst-of pill would
 * cry wolf and train the clinician to ignore it. Reorder pressure is
 * owned by the inventory screen and launch banner, which count every
 * bad lot.
 */
export function protocolStockStatus(
  name: string,
  classified: ReadonlyArray<ClassifiedItem>,
): Severity | null {
  let best: Severity | null = null;
  for (const c of classified) {
    if (!c.item.protocolDrugNames?.includes(name)) continue;
    if (best === null || SEVERITY_RANK[c.status.severity] < SEVERITY_RANK[best]) {
      best = c.status.severity;
    }
  }
  return best;
}

/** Every distinct drug name referenced by protocol step callouts. */
export function protocolCalloutNames(): ReadonlyArray<string> {
  const names = new Set<string>();
  for (const protocol of EMERGENCY_PROTOCOLS) {
    for (const step of protocol.steps) {
      if (step.drug) names.add(step.drug.name);
    }
  }
  return [...names].sort();
}

/**
 * Protocol callout drugs with no mapped inventory item and no
 * controlled-substance exemption — i.e. genuine purchasing decisions.
 */
export function protocolGapList(
  items: ReadonlyArray<InventoryItem> = EMERGENCY_INVENTORY,
): ReadonlyArray<string> {
  const mapped = new Set<string>();
  for (const item of items) {
    for (const name of item.protocolDrugNames ?? []) mapped.add(name);
  }
  return protocolCalloutNames().filter(
    (name) => !mapped.has(name) && !CONTROLLED_EXCLUSIONS.includes(name),
  );
}

export interface InventoryStatus {
  readonly classified: ReadonlyArray<ClassifiedItem>;
  readonly summary: InventorySummary;
  readonly needsAttention: ReadonlyArray<ClassifiedItem>;
  readonly expiringSoon: ReadonlyArray<ClassifiedItem>;
  readonly inDate: ReadonlyArray<ClassifiedItem>;
  readonly notStocked: ReadonlyArray<string>;
  readonly subLine: string;
  statusFor(calloutName: string): Severity | null;
}

export function useInventoryStatus(now: number = Date.now()): InventoryStatus {
  const classified = classifyInventory(now);
  const summary = summarizeInventory(classified);
  return {
    classified,
    summary,
    needsAttention: classified.filter((c) => c.status.severity === 'limit').sort(byUrgency),
    expiringSoon: classified.filter((c) => c.status.severity === 'caution').sort(byUrgency),
    inDate: classified.filter((c) => c.status.severity === 'safe').sort(byUrgency),
    notStocked: protocolGapList(),
    subLine: inventorySubLine(summary),
    statusFor: (calloutName) => protocolStockStatus(calloutName, classified),
  };
}
