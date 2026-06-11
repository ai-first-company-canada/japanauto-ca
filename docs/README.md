# JapanAuto documentation

Documentation index. How these docs are written and maintained:
[DOCS-CONVENTIONS.md](../DOCS-CONVENTIONS.md) (repo root).

## Architecture (`architecture/`)

One file per subsystem — purpose, key files, control flow, invariants,
decisions, security notes, known gaps. Captured 2026-06-11 from a code-level
read; re-verify symbols when relying on them (convention R5).

| Doc | Covers |
|---|---|
| [auth-sessions](architecture/auth-sessions.md) | JWT access + rotating refresh tokens, token_epoch kill switch, CSRF, PBKDF2 |
| [data-model](architecture/data-model.md) | All D1 tables, migrations 0001–0010, zod↔SQL duality, journal-drift gotcha |
| [request-lifecycle](architecture/request-lifecycle.md) | `_middleware.ts`: geo, security headers, CSP (hash+nonce), CORS, error boundary |
| [listings-lifecycle](architecture/listings-lifecycle.md) | Statuses, TTL + expire-sweeper, mark-sold, VIN, slugs, IndexNow |
| [donors-parts](architecture/donors-parts.md) | Junkyard donor cars, compatibility, parts pages, AutoPartsStore JSON-LD |
| [media-pipeline](architecture/media-pipeline.md) | CF Images direct upload, pending-upload ownership binding, atomic primary |
| [seo-ssg](architecture/seo-ssg.md) | 902 SSG pages, city-first URLs, JSON-LD, isDemo gating, seo-audit gates |
| [rate-limiting](architecture/rate-limiting.md) | D1 atomic fixed-window limiter, all buckets, IP hashing |
| [billing](architecture/billing.md) | Subscription columns, Stripe skeletons, boost orders — current vs planned |
| [infra-ops](architecture/infra-ops.md) | Pages + bindings, deploy gates, cron worker, CI, env/secrets |

## Decisions (`decisions/`)

ADRs — context, decision, rejected alternatives, consequences. Numbered, never
renumbered. Start here to understand *why* the system is shaped this way:
0001 city-first URLs · 0002 D1 atomic rate limiter · 0003 CSP without
unsafe-inline · 0004 token_epoch kill switch · 0005 refresh reuse detection ·
0006 CSRF via fetch metadata · 0007 isDemo JSON-LD gating · 0008 pending-media
ownership binding · 0009 listing TTL + cron sweeper · 0010 dealer self-update
allowlist · 0011 fail-closed JWT secret · 0012 billing effective-tier (planned).

## Rules (`rules/`)

Normative domain rules cited by code comments (validation, VIN, slugs,
postal/phone, brand whitelist, listing lifecycle, API conventions, catalog
page). Migrated 2026-06-11 from the planning vault so the code's citations
resolve inside the repo (convention R1).

## Security (`security/`)

[posture.md](security/posture.md) — controls in place, the 2026-06-09 audit
findings fixed (with commits), and what remains open.

## Operations

[runbook.md](runbook.md) — deploy, migrations, cron worker, local dev,
secrets, launch procedure, verification recipes.
