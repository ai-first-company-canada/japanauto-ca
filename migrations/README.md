---
title: "D1 migrations — japanauto.ca"
tags: [code, sql, d1, migrations, infrastructure]
related: ["[[d1-schema]]", "[[adr-0007-navigation-flow-and-monetization]]", "[[validation-zod]]"]
---

# D1 migrations

Версионированные SQL миграции для Cloudflare D1 (SQLite). Применяются через wrangler.

## Файлы

| # | Файл | Назначение |
|---|------|-----------|
| 0001 | `0001_initial_schema.sql` | Полная начальная схема: dealers, makes, models, cities, city_aliases, listings, featured_slots, boost_orders, parts, media, refresh_tokens, verification_tokens, contact_reveals + все индексы и CHECK constraints |
| 0002 | `0002_seed_static_data.sql` | Idempotent seed: 9 японских брендов, 6 Tier 1 + 6 planned CMA, ~80 city aliases (GTA, Greater Montreal, Greater Vancouver, Calgary CMA, Greater Edmonton, NCR) |

## Применение

```bash
# Локально (Miniflare, для dev):
wrangler d1 migrations apply japanauto --local

# Remote (production / staging):
wrangler d1 migrations apply japanauto --remote --env production
```

`wrangler.toml` должен содержать:

```toml
[[d1_databases]]
binding = "DB"
database_name = "japanauto"
database_id = "<id-from-cloudflare-dashboard>"
migrations_dir = "JapanAuto_vault/40-outputs/code-snippets/migrations"
```

(Пути финализируются при создании реального репозитория. На MVP миграции живут в Obsidian vault как single source of truth; копируются в репо при инициализации.)

## Покрытие ADR

| ADR | Что закрыто в миграции |
|-----|------------------------|
| 0001 stack selection | Raw SQL без ORM, integer cents, Unix timestamps |
| 0002 sitemap & buyer model | Без `/new-cars` таблиц на listings; featured_slots для new-vehicle promo |
| 0003 direct contact display | `contact_reveals` для аудита; `contact_count` на listings/parts |
| 0004 edge geolocation | `cities.status` + `city_aliases` для CMA маппинга |
| 0005 single domain | Без realm/tenant таблиц |
| 0006 city-bound primary flow | `cities.status='active'` для Tier 1 only |
| 0007 navigation + monetization | `featured_slots`, `boost_orders`, `boost_until/boost_paid_cents`, age-cap CHECK на `listings.year` |

## Ключевые design-решения

### Age cap (rolling)

`listings.year` имеет CHECK:
```sql
year BETWEEN
  CAST(strftime('%Y','now') AS INTEGER) - 10
  AND CAST(strftime('%Y','now') AS INTEGER) + 1
```

Сдвигается автоматически каждый календарный год — миграция при смене года не нужна. Application layer (zod) дублирует валидацию с тем же правилом.

### Featured vs Boost — разные таблицы

- **`featured_slots`** — долгосрочный контракт с **официальным дилером** на промо **нового** автомобиля в `(make × city)` или `(make × model × city)`. Один активный slot на ключ — bypass age cap (сюда попадают `model_year >= currentYear`).
- **`boost_orders` + `listings.boost_until/boost_paid_cents`** — разовые покупки visibility для конкретного **used listing** через Stripe. Sort within boost tier по `boost_paid_cents` desc.

### Polymorphic media

`media (entity_type, entity_id)` без FK на конкретные таблицы — application layer обеспечивает целостность. Альтернатива (отдельные таблицы listing_media/part_media) была отвергнута из-за usplit'а Cloudflare Images upload-pipeline.

### Auth: refresh token rotation

`refresh_tokens.rotated_to` self-FK позволяет audit chain «который токен заменил какой» — для расследования brutal/replay attacks.

## Что НЕ в этой миграции (отложено)

- Reviews / ratings (post-MVP)
- Saved searches (post-MVP)
- Chat / messaging tables (out of MVP per ADR-0003)
- Loan calculator / финансирование (out of MVP)
- Trade-in (out of MVP)
- Carfax/AutoCheck history (out of MVP)
- FTS5 virtual tables для search (Phase 2 — Typesense вместо)

## План следующих миграций

Ожидаемые до MVP launch:

- `0003_subscriptions_audit.sql` — (историческое имя) Stripe webhook history; фактическая таблица идемпотентности — `stripe_events` из `0024_stripe_billing.sql`
- `0004_email_log.sql` — отправленные Resend emails, для compliance + debug
- `0005_listing_revisions.sql` — soft-history изменений price/description (для GST audit, opt-in)

Эти миграции пишутся когда соответствующие Workers-эндпоинты будут готовы — не заранее.

## Связанные концепции

- [[d1-schema]]
- [[validation-zod]]
- [[listing-lifecycle]]
- [[anti-spam-policy]]
- [[stripe-subscriptions]]
- [[adr-0007-navigation-flow-and-monetization]]
