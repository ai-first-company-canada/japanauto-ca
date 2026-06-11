---
title: "Postal code & phone format (Canada)"
confidence: high
sources_count: 1
verified: true
last_verified: 2026-05-01
trust_level_avg: 5.0
tags: [canadian-context, validation, format]
---

# Postal code & phone format (Canada)

Каноничные форматы для канадских данных. Определяют, как валидируем и как отображаем.

## Postal code

- Формат: `A1A 1A1` (буква, цифра, буква, пробел, цифра, буква, цифра).
- Regex: `^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$`.
- Normalization: uppercase + один пробел в середине.
- Запрещённые буквы (никогда не используются в Canada Post): D, F, I, O, Q, U в первой позиции; W, Z в первой позиции; I, O, U в любой буквенной позиции.

## Phone

- Хранение: **E.164** (`+14035551234`).
- Display: `(403) 555-1234` или `+1 403 555 1234` (выбор Site Factory).
- Только North American Numbering Plan (NANP): country code +1.
- Запрещаем 555-XXXX как тестовые в production.

## Province

ISO codes (12): `AB`, `BC`, `ON`, `QC`, `MB`, `SK`, `NS`, `NB`, `NL`, `PE`, `YT`, `NT`, `NU`.

## Country

Только `CA`. Если дилер не в Канаде — отказ при регистрации.

## Currency

Только `CAD`. Никогда не `USD` без явного префикса. UI-формат — `CA$1,234.56` (не `$1,234.56`).

## Связанные концепции

- [[validation-zod]]
- [[d1-schema]]
- [[gst-hst]]
- [[amvic-alberta]]
