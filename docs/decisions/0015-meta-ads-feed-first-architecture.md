# 0015 — Facebook promotion: feed-first Automotive Inventory Ads, API boost later

- **Status:** accepted — v1 feed shipped 2026-06-12; Meta-side setup + v2 pending
- **Date:** 2026-06-12

## Context

Pro includes a promotion perk: ~CA$1/day per Pro dealer of Facebook ad spend
promoting their live listings as product carousels, with poor performers
dropped automatically. Plus a future self-serve "Boost on Facebook" for a
single listing. The owner's first sketch was per-listing ads managed by our
own optimizer over the Marketing API.

## Decision

1. **Don't rebuild Meta's optimizer.** Advantage+ Catalog Ads (Automotive
   Inventory Ads vertical) natively does the "run everything, kill losers"
   loop at the vehicle level. Our integration surface shrinks to a catalog
   feed + budget management.
2. **v1 is a feed, not an API client.** `GET /feeds/meta-vehicles.csv?key=…`
   (Pages Function) serves active listings of Pro-entitled dealers with ≥1
   photo, in Meta's vehicle-feed CSV dialect (carousel images via
   `image[N].url`, `custom_label_0` = dealer id, `custom_label_1` = city,
   listing URLs carry `utm_source=facebook&utm_medium=catalog_ads&
   utm_campaign=pro-promo`). Meta fetches it on schedule; inventory and
   Pro-membership churn propagate automatically (sold/expired/downgraded →
   row disappears → ad stops). No app review, no tokens.
3. **Budgets are POOLED**: one campaign, daily budget = N(Pro dealers) × $1.
   A $1/day ad set never exits the learning phase; strict per-dealer
   isolation is worse for every dealer. The perk is sold as "your inventory
   runs in our Facebook catalog campaign", not as a dedicated spend ledger.
4. **Feed inclusion is an entitlement** (`fbPromotion` in getEntitlements —
   pro only). Single choke point; Stripe wiring later changes nothing here.
5. **v2 (post-launch, needs Meta business verification + `ads_management`
   app review — STARTED EARLY because of its lead time):** self-serve boost
   (Stripe payment → ad set over a one-listing product set → auto-stop at
   term; pricing pass-through + service fee), Insights pull into the stats
   modal, utm view-source breakdown shared with the social-boost track.
6. **No Meta Pixel in v1** — prospecting-only. Retargeting needs the Pixel
   on listing pages, which means CSP additions AND a consent story
   (PIPEDA / Québec Law 25; the site has no consent banner). Deliberately
   deferred as its own decision.

## Alternatives

- **Per-listing ads + homegrown optimizer over Marketing API:** rejected —
  reimplements Meta's delivery optimization worse, multiplies API surface,
  policy/review risk, and burn-rate of a one-person team.
- **Per-dealer ad sets ($1/day each):** rejected for v1 — below practical
  learning thresholds; revisit only if dealer count and budgets grow.
- **Pixel-first launch:** rejected — consent/compliance work must not gate
  the launch window.

## Consequences

The "automation tool" the owner asked for is, in v1, one CSV endpoint plus
Meta's own scheduler — new Pro inventory enters ads within a day, lost
entitlement removes it. Expectation set: $1/day/dealer ≈ 15–60 clicks/month
— a Pro-pitch perk and data source, not a growth engine. Unit economics:
CA$99 Pro − ~$30 spend = ~$69 gross before fees; self-boost (v2) is
margin-positive. Operator actions on the critical path: Business Manager +
**Business verification now** (v2 lead time), CAD ad account, vehicle
catalog pointed at the feed URL, one Advantage+ campaign.
