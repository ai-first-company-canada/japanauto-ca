---
title: "Slug format для листингов"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [architecture, seo, slug, urls]
---

# Slug format для листингов

Slug — стабильный SEO-friendly идентификатор листинга в URL.

## Шаблон

```
{year}-{make}-{model}-{trim}-{city}-{6char_id}
```

Пример: `2021-toyota-camry-le-calgary-x7k2nm`.

## Правила генерации

- Все компоненты — lowercase ASCII, kebab-case, диакритика транслитерируется.
- `make`, `model`, `city` берутся из справочников D1 (нормализованные slug-формы).
- `trim` опционален; при отсутствии — пропускается без двойного дефиса (`-`).
- `6char_id` — base36 случайный, генерируется при создании листинга, проверяется на уникальность через `UNIQUE INDEX idx_listings_slug`.
- Длина итогового slug — не более 75 символов (canonical SEO best practice).

## Изменение

При апдейтах listing (трим, год — теоретически не меняется; город — может) **не пересоздаём slug**. Slug фиксируется при первой публикации. Исключение — явный «republish», тогда старый slug идёт в таблицу `listing_redirects` с 301.

## Уникальность

- `UNIQUE` на `listings.slug` в D1.
- Конфликт при генерации (теоретически 1/2.1B) → перегенерация ID до уникальности.

## Запчасти

Парты используют похожий шаблон: `{condition}-{make}-{category}-{title-fragment}-{6char_id}`. Конкретика — в [[parts-compatibility]] / отдельной заметке при необходимости.

## Связанные концепции

- [[url-architecture]]
- [[d1-schema]]
- [[listing-lifecycle]]
