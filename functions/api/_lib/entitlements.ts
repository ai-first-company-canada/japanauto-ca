/**
 * functions/api/_lib/entitlements.ts
 *
 * The single source of truth for "what can this dealer do right now" (Feature 5,
 * docs/decisions/0012). Every feature gate asks getEntitlements() — never reads
 * subscription_tier directly — so wiring Stripe later (which only updates the
 * mirror columns) needs no change at any gate.
 *
 * effectiveTier folds three inputs into free|pro:
 *   1. a paid Pro subscription (subscription_tier='pro' + a live status), OR
 *   2. an unexpired free trial (trial_ends_at > now), OR
 *   3. otherwise free.
 *
 * Tiers:
 *   free → up to FREE_MAX_ACTIVE_LISTINGS active listings; text-improver + own
 *          stats included; market analytics + social boost withheld.
 *   pro  → unlimited listings + everything.
 */

import type { Env } from "../../../types/env";
import { LIMITS, LIVE_PAID_SUBSCRIPTION_STATUSES } from "../../../lib/schema";
import { forbidden } from "./response";

export type EffectiveTier = "free" | "pro";

type BillingFields = {
  id: string;
  subscription_tier: "free" | "pro";
  subscription_status: string | null;
  trial_ends_at: number | null;
};

/** Statuses under which a paid Pro subscription still grants Pro access.
 *  Canonical list lives in lib/schema.ts (LIVE_PAID_SUBSCRIPTION_STATUSES) so
 *  the Worker mirrors + SQL predicates stay findable (COR-4). */
const LIVE_PAID_STATUSES = new Set<string>(LIVE_PAID_SUBSCRIPTION_STATUSES);

function hasPaidPro(d: BillingFields): boolean {
  return d.subscription_tier === "pro"
    && d.subscription_status !== null
    && LIVE_PAID_STATUSES.has(d.subscription_status);
}

function onTrial(d: BillingFields, nowSec: number): boolean {
  return d.trial_ends_at !== null && d.trial_ends_at > nowSec;
}

export function effectiveTier(d: BillingFields, nowSec = Math.floor(Date.now() / 1000)): EffectiveTier {
  return hasPaidPro(d) || onTrial(d, nowSec) ? "pro" : "free";
}

export interface Entitlements {
  tier: EffectiveTier;
  maxActiveListings: number;   // Number.POSITIVE_INFINITY for Pro
  marketAnalytics: boolean;
  socialBoost: boolean;
  fbPromotion: boolean;        // listing inclusion in the Meta catalog feed (decision 0015)
  textImprover: boolean;       // both tiers — we want the content
  onTrial: boolean;            // Pro via trial, not a paid plan
  trialDaysLeft: number;       // 0 when not on trial
}

export function getEntitlements(d: BillingFields, nowSec = Math.floor(Date.now() / 1000)): Entitlements {
  const tier = effectiveTier(d, nowSec);
  const trial = !hasPaidPro(d) && onTrial(d, nowSec);
  return {
    tier,
    maxActiveListings: tier === "pro" ? Number.POSITIVE_INFINITY : LIMITS.FREE_MAX_ACTIVE_LISTINGS,
    marketAnalytics: tier === "pro",
    socialBoost: tier === "pro",
    fbPromotion: tier === "pro",
    textImprover: true,
    onTrial: trial,
    trialDaysLeft: trial ? Math.max(1, Math.ceil((d.trial_ends_at! - nowSec) / 86400)) : 0,
  };
}

/** The cap-403 both the advisory pre-check and the atomic backstop return, so
 *  a dealer sees the same message no matter which layer stopped them. */
export function capExceeded(ent: Entitlements): Response {
  return forbidden(
    `Free plan allows ${ent.maxActiveListings} active listings. ` +
    `Upgrade to Pro for unlimited, or archive an active one first.`,
  );
}

/**
 * ADVISORY pre-check for transitions that make an entity publicly active
 * (create-as-active, draft→active PATCH). Returns a 403 Response when the
 * dealer is already at their active cap, else null. Pro/trial are uncapped.
 *
 * This is check-then-act and therefore racy on its own (deep-audit COR-3):
 * it exists for a friendly early 403 without side effects. The ENFORCEMENT
 * is activeCapGuard() below, which every write folds into its own statement.
 *
 * Cap semantics are PER TABLE — 5 active listings AND 5 active donor cars
 * (a dealership lives in listings, a junkyard in donor_cars; see ADR-0019).
 *
 * `table` is a fixed literal (no injection). `excludeId` skips the row being
 * transitioned so re-activating an already-counted row never double-counts.
 */
export async function enforceActiveCap(
  env: Env, dealer: BillingFields, table: "listings" | "donor_cars", excludeId?: string,
): Promise<Response | null> {
  const ent = getEntitlements(dealer);
  if (ent.maxActiveListings === Number.POSITIVE_INFINITY) return null;

  const where = `dealer_id = ? AND status = 'active'` + (excludeId ? ` AND id != ?` : ``);
  const binds = excludeId ? [dealer.id, excludeId] : [dealer.id];
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...binds).first<{ n: number }>();

  if ((row?.n ?? 0) >= ent.maxActiveListings) return capExceeded(ent);
  return null;
}

export type CapGuard = { sql: string; binds: (string | number)[] };

/**
 * Atomic cap enforcement (deep-audit COR-3). Returns a WHERE-predicate to fold
 * into the SAME statement that writes status='active' (INSERT ... SELECT ...
 * WHERE <sql> / UPDATE ... WHERE id = ? AND <sql>), so check and write are one
 * SQLite statement — D1 serializes writers, so two concurrent publishes cannot
 * both slip under the cap. Caller MUST check `meta.changes === 0` after .run()
 * and answer capExceeded(ent).
 *
 * cap = -1 (Pro/trial) short-circuits the predicate to TRUE — the subquery
 * still parses but `? < 0` wins, so uncapped writes stay single-statement too.
 */
export function activeCapGuard(
  dealer: BillingFields, table: "listings" | "donor_cars", excludeId?: string,
): CapGuard {
  const ent = getEntitlements(dealer);
  const cap = ent.maxActiveListings === Number.POSITIVE_INFINITY ? -1 : ent.maxActiveListings;
  const sub = `SELECT COUNT(*) FROM ${table} WHERE dealer_id = ? AND status = 'active'`
    + (excludeId ? ` AND id != ?` : ``);
  return {
    sql: `(? < 0 OR (${sub}) < ?)`,
    binds: excludeId ? [cap, dealer.id, excludeId, cap] : [cap, dealer.id, cap],
  };
}
