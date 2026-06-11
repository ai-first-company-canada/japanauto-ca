---
title: "Model catalog page (`/used-cars/[make]/[model]/[city]/`)"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-02
trust_level_avg: 5.0
tags: [features, urls, ux, catalog, filters, monetization]
---

# Model catalog page (`/used-cars/[make]/[model]/[city]/`)

**Primary destination** для покупателя. Здесь происходит decision-making — пользователь сравнивает конкретные авто, фильтрует, выбирает. От качества этой страницы зависит конверсия в контакт с дилером.

Зафиксирована в [[adr-0007-navigation-flow-and-monetization]].

## URL pattern

`/used-cars/[make]/[model]/[city]/` — например, `/used-cars/toyota/corolla/calgary/`.

## Контент

### Header + breadcrumb

- Sticky navbar (logo + city + hamburger).
- Breadcrumb: `Home / Toyota / Corolla / Calgary`.

### H1 + context

H1: `Used Toyota Corolla in Calgary, AB`
Sub: `24 listings from 18 dealers · Updated today` (Body S muted).

### Filters bar (sticky на scroll)

Три группы фильтров, mobile bottom-sheet pattern:

**1. Year (multi-select checkboxes).**
Опции: последние 10 лет (на 2026: 2016, 2017, 2018, ..., 2026). Pre-checked по умолчанию все. Можно «Select all / Clear all».

**2. Mileage (multi-select checkboxes).**
Опции:
- `< 50,000 km`
- `< 100,000 km`
- `< 200,000 km`
- `Show all` (default)

**3. Sort by price (radio).**
Опции:
- `Newest first` (default)
- `Price: low to high`
- `Price: high to low`

Sort кнопка визуально выделена **тонким красным border** (`--color-accent`) — это самый используемый фильтр по практике Andrew. Acts as visual emphasis, not actual color fill.

**На mobile:** filters bar — pill chips с counts, tap → opens full-screen bottom sheet с checkboxes + sticky «Apply (N results)» button внизу.

**На desktop:** filters bar inline сверху, без modal.

### Catalog list — три уровня выдачи

**Уровень 1 — Featured slot (1 card, всегда первый).**

Реклама нового автомобиля от официального дилера Toyota в Calgary. Содержит:
- Фото нового авто (от dealer).
- Title: «New 2026 Toyota Corolla LE».
- MSRP: «from CA$24,900».
- Eyebrow: «NEW VEHICLE • SPONSORED» в `--color-accent` text on `--color-accent-soft` background plate.
- CTA: «Visit dealer website →».
- Disclosure (compliance): «Sponsored by [Dealer Name] — official Toyota dealer in Calgary».
- Может отсутствовать если контракт не подписан (graceful degradation).

**Уровень 2 — Boosted listings.**

Used Toyota Corolla, для которых дилер купил boost-plan. Sort внутри уровня — by boost paid amount (более платный — выше). Visual:
- Стандартная listing card с **тонким красным border** (1.5 px `--color-accent`).
- Caption prefix «BOOSTED» (Caption, `--color-accent`).
- Disclosure micro-copy в footer card: «Promoted listing».

**Уровень 3 — Organic listings.**

Все остальные used Corolla в Калгари. Sort:
- Default: `created_at DESC` (newest first).
- При user-sort by price — sort внутри organic group, featured + boosted остаются на топе.

### Listing card (single component, переиспользуется)

См. [[homepage-blocks]] section 4 — same composition:
- 4:3 photo top.
- Title: `2021 Toyota Corolla LE`.
- Spec: `58,400 km · CVT · AWD`.
- Price: `CA$24,900` (Display M, mono).
- Footer: `Listed today · Maple Auto Group`.
- Optional badges: `NEW TODAY` / `BOOSTED` / `↓ CA$1,500` (Reduced).

### Layout (2026-05-02 финал после reversal)

- **Featured slot:** full-width spanning both cols (visible "big block").
- **Boosted listings:** 2-col grid (вместе с organic), distinguished by:
  - 1.5 px `--color-accent` red border around card
  - "BOOSTED" caption above title (Caption, `--color-accent`, weight 500, uppercase)
  - "Promoted listing" caption в footer
- **Organic listings:** 2-col grid using standard listing card from homepage.
- Visual rhythm: featured stands out by being wider; rest in 2-col grid рядом друг с другом.

**Не использовать 1-col feed pattern** на этой странице. 1-col делает featured indistinguishable от organic — теряется visual hierarchy. См. [[adr-0007-navigation-flow-and-monetization]] и feedback memory `JapanAuto catalog 2-col grid`.

### Pagination

20 listings per page. Mobile: «Load more» button или infinite scroll (выбираем при имплементации). Desktop: classic pagination внизу.

### Below catalog

- **Cross-links** на other models бренда: «Or browse other Toyota models →» с popular models grid.
- **FAQ блок** про Toyota Corolla: e.g. «How reliable is a Toyota Corolla?», «What's the average mileage for a 2020 Corolla?». Schema.org FAQPage.
- **Footer** идентичный главной.

## Schema.org

- `WebPage` + `BreadcrumbList` + `ItemList` (Vehicles).
- Каждый listing → `Vehicle` + `Offer` + `AutoDealer`.
- FAQ → `FAQPage`.
- Featured slot → отдельный `Offer` с `category: "NewVehicle"` и `availability: InStock`.

## D1 query (Workers)

```sql
SELECT
  l.*,
  d.name AS dealer_name, d.slug AS dealer_slug,
  d.amvic_number,
  CASE
    WHEN l.featured_until > unixepoch() THEN 1
    WHEN l.boost_until > unixepoch() THEN 2
    ELSE 3
  END AS tier,
  CASE
    WHEN l.boost_until > unixepoch() THEN l.boost_paid_cents
    ELSE 0
  END AS boost_amount
FROM listings l
JOIN dealers d ON d.id = l.dealer_id
WHERE l.make_id = ?
  AND l.model_id = ?
  AND l.city = ?
  AND l.status = 'active'
  AND l.year >= ?  -- currentYear - 10
  AND (?::int IS NULL OR l.year IN (?))  -- year filter
  AND (?::int IS NULL OR l.mileage < ?)  -- mileage filter
ORDER BY tier ASC, boost_amount DESC, l.created_at DESC
LIMIT 20 OFFSET ?;
```

(Featured как отдельный Offer NOT в `listings` — отдельная table `featured_slots`.)

## Что НЕ на этой странице

- ❌ Models filter — пользователь уже выбрал модель.
- ❌ Brand selector — есть в hamburger menu или breadcrumb.
- ❌ Saved searches (post-MVP).

## MVP scope decisions для Site Factory implementation (post-Cloud-Design v2)

Cloud Design в v2 (2026-05-02) over-delivered за пределами брифа в 3 местах. **MVP-strip applies при Site Factory implementation:**

### Mileage filter — buckets only, NO custom range

**v2 design:** 4 radio buckets (`Any` / `<25k` / `25-50k` / `50-100k` / `Over 100k`) + Custom Min/Max km input fields.

**MVP implementation:** только radio buckets. Strip Min/Max input fields.

**Rationale:** bucket SQL — простой `mileage < ?`. Range query усложняет catalog endpoint (`mileage BETWEEN ? AND ?`) + добавляет input validation surface. Buckets cover 95% UX.

**Phase 2:** добавить custom range когда search analytics покажет что users hit edge cases (например, 80,000 km specifically).

### Sort options — 3 only

**v2 design:** 6 options (Newest first / Price low-high / Price high-low / Mileage asc / Mileage desc / Year newest-to-oldest / Distance from me).

**MVP implementation:** keep только 3 (Newest first, Price low-high, Price high-low). Strip 4 остальных.

**Rationale:** MVP > Идеал. 3 sort options shipped в Q3 > 6 застрявших в implementation. Mileage и year sort — добавляем в Phase 2 если data покажет demand.

### "Distance from me" sort — Phase 2

**v2 design:** включает "Distance from me" sort option.

**MVP implementation:** strip. Не показываем эту option в sort sheet.

**Rationale:** требует geolocation permission flow (browser API request) + Haversine SQL calculation. Adds friction; user может deny geo и UX rotten. Phase 2 после launch geo-data validation (валидно ли совпадение `cf.city` ↔ user expectation?).

## Связанные концепции

## Связанные концепции

- [[homepage-blocks]]
- [[models-grid-page]]
- [[url-architecture]]
- [[d1-schema]]
- [[validation-zod]]
- [[listing-lifecycle]]
- [[stripe-subscriptions]]
- [[aggregator-concept]]
- [[adr-0006-city-bound-primary-flow]]
- [[adr-0007-navigation-flow-and-monetization]]
