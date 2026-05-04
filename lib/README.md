---
title: "lib/schema.ts — единый контракт"
tags: [code, typescript, zod, validation, contract]
related: ["[[d1-schema]]", "[[validation-zod]]", "[[migrations/README]]", "[[adr-0007-navigation-flow-and-monetization]]"]
---

# lib/schema.ts — единый контракт

Единый TypeScript-модуль с zod-схемами и инферированными типами. Шарится между Workers (runtime валидация на API) и Astro компонентами (типы для props и форм). Зеркалит D1 миграцию `0001_initial_schema.sql`.

## Файл

`lib/schema.ts` — single-file, 600+ строк. Структура:

1. **Constants** — enum-значения как `as const` массивы (PROVINCES, BRAND_SLUGS, LISTING_STATUSES, BODY_TYPES, FUEL_TYPES, …) + `LIMITS` объект (TITLE_MAX, PRICE_MAX_CENTS, USED_CAR_AGE_CAP_YEARS, …).
2. **Helpers** — `currentYear()`, `listingYearWindow()`, `unixNow()`, `isValidVinChecksum()`, `normalizePostalCode()`, `normalizePhone()`.
3. **Primitive schemas** — `provinceSchema`, `postalCodeSchema`, `phoneSchema`, `vinSchema`, `slugSchema`, `emailSchema`, `listingYearSchema`, `partYearSchema`, `priceSchema`, `mileageSchema`, `idSchema`, `timestampSchema`.
4. **Domain enum schemas** — `dealerTypeSchema`, `subscriptionTierSchema`, `listingStatusSchema`, `listingConditionSchema`, `bodyTypeSchema`, `fuelTypeSchema`, `transmissionSchema`, `drivetrainSchema`, `partCategorySchema`, `partConditionSchema`, …
5. **Table schemas** — для каждой D1 таблицы пара `*CreateInputSchema` + полная `*Schema` (read-side row). Где применимо — `*UpdateInputSchema` (partial). Public-safe view (`dealerPublicSchema` без `password_hash` / `stripe_customer_id`).
6. **Cross-field refinements** — `amvicRefiner` для AB dealers, `active_until > active_from` для featured slots.
7. **Auth payloads** — `loginInputSchema`, `refreshTokenInputSchema`, `passwordResetRequest/Confirm`, `emailVerifyInput`.
8. **API envelopes** — `apiErrorSchema`, `Paginated<T>`, `CatalogResponse`, `ListingCard`, `FeaturedListing`.
9. **Error helper** — `zodErrorToApiError(err)` → `{ error, message, issues: { field: [messages] } }`.

## Ключевые design-решения

### 1. VIN ISO 3779 checksum в валидаторе

Не просто длина 17 — реальный checksum алгоритм с translit-таблицей и weights `[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]`. Проверка позиции 9 vs computed remainder mod 11 (X = 10).

```ts
const r = vinSchema.safeParse("JT2BG28K9W0123456");  // → fail (invalid checksum)
const ok = vinSchema.safeParse("1HGBH41JXMN109186"); // → pass
```

Это блокирует random-typed VINы и большинство OCR-ошибок при extract'е VIN с фото.

### 2. listingYearSchema — rolling window через `superRefine`

```ts
const listingYearSchema = z.number().int().superRefine((y, ctx) => {
  const { min, max } = listingYearWindow(); // currentYear ± window
  if (y < min || y > max) ctx.addIssue({ ... });
});
```

Зеркалит D1 trigger `trg_listings_age_cap_insert/update`. Окно сдвигается с системными часами — миграция при смене года не нужна. App-layer даёт friendly 422; trigger — последняя линия защиты.

### 3. AMVIC cross-field rule через `superRefine`

```ts
if (data.type === "dealer" && data.province === "AB" && !data.amvic_number) {
  ctx.addIssue({ path: ["amvic_number"], message: "AMVIC mandatory in AB" });
}
```

Применяется и к `dealerCreateInputSchema`, и к `dealerUpdateInputSchema` (только когда оба поля присутствуют в partial update).

### 4. Postal regex с явным black-list запрещённых букв

Не просто `^[A-Z]\d[A-Z]...$` — учтены запрещённые буквы Canada Post:
- Pos 1: D, F, I, O, Q, U, W, Z forbidden → `[ABCEGHJ-NPRSTVXY]`
- Pos 3, 5: I, O, U forbidden → `[A-CEGHJ-NPRSTV-Z]`

Это отбрасывает обманчиво-валидные паттерны `D1A 1A1`, `T2W 0A1` etc., которые проходят простую regex.

### 5. Phone — E.164 NANP only с anti-fiction filter

```ts
const E164_NANP_RE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;  // area code [2-9], exchange [2-9]
```

Плюс reject `+1555` prefix (reserved for fiction). `normalizePhone()` принимает форматы `(403) 555-1234`, `4035551234`, `+14035551234`.

### 6. Polymorphic media — schema с union entity_type

```ts
mediaEntityTypeSchema = z.enum(["listing", "part", "dealer", "featured_slot"]);
```

Application layer (Workers) проверяет ownership через `entity_type` + `entity_id` lookup. Schema lib не enforce-ит FK (D1 тоже не enforce-ит — polymorphic by design).

### 7. Public-safe views через `.omit()`

```ts
const dealerPublicSchema = dealerSchema.omit({
  password_hash: true,
  stripe_customer_id: true,
  daily_listing_count: true,
  daily_listing_reset_at: true,
});
```

Workers возвращают `DealerPublic` для GET-эндпоинтов. Никогда не сериализуют raw `Dealer`.

## Использование

### В Workers handler

```ts
import { listingCreateInputSchema, zodErrorToApiError } from "../lib/schema";

export async function onCreateListing(req: Request, env: Env): Promise<Response> {
  const body = await req.json();
  const parsed = listingCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(zodErrorToApiError(parsed.error), { status: 422 });
  }
  // parsed.data is fully typed ListingCreateInput
  await env.DB.prepare(`INSERT INTO listings (...) VALUES (?, ?, ...)`)
    .bind(parsed.data.make_id, parsed.data.model_id, ...)
    .run();
  return Response.json({ ok: true }, { status: 201 });
}
```

### В Astro form (build-time типы + runtime check на submit)

```astro
---
import type { ListingCreateInput } from "../lib/schema";
import { listingCreateInputSchema } from "../lib/schema";
---
<form method="POST" action="/api/listings">
  ...
</form>
<script>
  import { listingCreateInputSchema, zodErrorToApiError } from "../lib/schema";
  // client-side pre-validation before fetch
</script>
```

### Делать инвариант в callsite

```ts
import { z } from "zod";
import { listingSchema } from "../lib/schema";

const rows = await env.DB.prepare(`SELECT * FROM listings WHERE ...`).all();
const listings = z.array(listingSchema).parse(rows.results);
//        ^? Listing[] (fully typed, validated)
```

Это даёт runtime-страховку, что D1 row совпадает с TS-типом — критично если кто-то забудет обновить `lib/schema.ts` после новой миграции.

## Verification

Smoke-тест в sandbox: `tsc --noEmit` strict mode = **0 errors**, runtime = **63/63 PASS** на корнер-кейсах:

- VIN: real Honda passes, fake JDM checksum fails, I/O/Q rejected
- Postal: T2P 0A1 / t2p0a1 / T2P-0A1 normalized; D2P (forbidden D) rejected
- Phone: 3 input formats → +14035551234; +44 rejected
- Year window 2016-2027 (на 2026): edges PASS, 2010 / 2028 FAIL
- Slug: kebab-case OK, UPPERCASE / trailing dash / double dash / space rejected
- Brand: toyota / lexus pass, ford / suzuki / daihatsu rejected
- AMVIC: AB dealer без AMVIC fail; BC dealer без AMVIC pass; AB salvage_yard без AMVIC pass
- Listing edges: year < cap, VIN short, price > 1M CAD, province ZZ — все 422
- Featured slot: active_until ≤ active_from — 422
- Boost order: duration > 90 days — 422
- Error envelope содержит правильные `issues.{field}` массивы

## Что НЕ в этом файле

- **JWT signing/verifying** — отдельный модуль `lib/auth.ts` (использует `WebCrypto` в Workers).
- **D1 query helpers** — отдельный `lib/db.ts` (типизированные запросы к таблицам через `Listing[] = ...`).
- **Stripe client/webhook handlers** — `lib/stripe.ts`.
- **Slug generation** — `lib/slug.ts` (использует `slugSchema` для финального CHECK).
- **R2 upload helpers** — `lib/media.ts`.

## Связанные концепции

- [[d1-schema]]
- [[validation-zod]]
- [[migrations/README]]
- [[postal-phone-format]]
- [[vin-validation]]
- [[slug-format]]
- [[japanese-brands-whitelist]]
- [[adr-0007-navigation-flow-and-monetization]]
