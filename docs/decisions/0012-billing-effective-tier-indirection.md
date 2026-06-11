# 0012 — Billing via Stripe with an "effective tier" indirection

- **Status:** planned (designed 2026-06-11; product logic ships pre-launch, Stripe wiring post-launch)
- **Date:** 2026-06-11
- **Commits:** —

## Context

Monetization is a Pro subscription (monthly/yearly, CAD) for Canadian business
customers (dealers/salvage yards — no consumers). Free tier caps a dealer at
5 active listings; Pro adds unlimited listings, private market analytics, and
social boost. Every signup gets a 30-day full-Pro trial **without a card**
(card-upfront kills B2B activation, and the marketplace needs liquidity).
Billing wiring is deliberately deferred past launch, but tier-gated features
ship before it — so feature gates must work with no payment system attached.

## Decision

1. **Provider: Stripe** — CAD billing, ACSS pre-authorized debit, hosted
   Checkout + Customer Portal (PCI and self-service off our plate), and Stripe
   Tax for GST/HST/QST by province (the hard Canadian part). Webhook skeleton
   (`functions/api/stripe/webhook.ts`) and `dealers.subscription_*` /
   `stripe_customer_id` columns already exist for this.
2. **"Effective tier" indirection:** the `subscription_tier` / `subscription_status`
   columns remain a **mirror of Stripe state and nothing else**. The trial lives
   separately (`dealers.trial_ends_at`). All authorization asks one function —
   `effectiveTier(dealer, now)` → free|pro — and features read
   `getEntitlements(dealer)` (`maxActiveListings`, `marketAnalytics`,
   `socialBoost`). Exactly four enforcement points: listing create (active-count
   cap), market-stats block in the stats API, social-boost endpoint, unfreeze.
3. **Over-limit freezing on downgrade:** a nullable `listings.frozen_at` column
   (NOT a new status — SQLite CHECK constraints can't be extended without a
   table rebuild). Public reads add `AND frozen_at IS NULL` — the same surface
   map as the `expires_at` TTL filters. Dealer chooses which 5 stay active;
   default = 5 newest; 7-day grace banner, then the cron sweeper freezes.

## Alternatives

- **Paddle / Lemon Squeezy (merchant of record):** taxes handled for us, but
  ~5%+ fees and invoices issued from their entity — wrong feel for a
  deliberately Canadian B2B product. Stripe Tax covers the tax burden at
  configuration level.
- **Square:** strong Canadian retail presence but weaker B2B SaaS subscription
  tooling.
- **Tier checks scattered per feature (`if tier === 'pro'`):** rejected —
  trial/grace/dunning semantics would be re-implemented at every gate and
  drift. The single `effectiveTier` choke point is what lets billing wire up
  later without touching any feature.
- **New `frozen` listing status:** rejected — requires rebuilding the listings
  table to change the CHECK constraint, and freezing is orthogonal to
  lifecycle status (a frozen listing is still 'active' from the dealer's view).

## Consequences

Tier-gated features (cap, analytics, boost) work from launch day with zero
payment code — the trial is just a timestamp comparison. Wiring Stripe later
means: implement checkout/portal endpoints + webhook signature verification and
let the webhook update the mirror columns. The freeze sweep adds one statement
to the existing cron worker. GST/HST registration (small-supplier threshold
CA$30k) is an organizational prerequisite outside the codebase.
