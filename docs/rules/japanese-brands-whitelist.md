---
title: "Japanese brands whitelist"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [canadian-context, brands, positioning]
---

# Japanese brands whitelist

Маркетплейс принимает только японские бренды. Это часть позиционирования и не пересматривается.

## Допустимые бренды (commercial weight order для brand grid)

**9 брендов** (поправлено Andrew 2026-05-02 — Suzuki и Daihatsu удалены, см. ниже):

1. Toyota
2. Honda
3. Nissan
4. Mazda
5. Subaru
6. Lexus (Toyota luxury)
7. Acura (Honda luxury)
8. Infiniti (Nissan luxury)
9. Mitsubishi

Этот порядок используется в brand grid на главной (3×3) — см. [[homepage-blocks]].

## Удалённые бренды и rationale

**Suzuki** — покинул канадский рынок осенью 2014. Used-inventory всё ещё существует, но снижается каждый год; модели старые (≥ 12 лет на 2026), большая часть на дороге — это маленькие седаны и SX4, которые продаются дёшево private-sellers, не через dealershops. Marketplace-ценность низкая.

**Daihatsu** — покинул канадский рынок ~1992 (полные 30+ лет назад). Used-inventory практически отсутствует в наших Tier 1 CMA. На скрине Cloud Design итерации Calgary показывал «2 LISTED» для Daihatsu — символическая цифра, не оправдывает занимаемое место в brand grid.

Решение Andrew 2026-05-02: убираем оба, не разводим UX-шум на бренды без жизненной inventory.

## Reverse triggers (если ситуация изменится)

- При обнаружении ≥ 50 active Suzuki-листингов в одном из Tier 1 CMA — пересмотреть.
- Если будущая Toyota/Daihatsu collaboration вернёт Daihatsu в Канаду — пересмотреть.
- Дилеры могут листать Suzuki / Daihatsu как «other / non-whitelisted Japanese» в Phase 2 (если решим открыть отдельный bucket); на MVP — отказ при попытке создать listing.

## Применение

- Справочник `makes` в D1 ([[d1-schema]]) содержит ровно эти 9 записей.
- zod-схемы валидации ([[validation-zod]]) используют enum из этого списка.
- При попытке создать листинг не-японского бренда — 422 с понятным сообщением.
- В brand grid на главной ([[homepage-blocks]]) используется этот же commercial weight order.

## Что отвечать на запросы про другие бренды

> «japanauto.ca — только японские бренды по позиционированию.»

Никаких компромиссов на BMW, Ford, Hyundai и т.д. Если пользователь настаивает — это отдельный продукт, не этот.

## Связанные концепции

- [[d1-schema]]
- [[validation-zod]]
- [[mvp-scope]]
- [[orchestrator-role]]
