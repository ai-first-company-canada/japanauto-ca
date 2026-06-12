# Billing & entitlements (current + planned)
> Captured 2026-06-11, updated 2026-06-12 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Monetization layer for the marketplace. Three products:

1. **Pro subscription** (free|pro) — committed prices (decision 0013): CA$99/mo or CA$990/yr, **30% of the subscription committed to promoting that dealer's own lots** (the pooled $1/day Meta catalog budget, decisions 0015/0016). Free tier caps at 5 active listings; Pro adds unlimited listings, private market analytics, social boost, and Meta catalog-feed inclusion. Every signup gets a 30-day no-card Pro trial. The entitlement layer (decision 0012) is fully live; **Stripe payment processing is still schema + skeleton** — until it wires up, tier/trial/verify are operated manually from the Access-gated admin Worker (decision 0014).
2. **Featured slots** — per-(city, brand) exclusive NEW-vehicle placements, direct-sales B2B at a CA$2,995/mo list anchor (founding rate ~CA$750–1,000/mo), **30% of the contract committed to social-traffic acquisition for that city×brand** (decisions 0013/0016). Contract lifecycle is live end-to-end through the admin Worker; exclusivity is DB-enforced (`ux_featured_slots_live`, migration 0017); lapsed windows are auto-ended by the cron sweeper.
3. **Per-listing "boost"** (self-serve Stripe one-time) — ranking read-side is live; the payment path remains a skeleton.

## Key files

| Path | Role |
|---|---|
| `migrations/0001_initial_schema.sql` | Source of truth for the original billing tables/columns: dealers.subscription_tier/status/stripe_customer_id, listings.boost_until/boost_paid_cents, featured_slots, boost_orders. CHECK constraints + indexes (idx_dealers_stripe_customer, idx_boost_orders_stripe partial UNIQUE). |
| `migrations/0013_dealer_trial_and_subscription.sql` | Adds dealers.trial_ends_at (unix sec; the no-card trial window) and dealers.stripe_subscription_id (NULL until Stripe wires up). ADR 0012. |
| `migrations/0017_admin_audit_log.sql` | admin_audit_log (every admin-panel mutation) + `ux_featured_slots_live` — partial UNIQUE on featured_slots (city, make_id) WHERE status IN ('pending','active','paused'): the DB-level enforcement of city×brand exclusivity. |
| `functions/api/_lib/entitlements.ts` | THE entitlement choke point (decision 0012). `effectiveTier()` (L46) folds paid-Pro ∨ unexpired-trial → free\|pro; `getEntitlements()` (L61) returns {tier, maxActiveListings, marketAnalytics, socialBoost, fbPromotion, textImprover, onTrial, trialDaysLeft}; `enforceActiveCap()` (L84) is the free-tier 5-active-listings guard. |
| `workers/admin/src/pages/dealers.ts` | Interim Stripe substitute: admin `/dealers` page — verify toggle, "+30d trial" (extends from max(trial_ends_at, now), L135-141), manual tier switch (L143-157: 'pro' also sets subscription_status='active'; '→ free' nulls status AND clears the trial), one-time reset link. Carries a kept-in-sync mirror of effectiveTier (L36-41). All actions audit-logged. |
| `workers/admin/src/pages/slots.ts` | Featured-slot contract tooling (replaces "raw SQL out-of-band"): `slotsCreate` (L172) validates + inserts status='pending'; `slotsAction` (L288) drives the TRANSITIONS machine (L38-42) with status-guarded UPDATEs. First activation re-stamps the paid window (L324-331). |
| `workers/expire-sweeper/src/index.ts` | Standalone cron Worker. `sweepExpired` (every 6 h, `SWEEP_CRON` L221) flips active/paused featured_slots with active_until ≤ now to 'ended' (L208-209) — non-payment fails safe, the exclusivity pair frees up. |
| `functions/feeds/meta-vehicles.csv.ts` | Meta vehicle-catalog feed (decision 0015) — the fbPromotion entitlement's consumer. Key-gated (constant-time compare L46-57, 503 when META_FEED_KEY unset). The Pro predicate is inlined in SQL (L117-118) mirroring effectiveTier. |
| `functions/api/stripe/webhook.ts` | SKELETON. POST /api/stripe/webhook. Reads raw body, checks Stripe-Signature header presence only, then returns 200 {ok:true,note:'skeleton'}. No HMAC verification, no event parsing, no DB writes. |
| `functions/api/boost/checkout.ts` | SKELETON. POST /api/boost/checkout. Real auth (requireDealer), ownership + active-status checks, zod validation; then 501 notImplemented (L61). No Stripe session, no boost_orders insert. |
| `functions/api/featured-slots/index.ts` | Dealer-facing endpoint stays 403 forbidden (L25) — slots are admin/direct-sales only; the real writer is the admin Worker. Header still cites a pre-repo "ADR-0007" and the superseded $500-1500 range. |
| `lib/schema.ts` | Zod contract. LIMITS.FREE_MAX_ACTIVE_LISTINGS=5 (L145), TRIAL_DAYS=30 (L146), BOOST_DURATION_DAYS_MIN/MAX 1..90; trial_ends_at on the dealer row (L491); dealerSelfSchema omits password_hash + stripe_customer_id + stripe_subscription_id + token_epoch; dealerPublicSchema additionally omits trial_ends_at, quota counters, tax ids. |
| `functions/api/_lib/rate-limit.ts` | Tiered create quota: LISTING_CREATE_FREE_TIER 50/day (L129) vs LISTING_CREATE_PRO_TIER 500/day (L134), selected by raw dealers.subscription_tier (NOT effectiveTier — see Gaps). |
| `functions/api/listings/index.ts` | Consumes the gates: rate-limit bucket by tier (L213), enforceActiveCap on create-as-active (L260), getActiveFeaturedSlot for CatalogResponse (L127). Card builder maps row.tier===2 → is_boosted (L155), splits boosted/organic (L172-173). |
| `functions/api/_lib/db.ts` | Boost-ranking SQL (listCatalog L273-294, listRecentListings L373-387): tier=2 when boost_until>now else 3; ORDER BY tier ASC, boost_amount DESC. getActiveFeaturedSlot (L406) reads one active slot per (make, city), model-specific preferred. |
| `functions/api/listings/[id]/index.ts` | enforceActiveCap on draft→active PATCH (L95); boost forfeiture: revive (L112) and leaving 'active' (L117) clear boost_until=NULL, boost_paid_cents=0. |
| `functions/api/listings/[id]/stats.ts` | marketAnalytics gate (L88): non-Pro gets `market: {available:false, reason:'pro_feature'}`. |
| `functions/api/listings/[id]/boost-social.ts` | socialBoost gate (L38-41): non-Pro gets 403 before any queueing. |
| `functions/api/donors/index.ts`, `functions/api/donors/[id]/index.ts` | Same pair of gates for donor cars: tiered rate bucket (donors/index.ts L96), enforceActiveCap on create (L138) and on draft→active (donors/[id]/index.ts L94). |
| `functions/api/auth/signup.ts` | New dealers: subscription_tier='free' literal + trial_ends_at = now + TRIAL_DAYS·86400 (L61-71). subscription_status/stripe ids unset. |
| `functions/api/dealers/me.ts` | GET returns `{dealer, entitlements: getEntitlements(dealer)}` (L22) — feeds the cabinet badge. PATCH MUTABLE_COLUMNS allowlist (L35-40) excludes all billing columns. |
| `src/layouts/DealerLayout.astro` | Cabinet tier badge + the "30% of your subscription funds Facebook promotion" copy (L122-127). |
| `src/pages/dealers/pricing/index.astro` | Public pricing page, prices per decision 0013; FAQPage JSON-LD covers trial-end and invoicing. |
| `src/components/atoms/FeaturedSlot.astro` | Slot creative: kind='house' (unsold — brand-site link + "Advertise here" CTA, no fabricated dealer/MSRP) vs kind='paid' with `rel="sponsored noopener"` (L89). |
| `workers/expire-sweeper/src/reports.ts` | Dealer e-mail reports (decision 0016) carry the 30%-to-ads line (L333-338) — the visible accounting of the Pro promotion commitment. |
| `types/env.d.ts` | STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (L53-54, typed but unused at runtime), META_FEED_KEY (L64). |

## How it works

Four mechanisms; only Stripe payment collection is missing.

### 1) Entitlements (live — decision 0012)

`dealers.subscription_tier/subscription_status` are a **mirror of Stripe state and nothing else**; the trial lives separately in `dealers.trial_ends_at` (migration 0013) so the two never fight. All authorization asks one function: `effectiveTier(dealer, now)` → 'pro' when (subscription_tier='pro' AND subscription_status ∈ {active, trialing, past_due} — `LIVE_PAID_STATUSES`, entitlements.ts L34) OR (trial_ends_at > now); else 'free'. Features read `getEntitlements(dealer)`:

- `maxActiveListings` — 5 for free (LIMITS.FREE_MAX_ACTIVE_LISTINGS), Infinity for pro. Enforced by `enforceActiveCap()` at every transition that makes an entity publicly active: listing create-as-active (listings/index.ts L260), draft→active PATCH (listings/[id]/index.ts L95), and the same pair for donor_cars. The COUNT excludes the row being transitioned, so re-activating never double-counts.
- `marketAnalytics` — gates the private market block in the stats API (listings/[id]/stats.ts L88; non-Pro sees reason:'pro_feature').
- `socialBoost` — gates POST /api/listings/:id/boost-social (L38-41).
- `fbPromotion` (decision 0015) — listing inclusion in the Meta catalog feed. The feed endpoint does NOT call getEntitlements (it is one bulk query); the predicate is inlined in SQL (meta-vehicles.csv.ts L117-118) and commented as a mirror of effectiveTier.
- `textImprover` — true for both tiers (we want the content).
- `onTrial`/`trialDaysLeft` — drive the cabinet badge via GET /api/dealers/me (L22).

Signup grants the trial: trial_ends_at = now + 30 days, subscription_tier='free' (signup.ts L61-71) — so every new account is effective-Pro for 30 days with no card.

The tiered listing-create **rate limit** predates the entitlement layer and still selects its bucket from raw subscription_tier (listings/index.ts L213, donors/index.ts L96): free 50/day vs pro 500/day. A trial dealer therefore gets the free bucket — inconsequential at 50/day, but note it is the one tier check outside effectiveTier.

### 2) Admin manual controls (live — the interim Stripe substitute, decision 0014)

Until Stripe wires up, the Access-gated admin Worker (`workers/admin`, admin.japanauto.ca) operates billing state from `/dealers` (workers/admin/src/pages/dealers.ts):

- **Verify / Unverify** — flips dealers.verified.
- **+30d trial** — trial_ends_at = max(current, now) + 30·86400 (L136-137): extending an unexpired trial stacks, an expired one restarts from now.
- **Manual tier switch** (L143-157) — '→ pro' sets subscription_tier='pro' AND subscription_status='active' (effectiveTier needs a live status); '→ free' nulls subscription_status AND clears trial_ends_at — otherwise demoting a trialing dealer would be a silent no-op (security review 2026-06-12).
- **Reset link** — one-time password-reset token (supersedes outstanding ones).

Every action lands in `admin_audit_log` (migration 0017) with the Access-verified admin e-mail. The admin Worker doesn't share the Pages bundle, so it carries a duplicated effectiveTier (dealers.ts L36-41) explicitly marked "keep in sync".

### 3) Featured slots (live end-to-end except payment — decisions 0013, 0014)

Sold as **city×brand exclusivity**: one official dealer owns ALL new-vehicle placements for their brand in a city, listed at CA$2,995/mo (founding rate while traffic is young), month-to-month, invoiced — not self-serve. The dealer-facing POST /api/featured-slots stays 403; the real lifecycle lives in the admin Worker's `/slots` page (workers/admin/src/pages/slots.ts):

- **Create** (`slotsCreate`): operator records a signed contract — dealer e-mail, make, optional model, one of the 6 live CMAs (city↔province cross-checked), months (1-12 × 30 days), monthly price in whole CAD. Inserted as **status='pending'** (creative-review gate, decision 0013 §6) with contract_paid_cents = months × monthly × 100.
- **Exclusivity**: an advisory clash SELECT, then the real enforcement — `ux_featured_slots_live` (migration 0017), a partial UNIQUE on (city, make_id) WHERE status IN ('pending','active','paused'). A double-submit or concurrent insert fails at the DB (caught and surfaced, slots.ts L273-278). Since activation never changes (city, make_id), create-time uniqueness covers the whole lifecycle; 'ended' rows fall out of the partial set so history accumulates.
- **State machine** (`TRANSITIONS`, L38-42): pending→active, active⇄paused, {active,paused}→ended. The from-state doubles as the SQL WHERE guard — a stale tab changes 0 rows.
- **First activation re-stamps the window** (L324-331): active_from=now, active_until=now+duration where duration = the create-time (until−from) — creative-review days never burn paid time. Resuming from pause keeps the window (paused time burns — the pause is the dealer's call), and a lapsed window cannot be resurrected (L335-337): renewal = a new contract.
- **Sweeper ends lapsed slots**: every 6 h `sweepExpired` (workers/expire-sweeper/src/index.ts L208-209) runs `UPDATE featured_slots SET status='ended' WHERE status IN ('active','paused') AND active_until <= unixepoch()` — non-payment fails safe, the (city, make) pair frees automatically and the house ad returns.

Read side: `getActiveFeaturedSlot()` (db.ts L406) selects one row WHERE status='active' AND active_from≤now<active_until, model-specific preferred over make-wide, then contract_paid_cents DESC; feeds the FeaturedListing in CatalogResponse (listings/index.ts L127). Creative renders via `FeaturedSlot.astro`: paid slots carry visible "Sponsored" labeling and `rel="sponsored noopener"`; unsold slots render an honest house ad (brand's official Canadian site + "Advertise here") — no fabricated dealers or MSRPs (decisions 0007/0013).

### 4) Boost (per-listing paid placement; read-side live, payment path skeleton)

Ranking runs on every public catalog read: db.ts computes tier=2 when listings.boost_until IS NOT NULL AND > now, else tier=3, and boost_amount=boost_paid_cents for boosted rows; ORDER BY tier ASC, boost_amount DESC, created_at DESC (L273-294). The card builder (listings/index.ts L155) sets is_boosted=(row.tier===2) and partitions results into boosted[]/organic[]. Boost is forfeited (boost_until=NULL, boost_paid_cents=0) whenever a listing leaves 'active' or is revived (listings/[id]/index.ts L112, L117; audit #36). What is NOT wired: actually setting boost_until/boost_paid_cents. boost/checkout.ts validates auth+ownership+active-status+body then returns 501; it never inserts boost_orders nor creates a Stripe session. webhook.ts is a no-op returning 200. So in production today a listing's boost_* columns can only ever be 0/NULL.

Stripe integration overall: no SDK dependency in package.json (deps are astro + zod only), STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET declared but unreferenced in code. boost_orders has zero INSERT sites.

## Data model

### dealers (billing columns)

subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK in ('free','pro'); subscription_status TEXT nullable CHECK in (trialing,active,past_due,canceled,incomplete,incomplete_expired,unpaid); stripe_customer_id TEXT nullable (idx_dealers_stripe_customer); trial_ends_at INTEGER nullable (0013 — unix sec, signup+30d; effectiveTier reads it); stripe_subscription_id TEXT nullable (0013 — NULL until Stripe); daily_listing_count INT; daily_listing_reset_at INT

*tier default 'free' + trial stamped at signup. subscription_status is written only by the admin panel's manual tier switch (Stripe mirror later); stripe_customer_id / stripe_subscription_id are never written by any code path. daily_listing_* columns exist but rate limiting is actually done via the rate_limits table (migration 0008), not these columns.*
### listings (boost columns)

boost_until INTEGER nullable (Unix sec; >now = active boost); boost_paid_cents INTEGER NOT NULL DEFAULT 0 (cumulative, drives intra-boosted sort)

*idx_listings_boost partial index on (boost_until,boost_paid_cents) WHERE status='active' AND boost_until IS NOT NULL. Legacy featured_until column was removed in favor of featured_slots.*
### boost_orders

id TEXT PK; listing_id FK→listings CASCADE; dealer_id FK→dealers CASCADE; amount_cents INT >0; duration_days INT 1..90; stripe_payment_id TEXT (pi_...); applied_at INT; expires_at INT (applied_at+duration); status TEXT DEFAULT 'paid' CHECK in (paid,refunded,disputed); created_at INT

*Audit trail for boost charges. idx_boost_orders_stripe UNIQUE on stripe_payment_id WHERE NOT NULL (idempotency). NO insert sites exist yet.*
### featured_slots

id TEXT PK; dealer_id FK CASCADE; make_id FK; model_id FK nullable (NULL=all models); city TEXT (CMA slug, app-enforced); province; promo_title; promo_msrp_cents INT; promo_image_id TEXT; promo_url TEXT; disclosure TEXT; active_from/active_until INT; contract_paid_cents INT DEFAULT 0; status TEXT DEFAULT 'pending' CHECK in (pending,active,paused,ended)

*B2B sponsored slot for NEW vehicles; exempt from used-car age-cap triggers. Exclusivity DB-enforced by `ux_featured_slots_live` (0017): partial UNIQUE (city, make_id) WHERE status IN ('pending','active','paused'). Written by the admin Worker (/slots); read via getActiveFeaturedSlot; lapsed active/paused rows auto-ended by the cron sweeper.*
### admin_audit_log (0017)

id TEXT PK; at INT; admin_email TEXT (Access-verified); action TEXT (dealer.verify, dealer.trial_extend, dealer.tier_set, slot.create, slot.activate, …); target TEXT; details TEXT (JSON, no secrets)

## Invariants

- Money is INTEGER cents CAD everywhere (boost_paid_cents, amount_cents, promo_msrp_cents, contract_paid_cents); timestamps are Unix seconds INTEGER.
- **Every feature gate asks effectiveTier()/getEntitlements() — never reads subscription_tier directly** (decision 0012). The sole legacy exception is the create rate-limit bucket choice (see Gaps). subscription_tier/status stay a pure Stripe mirror; the trial lives in trial_ends_at so wiring Stripe later touches no gate.
- The effectiveTier predicate exists in three places that MUST stay in sync: `functions/api/_lib/entitlements.ts` (authoritative), the admin Worker mirror (workers/admin/src/pages/dealers.ts L36-41), and the feed SQL (functions/feeds/meta-vehicles.csv.ts L117-118).
- A listing is 'boosted' iff boost_until IS NOT NULL AND boost_until > now(). This single predicate is recomputed in SQL on every catalog/recent read (db.ts) — there is no persisted is_boosted flag.
- Boost must never survive a listing lifecycle round-trip: any transition out of 'active' (sold/expired) and any revive resets boost_until=NULL and boost_paid_cents=0 (listings/[id]/index.ts L112, L117; audit #36).
- boost_orders.stripe_payment_id is UNIQUE where NOT NULL (idx_boost_orders_stripe partial unique) — a single Stripe payment_intent can finalize at most one boost order (planned idempotency anchor for the webhook).
- **At most one live featured slot per (city, make)** — enforced at the DB by `ux_featured_slots_live` (0017) over the non-'ended' statuses, not just by the admin panel's advisory SELECT. Activation never changes (city, make_id), so create-time uniqueness covers the whole lifecycle. getActiveFeaturedSlot still uses LIMIT 1 with a deterministic tie-break (model-specific first, then contract_paid_cents DESC) for any legacy rows.
- **A slot's paid clock starts at first activation, not at contract entry**: pending→active re-stamps active_from/active_until preserving the create-time duration (slots.ts L324-331). A lapsed window cannot be reactivated; the sweeper flips lapsed active/paused slots to 'ended' within 6 h, so non-payment fails safe to the house ad.
- Demoting a dealer to free must also clear an unexpired trial (admin dealers.ts L149-153) — otherwise effectiveTier keeps returning 'pro' and the demotion is a no-op.
- stripe_customer_id (and stripe_subscription_id, token_epoch) must never leave the server: dealerSelfSchema and dealerPublicSchema both .omit them (lib/schema.ts); dealerPublicSchema additionally omits trial_ends_at. The /api/dealers/me PATCH MUTABLE_COLUMNS allowlist (L35-40) excludes every billing column — dealers cannot self-promote to 'pro', extend their own trial, or attach a Stripe id. Billing state is written only by signup (trial), the admin panel, and (later) the Stripe webhook.
- subscription_tier is non-null CHECK ('free','pro') default 'free'; subscription_status is nullable CHECK over the 7 Stripe states. dealerRowSchema (read-side) relaxes input rules but keeps subscription_tier required — a row with NULL/invalid tier would 500 the login/refresh path (getDealerById parses with dealerRowSchema).
- boost duration is bounded 1..90 days at both DB CHECK (boost_orders.duration_days BETWEEN 1 AND 90) and zod (LIMITS.BOOST_DURATION_DAYS_MIN/MAX); amount_cents > 0 (DB CHECK), zod floors at 100 (≥ $1 CAD).
- Paid featured creative carries visible "Sponsored" labeling and `rel="sponsored"` on the outbound link (FeaturedSlot.astro L89; decision 0013 §5 — link-scheme and Competition Act hygiene). Unsold slots must render the house ad, never fabricated dealer/MSRP creative (extends decision 0007).

## Design decisions

- **Two-product split: per-listing self-serve 'boost' (boost_orders + listings.boost_* columns) vs per-(city, brand) 'featured slots' (separate featured_slots table), rather than one unified promotions table.** — They have different lifecycles and pricing models: boost is a one-time Stripe charge extending a single listing's boost_until (cumulative boost_paid_cents drives intra-tier sort); featured slots are B2B contracts (CA$2,995/mo list per decision 0013, month-to-month, invoiced) for NEW vehicles that bypass the used-car age cap and render as a distinct creative, not a listing card. *Rejected:* a single listings.featured_until column (noted as REMOVED in the 0001 schema comment) — sponsored slots advertise new vehicles from official dealers and must not be modeled as individual used-car listings.
- **"Effective tier" indirection (decision 0012): one choke point (effectiveTier/getEntitlements) folds paid status + trial; subscription columns stay a Stripe mirror.** — Tier-gated features (cap, analytics, boost, feed) work from launch day with zero payment code; wiring Stripe later only means the webhook updates the mirror columns. *Rejected:* per-feature `if tier === 'pro'` checks — trial/grace/dunning semantics would drift across gates.
- **Admin panel as the interim Stripe substitute (decision 0014), not a faster Stripe integration.** — Two real launch partners are onboarded white-glove; manual tier/trial/verify behind Cloudflare Access with a full audit log covers billing operations while keeping the public origin's billing attack surface at zero. *Rejected:* shipping self-serve checkout before launch — decision 0012 deliberately defers it.
- **fbPromotion is a feed-side entitlement (decision 0015), not an API-driven ad manager.** — The Meta integration surface is one CSV endpoint; entitlement churn propagates because a downgraded dealer's rows simply vanish on Meta's next fetch. Budgets are pooled (one campaign, N×$1/day) — a $1/day ad set never exits Meta's learning phase. *Rejected:* per-listing ads + homegrown optimizer over the Marketing API; per-dealer ad sets.
- **The 30%-to-ads commitments are product copy backed by operations, not by code-level ledgers.** — Pro: 30% of $99 ≈ the $1/day Meta budget per Pro dealer; slots: 30% of contract → social-traffic acquisition for that city×brand (decisions 0013/0016). Surfaced in the cabinet badge (DealerLayout.astro L122-127), the e-mail reports (reports.ts L333-338), and the pricing page; no per-dealer spend ledger exists or is promised ("your inventory runs in our catalog campaign").
- **Boost ranking is computed live in SQL (CASE on boost_until>now) on every read; featured-slot expiry is swept by cron.** — Originally both relied on read-time predicates because Pages Functions cannot cron; the standalone sweeper Worker (added for listing TTL) now also ends lapsed slots so the `ux_featured_slots_live` pair frees up in the DB, while boost expiry still needs no sweep — the read-time predicate keeps ranking correct the instant a boost lapses, and boost_* are wiped on lifecycle transitions anyway. *Rejected:* a persisted is_boosted flag — staleness for zero gain.
- **Featured-slot creation stays 403 on the public API; the admin Worker is the only writer.** — A $3k/mo exclusive contract is a sales conversation; the operator records it in /slots (validated form, pending→review→activate) instead of poking SQL. *Rejected:* self-serve slot purchase (off-model for direct-sales B2B); raw-SQL activation (no validation, no audit trail).
- **stripe_customer_id is stored on dealers and indexed (idx_dealers_stripe_customer) but stripped from every API response view.** — Needed server-side to correlate webhook customer.subscription.* events back to a dealer; sensitive linkage data that must not appear in cacheable JSON. *Rejected:* omitting the column until billing lands — pre-provisioned so the webhook needs no migration.

## Security notes

- webhook.ts performs NO signature verification. It only checks the Stripe-Signature header is present, then returns 200 without parsing. Currently inert (no DB writes), but the moment any event-handling logic is added it MUST verify HMAC-SHA256 against STRIPE_WEBHOOK_SECRET on the raw body BEFORE JSON.parse. The dead `if (sig === 'skeleton')` branch must be removed before wiring. No idempotency handling yet — the partial-unique idx_boost_orders_stripe is the intended guard but unused.
- Dealers cannot self-escalate: stripe ids and tier/status/trial are omitted from both response views and from the PATCH allowlist. Billing-state writers are signup (trial only), the Access-gated admin Worker (audited), and the future webhook. Tier is re-read from the live dealers row at gate time (getDealerById), never trusted from the JWT — consistent with the token_epoch kill-switch model.
- Admin mutations are guarded transitions, not blind writes: slot actions bind the from-state into the UPDATE's WHERE; the create path catches the `ux_featured_slots_live` UNIQUE violation as the atomic backstop to its advisory clash SELECT (slots.ts L273-278). Every action writes admin_audit_log; the UI surfaces an audit-write failure rather than hiding it.
- The Meta feed is key-gated with a constant-time digest compare and fails closed (503) without META_FEED_KEY; responses are `no-store` + `x-robots-tag: noindex`. The feed leaks only data already public on listing pages, filtered to Pro-entitled dealers.
- boost/checkout.ts validates listing ownership (403) and active status before any (future) charge — IDOR/charge-for-others-listing is guarded even though the charge itself is unimplemented.
- featured_slots.promo_url: the admin /slots form requires `https://` and caps length (slots.ts L216-218), closing the old "direct SQL bypasses zod" gap for the normal path; promo_url renders as an outbound CTA href with rel="sponsored noopener".

## Gaps / TODO

- functions/api/stripe/webhook.ts — entirely skeleton: no HMAC verification, no event switch, no DB writes. functions/api/boost/checkout.ts — 501; missing boost_orders insert + Stripe Checkout session. No Stripe SDK installed (package.json deps: astro + zod); STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET declared in env.d.ts but referenced nowhere. boost_orders has ZERO insert sites — purely declarative until the checkout/webhook pair is wired.
- No code path writes dealers.stripe_customer_id / stripe_subscription_id; subscription_status is written only by the admin manual tier switch. Real subscription create/upgrade/cancel + invoicing (slots are "Stripe Invoicing later", decision 0013) all pending.
- **Over-limit freezing on downgrade (decision 0012 §3) is NOT implemented**: no `frozen_at` column exists anywhere. A dealer demoted with >5 active listings keeps them active; only NEW activations are capped. The planned 7-day-grace freeze sweep is future work.
- Rate-limit bucket selection (listings/index.ts L213, donors/index.ts L96) reads raw subscription_tier, so trial dealers get the free 50/day create bucket instead of 500/day — harmless at current scale but inconsistent with effectiveTier.
- Featured-slot economics are invisible: no impression/click tracking on the slot creative, so the advertiser-facing stats and the "Advertising" tab of decision 0013 §6 (creative self-serve with pending-review) are unbuilt; slot sections enter the e-mail reports only when impression tracking lands. promo_image_id is inserted as NULL by the admin form — paid creative currently renders without a custom image pipeline.
- The `ux_featured_slots_live` index keys (city, make_id) only — a model-specific and a make-wide slot for the same pair can no longer coexist, which matches decision 0013 (city×brand exclusivity) but silently retires the (make, city[, model]) granularity the 0001 schema anticipated.
- functions/api/featured-slots/index.ts header still cites pre-repo "ADR-0007" and the superseded $500-1500/mo range (real pricing: decision 0013). Update or delete the endpoint when admin tooling is considered final.
- The 30%-to-ads commitment has no enforcement/reporting ledger — it is copy + operator discipline; acceptable while spend is one pooled campaign, but a buyer will ask how it's evidenced.

## External dependencies

- Stripe (planned, NOT integrated): Checkout Sessions for boost one-time payments; Billing + Tax for Pro (CAD, GST/HST/QST), Invoicing for slots; webhook events checkout.session.completed, customer.subscription.{created,updated,deleted}, charge.refunded, payment_intent.payment_failed. No stripe npm package installed.
- Cloudflare D1 (SQLite) — all billing tables; rate_limits table (migration 0008) backs the tier quota; `ux_featured_slots_live` partial unique (0017) backs slot exclusivity.
- Cloudflare Access — gates the admin Worker that performs all manual billing operations (decision 0014).
- Meta (Facebook) — fetches /feeds/meta-vehicles.csv on its own schedule for Advantage+ catalog ads (decision 0015); operator-side Business Manager/catalog/campaign setup is outside the repo.
- Resend — sends the dealer reports that carry the 30% accounting line (workers/expire-sweeper/src/reports.ts); no RESEND_API_KEY → logged no-op.
