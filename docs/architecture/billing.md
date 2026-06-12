# Billing & entitlements (current + planned)
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Monetization layer for the marketplace: per-dealer subscription tier/status (free|pro) that gates listing-creation rate limits, plus two paid-placement products — per-listing "boost" (self-serve, Stripe one-time) and per-(make,city) "featured slots" (admin/direct-sales). Committed prices (decision 0013, 2026-06-12): Pro CA$99/mo or CA$990/yr; featured slots are city×brand exclusives listed at CA$2,995/mo with a founding-partner rate while traffic is young. Subscriptions and Stripe payment processing are schema + skeleton only; nothing is wired end-to-end yet.

## Key files

| Path | Role |
|---|---|
| `migrations/0001_initial_schema.sql` | Source of truth for all billing tables/columns: dealers.subscription_tier/status/stripe_customer_id, listings.boost_until/boost_paid_cents, featured_slots, boost_orders. Defines CHECK constraints + indexes (idx_dealers_stripe_customer, idx_boost_orders_stripe partial UNIQUE). |
| `functions/api/stripe/webhook.ts` | SKELETON. POST /api/stripe/webhook. Reads raw body, checks Stripe-Signature header presence only, then returns 200 {ok:true,note:'skeleton'}. No HMAC verification, no event parsing, no DB writes. All real logic is a TODO comment block. |
| `functions/api/boost/checkout.ts` | SKELETON. POST /api/boost/checkout. Does real auth (requireDealer), ownership + active-status checks on the listing, and zod validation; then returns 501 notImplemented. No Stripe session creation, no boost_orders insert. |
| `functions/api/featured-slots/index.ts` | SKELETON. POST /api/featured-slots. After requireDealer, unconditionally returns 403 forbidden (admin-only, no admin role exists on MVP). Insert path is commented out. |
| `lib/schema.ts` | Zod contract. Enums SUBSCRIPTION_TIERS/STATUSES, BOOST_ORDER_STATUSES, FEATURED_SLOT_STATUSES; boostOrderCreateInputSchema, featuredSlotCreateInputSchema; dealerSelf/dealerPublic views that omit stripe_customer_id. LIMITS.BOOST_DURATION_DAYS_MIN/MAX (1..90). |
| `functions/api/_lib/rate-limit.ts` | The ONLY wired entitlement. LISTING_CREATE_FREE_TIER (50/day) vs LISTING_CREATE_PRO_TIER (500/day) selected by dealers.subscription_tier. |
| `functions/api/listings/index.ts` | Consumes the tier entitlement (lines 209-214): getDealerById then picks free/pro rate-limit bucket. Card builder maps row.tier===2 → is_boosted, splits catalog into boosted/organic (lines 154,171-172). |
| `functions/api/_lib/db.ts` | Boost-ranking SQL (listCatalog ~L272-308, listRecentListings ~L372-388): tier=2 when boost_until>now else 3; ORDER BY tier ASC, boost_amount DESC. getActiveFeaturedSlot (~L406) reads one active featured_slots row per (make,model|null,city). |
| `functions/api/listings/[id]/index.ts` | Boost forfeiture on lifecycle transitions (L104-110): clears boost_until=NULL, boost_paid_cents=0 on revive and on leaving 'active'. |
| `functions/api/auth/signup.ts` | Sets new dealers to subscription_tier='free' hard-coded (L62), subscription_status=null, stripe_customer_id unset. |
| `types/env.d.ts` | Declares STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as secrets (L52-54). Both are typed but unused at runtime. |
| `functions/api/dealers/me.ts` | GET/PATCH self profile via dealerSelfSchema (omits stripe_customer_id). MUTABLE_COLUMNS allowlist (L31-36) deliberately excludes all billing columns — dealers cannot self-mutate tier/status/stripe id. |

## How it works

Three distinct mechanisms, only the first is live.\n\n1) SUBSCRIPTION TIER ENTITLEMENT (wired). dealers.subscription_tier is a CHECK ('free','pro') column, defaulted 'free' at signup (functions/api/auth/signup.ts hardcodes 'free'). The single behavioral effect: in listings/index.ts onRequestPost and donors/index.ts, after requireDealer() the handler calls getDealerById(env, auth.dealerId) and selects RATE_LIMITS.LISTING_CREATE_PRO_TIER (500/day) vs LISTING_CREATE_FREE_TIER (50/day) based on dealer.subscription_tier==='pro'. Note requireDealer()'s AuthContext does NOT carry the tier (only dealerId/email/dealerType/verified), so each tier-gated handler does a second DB read. subscription_status and stripe_customer_id are never written by any code path and never read for any decision — they exist for the planned Stripe subscription sync only.\n\n2) BOOST (per-listing paid placement; schema live, payment path skeleton). Ranking is fully implemented and runs on every public catalog read: db.ts computes tier=2 when listings.boost_until IS NOT NULL AND > now, else tier=3, and boost_amount=boost_paid_cents for boosted rows; ORDER BY tier ASC, boost_amount DESC, created_at DESC. The card builder (listings/index.ts L154) sets is_boosted=(row.tier===2) and partitions results into boosted[]/organic[]. Boost is forfeited (boost_until=NULL, boost_paid_cents=0) whenever a listing leaves 'active' or is revived (listings/[id]/index.ts L104-110, audit #36). What is NOT wired: actually setting boost_until/boost_paid_cents. boost/checkout.ts validates auth+ownership+active-status+body then returns 501; it never inserts boost_orders nor creates a Stripe session. webhook.ts (which the TODO says would do the UPDATE listings SET boost_until=MAX(...)+duration*86400 and flip boost_orders.status) is a no-op returning 200. So in production today a listing's boost_* columns can only ever be 0/NULL.\n\n3) FEATURED SLOTS (per-(make,city) sponsored top slot; read-side live, create-side blocked). getActiveFeaturedSlot() in db.ts selects one row WHERE status='active' AND active_from<=now AND active_until>now, preferring model-specific over make-wide and higher contract_paid_cents; this feeds the FeaturedListing in CatalogResponse. The only writer, POST /api/featured-slots, unconditionally returns 403 (admin role does not exist on MVP). So featured_slots can only be populated out-of-band (direct SQL/seed).\n\nStripe integration overall: no SDK dependency in package.json (verified node_modules has no stripe), STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET declared but unreferenced in code. boost_orders table has zero INSERT sites in the codebase.

## Data model

### dealers (billing columns)

subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK in ('free','pro'); subscription_status TEXT nullable CHECK in (trialing,active,past_due,canceled,incomplete,incomplete_expired,unpaid); stripe_customer_id TEXT nullable (idx_dealers_stripe_customer); daily_listing_count INT; daily_listing_reset_at INT

*tier default 'free' set at signup. status + stripe id never written by code. daily_listing_* columns exist but rate limiting is actually done via the rate_limits table (migration 0008), not these columns.*
### listings (boost columns)

boost_until INTEGER nullable (Unix sec; >now = active boost); boost_paid_cents INTEGER NOT NULL DEFAULT 0 (cumulative, drives intra-boosted sort)

*idx_listings_boost partial index on (boost_until,boost_paid_cents) WHERE status='active' AND boost_until IS NOT NULL. Legacy featured_until column was removed in favor of featured_slots.*
### boost_orders

id TEXT PK; listing_id FK→listings CASCADE; dealer_id FK→dealers CASCADE; amount_cents INT >0; duration_days INT 1..90; stripe_payment_id TEXT (pi_...); applied_at INT; expires_at INT (applied_at+duration); status TEXT DEFAULT 'paid' CHECK in (paid,refunded,disputed); created_at INT

*Audit trail for boost charges. idx_boost_orders_stripe UNIQUE on stripe_payment_id WHERE NOT NULL (idempotency). NO insert sites exist yet.*
### featured_slots

id TEXT PK; dealer_id FK CASCADE; make_id FK; model_id FK nullable (NULL=all models); city TEXT (CMA slug, app-enforced); province; promo_title; promo_msrp_cents INT; promo_image_id TEXT; promo_url TEXT; disclosure TEXT; active_from/active_until INT; contract_paid_cents INT DEFAULT 0; status TEXT DEFAULT 'pending' CHECK in (pending,active,paused,ended)

*B2B sponsored slot for NEW vehicles; exempt from used-car age-cap triggers. One active per (make,city[,model]) enforced at app layer only. Read via getActiveFeaturedSlot; no live writer (create endpoint 403s).*

## Invariants

- Money is INTEGER cents CAD everywhere (boost_paid_cents, amount_cents, promo_msrp_cents, contract_paid_cents); timestamps are Unix seconds INTEGER.
- A listing is 'boosted' iff boost_until IS NOT NULL AND boost_until > now(). This single predicate is recomputed in SQL on every catalog/recent read (db.ts) — there is no persisted is_boosted flag.
- Boost must never survive a listing lifecycle round-trip: any transition out of 'active' (sold/expired) and any revive resets boost_until=NULL and boost_paid_cents=0 (listings/[id]/index.ts; audit #36). A revived listing must not inherit a paid boost.
- boost_orders.stripe_payment_id is UNIQUE where NOT NULL (idx_boost_orders_stripe partial unique) — a single Stripe payment_intent can finalize at most one boost order (planned idempotency anchor for the webhook).
- Exactly one active featured slot is expected per (make, city[, model]) at a time; this is enforced ONLY at the app layer (SQLite cannot do filtered UNIQUE over overlapping time windows). getActiveFeaturedSlot uses LIMIT 1 with deterministic tie-break (model-specific first, then contract_paid_cents DESC).
- stripe_customer_id must never leave the server: dealerSelfSchema AND dealerPublicSchema both .omit it (lib/schema.ts L513,L528). The /api/dealers/me PATCH MUTABLE_COLUMNS allowlist excludes subscription_tier, subscription_status, stripe_customer_id — dealers cannot self-promote to 'pro' or attach a Stripe id.
- subscription_tier is non-null CHECK ('free','pro') default 'free'; subscription_status is nullable CHECK over the 7 Stripe states. dealerRowSchema (read-side) relaxes input rules but keeps subscription_tier required — a row with NULL/invalid tier would 500 the login/refresh path (getDealerById parses with dealerRowSchema).
- boost duration is bounded 1..90 days at both DB CHECK (boost_orders.duration_days BETWEEN 1 AND 90) and zod (LIMITS.BOOST_DURATION_DAYS_MIN/MAX).
- amount_cents > 0 (DB CHECK); zod boostOrderCreateInputSchema additionally floors at 100 (>= $1 CAD).

## Design decisions

- **Two-product split: per-listing self-serve 'boost' (boost_orders + listings.boost_* columns) vs per-(make,city) 'featured slots' (separate featured_slots table), rather than one unified promotions table.** — They have different lifecycles and pricing models: boost is a one-time Stripe charge extending a single listing's boost_until (cumulative boost_paid_cents drives intra-tier sort); featured slots are long-term B2B contracts (CA$2,995/mo list per decision 0013, superseding the $500-1500 range in the 0001 schema comments) for NEW vehicles that bypass the used-car age cap and render as a distinct FeaturedListing creative, not a listing card. *Rejected:* A single listings.featured_until column (explicitly noted as REMOVED in the schema comment at 0001 L217 in favor of the featured_slots table) — rejected because sponsored slots advertise new vehicles from official dealers and must not be modeled as individual used-car listings.
- **Boost ranking is computed live in SQL (CASE on boost_until>now) on every read instead of a materialized boosted flag or a cron sweeper.** — Pages Functions cannot schedule cron, so there is no sweeper to flip expired boosts; deriving tier/boost_amount at query time keeps ranking correct the instant a boost expires, consistent with the same no-cron rationale used for listing TTL (LISTING_NOT_EXPIRED). *Rejected:* A persisted is_boosted/boost_active column maintained by a scheduled job — rejected due to the no-cron constraint and the staleness it would introduce.
- **Subscription tier/status and Stripe customer linkage live on the dealers row, with all Stripe sync deferred to a (currently skeleton) webhook; only the tier→rate-limit entitlement is implemented.** — Ship the marketplace and anti-spam quota differentiation first; the 'pro' tier has a concrete effect (10x listing quota) without needing live billing. subscription_status mirrors Stripe's 7 states so the future webhook can write them verbatim. *Rejected:* Building full Stripe Billing subscription sync before launch — deferred; no Stripe SDK is even installed.
- **Featured-slot creation is gated to a non-existent admin role and hard-returns 403 on MVP; slots are populated out-of-band.** — Featured slots are sold via direct sales, not self-serve, so no dealer-facing creation flow is needed yet; the file documents that Phase 2 introduces is_admin or an admin_users table. *Rejected:* Exposing self-serve featured-slot purchase — rejected as off-model for a direct-sales B2B product.
- **stripe_customer_id is stored on dealers and indexed (idx_dealers_stripe_customer) but stripped from every API response view.** — The id is needed server-side to correlate webhook customer.subscription.* events back to a dealer, but is sensitive linkage data that must not appear in cacheable JSON. *Rejected:* Omitting the column until billing lands — rejected; the index and column are pre-provisioned so the webhook can look up dealers by Stripe customer without a migration.

## Security notes

- webhook.ts performs NO signature verification. It only checks the Stripe-Signature header is present, then returns 200 without parsing. The header value is fully attacker-controllable. This is currently inert because no DB writes happen, but the moment any event-handling logic is added it MUST verify HMAC-SHA256 against STRIPE_WEBHOOK_SECRET on the raw body BEFORE JSON.parse (the TODO at L29 says so). The dead `if (sig === 'skeleton')` branch must be removed before wiring.
- webhook.ts has no idempotency handling yet. Stripe retries the same event; the planned boost UPDATE (boost_until = MAX(...)+duration) would double-apply on retry. The partial-unique idx_boost_orders_stripe on stripe_payment_id is the intended idempotency guard but is not yet used by any insert.
- stripe_customer_id is correctly omitted from dealerSelfSchema and dealerPublicSchema and is not in the PATCH MUTABLE_COLUMNS allowlist — dealers cannot read or set it, and cannot self-escalate subscription_tier to 'pro'. This separation is the main entitlement-integrity control today and holds.
- Tier is re-read from the live dealers row (getDealerById) at rate-limit time rather than trusted from the JWT, so a stale token cannot grant pro quota; consistent with the token_epoch kill-switch model in requireDealer.
- boost/checkout.ts validates listing ownership (listing.dealer_id === auth.dealerId → 403) and active status before any (future) charge — IDOR/charge-for-others-listing is already guarded even though the charge itself is unimplemented.
- featured_slots.promo_url is validated by httpUrlSchema (http/https only, blocking javascript:/data:) in featuredSlotCreateInputSchema — relevant because promo_url is rendered as an outbound CTA href; but since the create endpoint is 403-blocked, any slot inserted via direct SQL bypasses this zod check and must be trusted by the operator.

## Gaps / TODO

- functions/api/stripe/webhook.ts — entirely skeleton: no HMAC verification, no event switch, no DB writes; returns 200 {note:'skeleton'}. Contains a dead `sig==='skeleton'` test branch.
- functions/api/boost/checkout.ts — returns 501. Missing: boost_orders pending-row insert, Stripe Checkout session creation (mode:'payment', client_reference_id=order_id, metadata listing_id/dealer_id/duration_days), and the success/cancel redirect URLs.
- No Stripe SDK installed (package.json deps are only astro + zod; node_modules has no stripe). STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are declared in env.d.ts but referenced nowhere in code.
- boost_orders table has ZERO insert sites anywhere in the codebase; it is purely declarative until the checkout/webhook pair is wired.
- No code path ever writes dealers.subscription_status or dealers.stripe_customer_id. There is no subscription create/upgrade/cancel flow — 'pro' tier can currently only be set by direct SQL.
- No admin role exists. POST /api/featured-slots hard-returns 403; the file notes Phase 2 must add an is_admin flag or admin_users table. featured_slots rows can only be created out-of-band.
- No ADR-0007 document exists in the repo despite being cited throughout schema.ts and 0001 (the monetization design rationale lives only in code comments).
- Entitlement enforcement is narrow: subscription_tier affects ONLY listing-creation rate limit (free 50/day vs pro 500/day). No other feature is gated by tier (e.g., photo caps, featured access). 'pro' has no billing backing.
- featured_slots/listings boost have no cron expiry sweeper (Pages Functions limitation); reliance on live-computed predicates means status='active' rows with past active_until remain 'active' in the DB and are filtered only at read time — boost_orders.status and featured_slots.status are never auto-transitioned.

## External dependencies

- Stripe (planned, NOT integrated): Checkout Sessions API for boost one-time payments; webhook events checkout.session.completed, customer.subscription.{created,updated,deleted}, charge.refunded, payment_intent.payment_failed. No stripe npm package installed; STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET secrets declared in env.d.ts but unused.
- Cloudflare D1 (SQLite) — all billing tables; rate_limits table (migration 0008) backs the tier-based listing quota via atomic INSERT...ON CONFLICT...RETURNING.
- Resend (RESEND_API_KEY) — referenced in env for the planned payment_intent.payment_failed dealer email, not wired in billing code.
