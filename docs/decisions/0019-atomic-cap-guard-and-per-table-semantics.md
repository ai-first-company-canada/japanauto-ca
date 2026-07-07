# 0019 — Atomic free-tier cap enforcement + per-table cap semantics

- **Status:** accepted, implemented
- **Date:** 2026-07-07
- **Context:** deep-audit 2026-07-05 finding COR-3 (medium); OPUS-PLAN WS-3/T1
- **Deciders:** owner delegated both calls ("исправлять на своё усмотрение", 2026-07-07)

## Problem

`enforceActiveCap()` was check-then-act: a `SELECT COUNT(*)` in one statement,
the status-setting write in another. Two concurrent publishes with 4 active
rows both passed the check and both wrote — a free dealer could overshoot the
"5 active" cap (the only monetization barrier of the free tier) with a double
click or a script.

Separately, the code and its comments disagreed about what the cap *means*:
`donors/index.ts` said donors "share the same allowance" with listings, but
`enforceActiveCap` counts one table at a time — de facto 5 listings **plus**
5 donor cars.

## Decision 1 — enforcement: conditional write, same statement

Every transition into `status='active'` (listings create/PATCH, donor_cars
create/PATCH) folds a cap predicate into the writing statement itself:

- create: `INSERT ... SELECT ... WHERE (? < 0 OR (SELECT COUNT(*) ...) < ?)`
- publish/revive: `UPDATE ... SET status='active' ... WHERE id = ? AND (...)`

`meta.changes === 0` → typed 403 (`capExceeded()`, same message as the
advisory pre-check). D1 is a single SQLite primary that serializes writers, so
one conditional statement is sufficient — the second concurrent write sees the
first one's committed row. Pro/trial binds `cap = -1`, short-circuiting the
predicate to TRUE (uncapped path stays single-statement too).

Rejected alternatives:
- **Partial unique index** — expresses "max 1", not "max 5"; a slot column
  reintroduces the race and breaks Pro-unlimited/downgrade.
- **SQLite trigger** — would duplicate `effectiveTier()` (subscription + trial
  + now) in SQL, re-opening the COR-4 drift the LIVE_PAID_SUBSCRIPTION_STATUSES
  constant just closed; returns generic D1_ERROR instead of a typed 403; needs
  a migration (journal-drift procedure) for zero benefit.

`enforceActiveCap()` remains as an advisory pre-check (friendly early 403, no
side effects). The admin-worker `flagged→active` restore stays outside the
guard deliberately: it is a moderator undo behind Cloudflare Access, restoring
a row that was already active (and already counted) before flagging.

## Decision 2 — semantics: per-table (5 listings + 5 donor cars)

The free cap is **per table**, not shared. Rationale:

1. It is what the code has always done — no behavior change under partners.
2. It matches the two partner archetypes: a dealership lives in `listings`, a
   junkyard in `donor_cars`; a shared cap would let 5 listings starve a
   junkyard's donors (or vice versa) for no monetization gain.
3. A shared cap needs a two-table UNION count inside the guard subquery —
   more binds, more coupling, harder to reason about under concurrency.

The misleading "share the same allowance" comments were corrected in place.
Pricing copy ("Free = 5 active listings") remains true for each partner type
as they experience it; if marketing ever needs "5 total across both", this ADR
is the place to revisit.

## Verification

- `tests/cap-guard.test.ts` pins SQL shape + bind order; suite green (61).
- Real-SQLite semantics check (INSERT №5 passes, №6 blocked with changes=0,
  cap=-1 bypasses, UPDATE-revive at cap blocked) — scripted run 2026-07-07.
- Live: deployed to Pages; concurrent-publish burst can no longer overshoot —
  the write and the count are one serialized statement by construction.

## Consequences

- Bind budget: create-INSERT +3 binds (≈36 total), PATCH +4 — well under the
  D1 100-param cap. Do not extend the guard to a UNION count without
  re-checking the budget.
- WS-1 (Stripe downgrade freeze/unfreeze) must route any future re-activation
  writes through the same guard (`activeCapGuard`) rather than adding new
  unconditional status flips.
