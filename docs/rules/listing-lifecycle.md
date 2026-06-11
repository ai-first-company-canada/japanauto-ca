---
title: "Listing lifecycle"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [features, listings, lifecycle]
---

# Listing lifecycle

`listings.status` ∈ `{draft, active, sold, expired, flagged}`.

## Переходы

```
draft  ──publish──►  active  ──sold/sell──►  sold     (30 дней индексируется → удаление)
                       │  ▲
                       │  └─renew─┐
                       │          │
                       └──expire──┴──► expired (90 дней без активности)
                       │
                       └──moderation──► flagged → manual review → active или удаление
```

## Правила

- **Draft** — не виден публике, не индексируется. Дилер может сохранять как черновик.
- **Active** — публикация, sitemap, индексация.
- **Sold** — статус виден публике 30 дней (для SEO, чтобы Google не получил 404), `availability: SoldOut`. После 30 дней — удаление из sitemap, 410 Gone.
- **Expired** — auto-expire через 90 дней. Email дилеру за 7 дней с CTA renew.
- **Flagged** — анти-спам / модерация. Скрыт публике до решения.

## Email-нотификации

- За 7 дней до expire — reminder.
- При sold (через UI дилера) — confirmation + sitemap триггер.
- При flagged — уведомление дилеру с причиной.

Реализация — Resend через cron-Worker (раз в сутки сканирует `expires_at`).

## Дубликаты

`UNIQUE` на `listings.vin`. Один VIN = один активный listing. При попытке дубликата — 409 с указанием существующего listing.

## Age cap для used cars (новое 2026-05-02)

`year >= currentYear - 10` — используются только модели младше 10 лет ([[adr-0007-navigation-flow-and-monetization]]). На 2026 — модели от 2016 и младше. При попытке создать listing старше — 422.

Применяется только к `listings` где `type='used'`. Parts ([[parts-compatibility]]) не имеют age cap — owners старых моделей могут нуждаться в запчастях, и aftermarket parts могут быть новыми.

## Featured / Boost flags

Поля в `listings`:
- `featured_until INTEGER` — для featured slot (top of model catalog), Unix timestamp.
- `boost_until INTEGER` — для boost-plan, Unix timestamp.
- `boost_paid_cents INTEGER` — сумма paid за boost (для sort).

Отдельная таблица `featured_slots` для долгосрочных контрактов с official dealers (CMA × make). См. [[adr-0007-navigation-flow-and-monetization]].

## Связанные концепции

- [[d1-schema]]
- [[anti-spam-policy]]
- [[vin-validation]]
- [[sitemaps]]
- [[mvp-scope]]
