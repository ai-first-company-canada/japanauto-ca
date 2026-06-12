# Social boost — content-factory integration contract

> Captured 2026-06-12. Feature 3 (LAUNCH-PLAN-2026-06). Verify symbols against
> the code when relying on this document (DOCS-CONVENTIONS.md R5).

## Purpose

A dealer clicks **Promote** on an active listing → a job is queued with a
snapshot of the listing → an **external content-factory project** turns it
into posts/reels on the project's social channels and writes the published
links back. Our D1 owns the queue; the factory is a pull-model API client —
no shared database (schema decoupling + due-diligence hygiene).

## Key files

| Path | Role |
|---|---|
| `migrations/0015_social_boost_jobs.sql` | Queue table; one active job per listing (partial unique index) |
| `functions/api/listings/[id]/boost-social.ts` | Dealer queues a job (owner + Pro/trial entitlement + 10/day cap); builds the snapshot |
| `functions/api/social/jobs/mine.ts` | Dealer's job statuses + published links for the cabinet |
| `functions/api/social/jobs/index.ts` | Factory pull: list jobs by status |
| `functions/api/social/jobs/[id].ts` | Factory advance: status transitions + result links |
| `functions/api/_lib/factory-auth.ts` | Timing-safe Bearer check against `SOCIAL_FACTORY_TOKEN` |

## Lifecycle

```
requested ──► in_production ──► published (terminal, requires result_links)
    │                │
    └────────────────┴──► cancelled (terminal)
```

Terminal states are immutable (409). Re-promoting a listing is possible once
the previous job is terminal.

## Factory protocol (what the other project implements)

Auth on every call: `Authorization: Bearer <SOCIAL_FACTORY_TOKEN>`.

1. **Poll**: `GET /api/social/jobs?status=requested&limit=20` → oldest-first
   jobs with `payload` (snapshot: listing_url, year/make/model/trim,
   price_cad, mileage_km, city, dealer_name, photos[] as Cloudflare Images
   delivery URLs, snapshot_at).
2. **Claim**: `PATCH /api/social/jobs/:id` `{"status":"in_production"}`.
3. **Pre-publish check (MANDATORY)**: GET the `listing_url` — if it is no
   longer 200 (sold/expired), `PATCH {"status":"cancelled"}` and skip.
4. **Publish** on the channels. Every link to the listing in post copy MUST
   carry `?utm_source={platform}&utm_medium=social&utm_campaign=boost-{job_id}`
   — this is how boost traffic will surface in the dealer's stats.
5. **Report**: `PATCH {"status":"published","result_links":["https://…", …]}`
   (1–20 http(s) URLs). They appear in the dealer's cabinet immediately.

## Consent

The dealer's Promote click confirms an explicit consent dialog ("you allow
japanauto.ca to use this listing's photos and details for promotional
posts"). The snapshot is what was consented to — the factory must not pull
fresher data from the live page beyond the step-3 liveness check.

## Configuration

`SOCIAL_FACTORY_TOKEN` — Pages secret; absent → factory endpoints return 503
(dealer-side queueing still works, jobs simply wait). Pages secrets take
effect on the next deployment.

## Gaps / future

- Auto-cancel of pending jobs on sold/expired transitions (currently the
  factory's step-3 check covers it).
- utm_source breakdown in the stats modal ("from social: N views") — needs
  view-source tracking, post-launch.
