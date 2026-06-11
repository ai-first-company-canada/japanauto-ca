---
title: "Validation через zod"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [architecture, validation, typescript]
---

# Validation через zod

Все user input на Workers API проходят через zod-схемы перед записью в D1 или дальнейшей логикой. Это unified contract: одна схема — TypeScript тип + runtime валидация + (через `zod-to-json-schema`) ответ для OpenAPI/документации в будущем.

## Что валидируется

- **Phone** — E.164 (`+14035551234`), регекс, плюс длина по стране CA.
- **Postal code** — `^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$`, normalized к `A1A 1A1`. См. [[postal-phone-format]].
- **Province** — enum из ISO codes: AB, BC, ON, QC, MB, SK, NS, NB, NL, PE, YT, NT, NU.
- **VIN** — 17 символов, без I/O/Q, ISO 3779 checksum. См. [[vin-validation]].
- **Year** — int. Для **used cars listings**: `[currentYear - 10, currentYear + 1]` (на 2026: 2016-2027). Для parts compatibility — full range без cap. См. [[adr-0007-navigation-flow-and-monetization]] и [[listing-lifecycle]].
- **Mileage** — int ≥ 0, ≤ 1_000_000 km.
- **Price** — int ≥ 0 (центы CAD), верхняя граница 1_000_000_00 (1M CAD).
- **Make** — enum из [[japanese-brands-whitelist]].
- **Email** — стандартная zod проверка + lowercase normalization.
- **Strings** — trim, max length для каждого поля (title 120, description 5000, etc.).

## Расположение

`lib/schema.ts` — единый файл с zod схемами и инферированными TypeScript типами:

```ts
export const ListingCreateInput = z.object({...});
export type ListingCreateInput = z.infer<typeof ListingCreateInput>;
```

Этот файл шарится между Workers и Astro компонентами (для форм через типы; runtime-валидация на сервере).

## Ошибки

zod ошибки конвертируются в `{ field, message }[]` для UI:

```ts
return new Response(JSON.stringify({
  error: "validation_failed",
  issues: result.error.flatten().fieldErrors,
}), { status: 422 });
```

## Связанные концепции

- [[d1-schema]]
- [[api-workers]]
- [[vin-validation]]
- [[postal-phone-format]]
- [[japanese-brands-whitelist]]
