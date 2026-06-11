---
title: "API on Cloudflare Pages Functions"
confidence: high
sources_count: 2
verified: true
last_verified: 2026-05-02
trust_level_avg: 5.0
tags: [architecture, api, workers, pages-functions, typescript]
supersedes: "first revision (2026-05-01) — обновлено с реальной имплементацией skeleton"
---

# API on Cloudflare Pages Functions

Все динамические эндпоинты живут в Cloudflare **Pages Functions** (TypeScript strict). Astro frontend — статика; динамика через `fetch` к этому API.

Каноничный код — в [[functions/README|functions/]]. Здесь — описание правил и endpoints.

## Базовые правила

- TypeScript `strict: true`. Никакого `any` без явного обоснования в коде.
- Все handlers — async функции с типизированными request/response через `PagesFunction<Env>`.
- Prepared statements для D1 (`env.DB.prepare(...).bind(...)`) — anti-SQL-injection by construction.
- Auth middleware (`requireDealer`) на любых mutations и `/dashboard/*` proxied endpoints.
- Все user input — через [[validation-zod]] (`lib/schema.ts`) до записи или дальнейшей логики.
- CORS настроен whitelist в [[functions/README|functions/_middleware.ts]] — `japanauto.ca` + Pages preview.
- Error handling — типизированный, корректные HTTP-коды (400/401/403/404/409/422/429/500/501).

## Структура endpoints (MVP)

### Implemented

```
POST   /api/auth/signup                 # registration + JWT cookies
POST   /api/auth/login                  # JWT + refresh cookies
POST   /api/auth/refresh                # token rotation
POST   /api/auth/logout                 # revoke + clear cookies

GET    /api/listings                    # catalog (featured + boosted + organic), zod-validated query
POST   /api/listings                    # auth: dealer
GET    /api/listings/:id                # single
PATCH  /api/listings/:id                # auth: owner
DELETE /api/listings/:id                # soft → status='expired'
POST   /api/listings/:id/track-contact  # beacon (anti-scraping)

GET    /api/dealers/:slug               # public profile
GET    /api/dealers/me                  # auth: self
PATCH  /api/dealers/me                  # auth: self

GET    /api/cities                      # active CMAs
GET    /api/makes                       # 9-brand whitelist
```

### Stub (validates input, returns 501)

```
POST   /api/auth/password-reset/request
POST   /api/auth/password-reset/confirm
POST   /api/auth/verify-email

GET    /api/parts
POST   /api/parts                       # auth: salvage_yard

POST   /api/media/upload-url            # Cloudflare Images direct-upload
POST   /api/media/finalize

POST   /api/boost/checkout              # Stripe Checkout for one-time boost
POST   /api/featured-slots              # admin only (Phase 2)

POST   /api/stripe/webhook              # subscription/boost events
```

## Auth модель

Реализовано в `_lib/auth.ts`:

- **Access token** — 15 min, JWT HMAC-SHA256, в cookie `jc_access` (HttpOnly + SameSite=Lax) или `Authorization: Bearer …`.
- **Refresh token** — 30 days, opaque random 32 bytes, hashed (sha256) в D1 `refresh_tokens`. На refresh → rotation: новый row + old.revoked_at + old.rotated_to.
- **Password** — PBKDF2-SHA256, 600k iterations, 16-byte salt. Format: `pbkdf2$600000$<salt-b64>$<hash-b64>`.
- **requireDealer middleware** — pattern `if (auth instanceof Response) return auth;` дает early-return без try/throw.

## Edge middleware

[[functions/README|functions/_middleware.ts]] делает на каждый request:

1. Резолвит `data.geo: CityResolution` из `request.cf.city + request.cf.region` через `city_aliases` (cookie wins, см. [[auto-geolocation]]).
2. Tag-ит bots через UA regex (Googlebot, ChatGPT, Perplexity и т.д.) — не блокирует, только tag.
3. Добавляет security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).
4. Handles CORS preflight для `/api/*` против whitelist.

## Rate limits (anti-abuse)

В `_lib/rate-limit.ts`, KV-backed sliding window:

| Bucket | Limit | Window |
|--------|-------|--------|
| Login per email | 5 | 1 min |
| Login per IP | 20 | 1 hour |
| Signup per IP | 5 | 1 hour |
| Listing create — free tier | 50 | 1 day |
| Listing create — pro tier | 500 | 1 day |
| Contact reveal per IP | 30 | 1 hour |
| Contact reveal per listing | 100 | 1 day |

Daily-rotating IP hash salt (`DAILY_IP_HASH_SALT`) делает hashes useless после 24h — privacy-by-design.

## Edge caching

Public GET endpoints используют `Cache-Control: public, s-maxage=N, stale-while-revalidate=M`:

- `/api/cities` — 1 hour (rarely changes)
- `/api/makes` — 24 hours (essentially static)
- `/api/dealers/:slug` — 5 min
- `/api/listings` (catalog) — 60s

Mutations пока не bust-ят cache по тегу — полагаемся на TTL. Phase 2: `cache.invalidate()` через KV trigger.

## Quality gates перед merge

- [x] TypeScript strict проходит
- [x] Prepared statements
- [x] Auth middleware на защищённых endpoints
- [x] zod validation
- [x] Типизированные responses
- [x] CORS настроен
- [x] Error handling

## Verification (текущий skeleton)

- TypeScript strict на 26 файлах: **0 errors**
- Runtime smoke (JWT, PBKDF2, IP hash, rate-limit): **25/25 PASS**

См. [[2026-05-02-task-5-workers-skeleton]] для полного отчёта.

## Связанные концепции

- [[tech-stack-frozen]]
- [[d1-schema]]
- [[auth-jwt]]
- [[validation-zod]]
- [[media-r2]]
- [[stripe-subscriptions]]
- [[anti-spam-policy]]
- [[auto-geolocation]]
- [[adr-0003-direct-contact-display]]
- [[adr-0007-navigation-flow-and-monetization]]
- [[functions/README|functions/]]
- [[lib/README|lib/schema.ts]]
- [[migrations/README]]
