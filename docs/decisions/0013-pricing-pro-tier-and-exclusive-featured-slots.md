# 0013 — Pricing: Pro at $99/$990 and exclusive city×brand featured slots

- **Status:** accepted — prices fixed by the owner 2026-06-12; featured-slot
  sales are post-launch (house-ad placeholder at launch)
- **Date:** 2026-06-12
- **Supersedes:** the provisional "$500–1500/mo" featured-slot range noted in
  the 0001 schema comments and `docs/architecture/billing.md`

## Context

Two distinct revenue products were designed but had no committed prices:

1. **Pro subscription** (used-car dealers and salvage yards) — gates defined
   in decision 0012: unlimited active listings (free cap = 5), private market
   analytics, social boost; 30-day no-card trial.
2. **Featured slots** — the first block on every city/make/model catalog page
   is a NEW-vehicle ad. The `featured_slots` table (0001) was built for this:
   `model_id NULL` = the slot covers **all models of the make**, `disclosure`
   is mandatory, one active slot per (make, city).

## Decision

1. **Pro: CA$99/month or CA$990/year** (2 months free). Applies to used-car
   dealers and yards; collected via Stripe when billing wires up (0012).
2. **Featured slots are sold as city×brand exclusivity**: one official
   (franchise) dealer buys ALL new-vehicle placements for their brand in a
   city — every model page of that make shows their promo. Not self-serve;
   a direct-sales B2B contract, invoiced (Stripe Invoicing later, manual
   activation via `featured_slots` insert at first). Official dealers buying
   slots are a separate audience from Pro subscribers — the products are
   orthogonal.
3. **Slot pricing: list price anchored at CA$2,995/mo per city×brand**, with
   a founding-partner rate (~CA$750–1,000/mo, 6–12-month lock) while traffic
   is young. Rationale: AutoTrader.ca dealer packages run ~$450 (entry) to
   $2,000+/mo (enterprise) for *non-exclusive* used-listing packages;
   exclusivity over every model page of a brand in a metro justifies a
   premium over their top tier — but only once traffic exists, hence the
   founding rate that converts the discount into an early-commitment story
   rather than a low anchor. Review quarterly against traffic/lead reports.
4. **Until a slot is sold, the block runs a house ad**: a link to the brand's
   official Canadian site (e.g. toyota.ca) with no fabricated dealer name and
   no invented MSRP, plus an "Advertise here" CTA. The current demo creative
   (fictional dealers + made-up MSRP from `catalog-stubs.ts`) must not reach
   launch (extends decision 0007).
5. **Paid slots must carry visible "Sponsored" labeling (already in the
   creative) and `rel="sponsored"` on the outbound dealer link** — Google
   treats paid links without it as link-scheme spam, and ad-disclosure is a
   Competition Act expectation.

## Alternatives

- **Self-serve checkout for slots:** rejected — a $3k/mo exclusive contract
  is a sales conversation, not a card form; building checkout for ≤54 SKUs
  (6 cities × 9 brands) is waste.
- **Per-model slot pricing:** rejected — fragments the pitch ("own Toyota in
  Calgary" is one sentence), invites partial coverage that looks broken, and
  multiplies sales effort per dollar.
- **Launching with the $3k list price:** rejected — at zero traffic the value
  story fails any dealer's $/lead math; founding rate preserves the anchor
  while making the first contracts closable.

## Consequences

Inventory ceiling is legible for due diligence: ~54 exclusive slots at list
= ~CA$160k/mo theoretical cap, independent of Pro MRR. Launch needs one small
code change (house-ad creative replacing demo combos + `rel="sponsored"`
support in `FeaturedSlot.astro`). The admin activation path stays manual
(SQL insert per contract) until slot volume justifies tooling; the 501
skeleton at `functions/api/featured-slots/index.ts` documents that boundary.
