---
title: "functions/ — Cloudflare Pages Functions API"
tags: [code, workers, pages-functions, api, typescript]
related: ["[[api-workers]]", "[[d1-schema]]", "[[validation-zod]]", "[[auth-jwt]]", "[[auto-geolocation]]"]
---

# functions/ — Pages Functions API

Cloudflare Pages Functions implementation for japanauto.ca. Файлы в этой папке копируются в реальный repo as-is при initialization.

## Структура

```
functions/
├── _middleware.ts                       # Edge middleware (geo, headers, CORS, bot tag)
└── api/
    ├── _lib/                             # Shared helpers (prefix _ — not routed)
    │   ├── auth.ts                       # JWT (HMAC-SHA256), PBKDF2, requireDealer
    │   ├── db.ts                         # Typed D1 helpers (prepared statements)
    │   ├── geolocation.ts                # cf.city → CMA via city_aliases
    │   ├── rate-limit.ts                 # KV sliding window + IP hashing
    │   └── response.ts                   # JSON/error envelopes
    ├── auth/
    │   ├── login.ts                      # POST /api/auth/login
    │   ├── signup.ts                     # POST /api/auth/signup
    │   ├── refresh.ts                    # POST /api/auth/refresh (token rotation)
    │   ├── logout.ts                     # POST /api/auth/logout
    │   ├── password-reset.ts             # POST /api/auth/password-reset/{request,confirm} — STUB
    │   └── verify-email.ts               # POST /api/auth/verify-email — STUB
    ├── listings/
    │   ├── index.ts                      # GET catalog, POST create
    │   └── [id]/
    │       ├── index.ts                  # GET single, PATCH, DELETE (soft → expired)
    │       └── track-contact.ts          # POST beacon (anti-scraping audit)
    ├── dealers/
    │   ├── [slug].ts                     # GET public profile
    │   └── me.ts                         # GET/PATCH authenticated dealer
    ├── parts/
    │   └── index.ts                      # STUB — pending parts-compatibility
    ├── media/
    │   ├── upload-url.ts                 # STUB — Cloudflare Images direct-upload
    │   └── finalize.ts                   # STUB — record media row after upload
    ├── boost/
    │   └── checkout.ts                   # STUB — Stripe Checkout for boost
    ├── featured-slots/
    │   └── index.ts                      # STUB — admin only B2B contract
    ├── stripe/
    │   └── webhook.ts                    # STUB — webhook signature verify + event handling
    ├── cities.ts                         # GET active CMAs
    └── makes.ts                          # GET 9-brand whitelist
```

## Status legend

- **Implemented** — full handler with validation, error mapping, DB queries.
- **STUB** — handler exists, validates input via zod, returns 501 with TODO comment описывающим что нужно сделать. Ставится для:
  - parts CRUD (ждёт parts-compatibility.md финализации)
  - media upload (ждёт Cloudflare Images integration setup)
  - boost checkout (ждёт Stripe API key + webhook secret)
  - featured slots (admin-only, нет admin role на MVP)
  - Stripe webhook (нужен subscription/boost flow)
  - password reset / email verify (ждёт Resend integration)

## Реализованные endpoints

| Method | Path | Auth | Что |
|--------|------|------|-----|
| GET    | `/api/listings` | - | Catalog query (featured + boosted + organic), zod-validated query params, 60s edge cache |
| POST   | `/api/listings` | dealer | Create listing, rate-limited по subscription_tier |
| GET    | `/api/listings/:id` | - | Single listing |
| PATCH  | `/api/listings/:id` | owner | Partial update, FK + age-cap errors → 422 |
| DELETE | `/api/listings/:id` | owner | Soft delete (status='expired'), не row delete |
| POST   | `/api/listings/:id/track-contact` | - | Beacon, rate-limited 30/hr/IP + 100/day/listing |
| GET    | `/api/dealers/:slug` | - | Public dealer profile, 5min edge cache |
| GET    | `/api/dealers/me` | dealer | Full profile (omits password_hash) |
| PATCH  | `/api/dealers/me` | dealer | Profile update (AMVIC cross-field rule applied) |
| GET    | `/api/cities` | - | Active CMAs only, 1h edge cache |
| GET    | `/api/makes` | - | 9-brand whitelist в commercial weight order, 24h cache |
| POST   | `/api/auth/signup` | - | Registration, AMVIC enforced for AB dealers |
| POST   | `/api/auth/login` | - | Generic "Invalid credentials" (no enumeration) |
| POST   | `/api/auth/refresh` | refresh-cookie | Token rotation в D1 (revoked_at + rotated_to chain) |
| POST   | `/api/auth/logout` | - | Revoke refresh + clear cookies, idempotent |

## Quality gates (per api-workers.md) — статус

- [x] **TypeScript strict** — zero errors на 26 файлах
- [x] **Prepared statements** — все D1 queries через `.prepare().bind()`
- [x] **Auth middleware** — `requireDealer()` на mutations + `/me` endpoints
- [x] **zod validation** — все user-input через `lib/schema.ts`
- [x] **Типизированные responses** — `ApiError`, `Paginated<T>`, `CatalogResponse`
- [x] **CORS** — whitelist `japanauto.ca` + Pages preview, в `_middleware.ts`
- [x] **Error handling** — 400/401/403/404/409/422/429/500/501 с типизированной envelope

## Ключевые design-решения

### 1. JWT через WebCrypto, без Node deps

`auth.ts` использует только `crypto.subtle` — работает в Workers runtime без `node:crypto`. HMAC-SHA256 + base64url. Access token 15 min, refresh 30 days.

### 2. Refresh token rotation с audit chain

Каждый refresh берёт новый opaque random, hash в D1, ставит `rotated_to = newId` и `revoked_at = now` на старый. Цепочка позволяет расследовать replay attacks.

### 3. PBKDF2 600k iterations

Не bcrypt (нет в Workers runtime). PBKDF2-SHA256 с per-user 16-byte salt. Хеш хранится как `pbkdf2$600000$<salt>$<hash>` — версионируем для будущей миграции на argon2id (когда runtime поддержит).

### 4. Anti-scraping без блокировки

Per ADR-0003: контакты дилера показаны напрямую. Beacon `/api/listings/:id/track-contact` записывает hashed IP в `contact_reveals` для анализа scraping patterns. IP-hash использует daily-rotating salt — privacy-by-design.

### 5. requireDealer возвращает Response | AuthContext

Pattern:
```ts
const auth = await requireDealer(request, env);
if (auth instanceof Response) return auth;
// auth.dealerId is now safe
```

Handlers могут early-return 401 без try/throw. Чище чем JWT middleware decorators.

### 6. Catalog SQL — single query с tier sort

Один `SELECT` возвращает boosted + organic, отсортированные по `tier ASC, boost_amount DESC, created_at DESC`. Featured slot — отдельным query (он живёт в другой таблице). Это даёт корректный sort без двух roundtrip к D1.

### 7. Edge cache на public GET endpoints

```ts
"cache-control": "public, s-maxage=60, stale-while-revalidate=300"
```

Catalog кешится 60s; cities/makes — 1h/24h. Mutations должны busts cache по тегу (Phase 2 — пока полагаемся на TTL).

### 8. Polymorphic media без FK

`media (entity_type, entity_id)` — application-layer ownership check на каждый upload. Stub-ы дают TODO как именно проверить: `auth.dealerId == dealer_id of entity_id row`.

### 9. _middleware.ts инжектит `geo` и `isBot`

Через `MiddlewareData` interface. Downstream handlers читают `context.data.geo as MiddlewareData['geo']`. Нет module augmentation (изменилось в @cloudflare/workers-types 4.x).

### 10. Bot detection не блокирует

UA-sniff проставляет `data.isBot = true`. Handlers решают сами — например, skip analytics writes для bots но всё равно отдают контент (bot нужен для индексации).

## Verification

| Check | Result |
|-------|--------|
| TypeScript strict (`tsc --noEmit`) на 26 файлах | **0 errors** |
| Runtime smoke (JWT, password, IP hash, rate-limit) | **25/25 PASS** |
| JWT round-trip | sign → verify → tampered rejected → wrong secret rejected |
| Password PBKDF2 | hash → verify correct → reject wrong → unique salts |
| IP daily-salt hash | deterministic same-day, differs across IPs |
| Rate-limit sliding window | 3-of-3 allowed → 4th rejected с retry-after |

## Используемые зависимости

```json
{
  "zod": "^3.23.8"
}
```

Никакого Stripe SDK, Resend SDK, Pino logger — всё через `fetch` к public APIs (когда дойдём до них). Зависимостей минимум для Workers cold-start.

## Что нужно сделать перед deploy

1. **wrangler.toml** — заполнить `database_id`, KV `id`, R2 bucket id из Cloudflare dashboard.
2. **Secrets** — `wrangler secret put JWT_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY DAILY_IP_HASH_SALT`.
3. **Migrations** — `wrangler d1 migrations apply japanauto --remote`.
4. **DNS** — point japanauto.ca → Pages project.
5. **Real Astro frontend** — Site Factory задача.

## Связанные концепции

- [[api-workers]]
- [[d1-schema]]
- [[validation-zod]]
- [[auth-jwt]]
- [[auto-geolocation]]
- [[anti-spam-policy]]
- [[adr-0003-direct-contact-display]]
- [[adr-0007-navigation-flow-and-monetization]]
- [[migrations/README]]
- [[lib/README]]
