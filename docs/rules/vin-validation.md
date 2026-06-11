---
title: "VIN validation (ISO 3779)"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [canadian-context, vin, validation]
---

# VIN validation (ISO 3779)

VIN — Vehicle Identification Number, стандарт ISO 3779. На североамериканских авто всегда 17 символов.

## Правила

- Длина ровно **17** символов.
- Алфавит — `[A-HJ-NPR-Z0-9]` (исключены I, O, Q — конфликт с 1, 0).
- Позиция 9 — check digit (вычисляется по weights).
- Позиции 1–3 — World Manufacturer Identifier (WMI). Для Toyota это обычно `JT`/`4T`, для Honda — `1H`/`JH`, и т.д. Проверяется опциональный whitelist префиксов под японские бренды.
- Позиция 10 — model year code (1980 → A, …, 2026 → R, …).

## Реализация в zod

```ts
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

const vinSchema = z.string()
  .transform(s => s.toUpperCase())
  .refine(v => VIN_RE.test(v), { message: "VIN must be 17 chars, no I/O/Q" })
  .refine(v => isValidVinChecksum(v), { message: "VIN checksum invalid" });
```

Функция `isValidVinChecksum` — стандартный алгоритм с weights `[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]` и transliteration таблицей.

## Использование

- Поле `listings.vin` — `UNIQUE`. См. [[d1-schema]].
- Отображается на странице листинга в Schema.org `vehicleIdentificationNumber`.
- Дисклеймер на форме: «VIN can be found on dashboard near windshield or driver side door jamb».

## Связанные концепции

- [[validation-zod]]
- [[d1-schema]]
- [[listing-lifecycle]]
- [[schema-org-map]]
- [[anti-spam-policy]]
