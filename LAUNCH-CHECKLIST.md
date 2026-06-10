# Launch checklist — japanauto.ca

Сайт сейчас — стейдж на `japanauto.pages.dev` с демо-данными, закрытый от
краулинга (`robots.txt: Disallow: /`). Этот файл — список того, что ДОЛЖНО
произойти перед подключением продового домена и открытием индексации.
Пункты с 🤖 проверяются автоматически: **`npm run audit:launch` обязан быть
зелёным перед запуском** — он падает, пока в билде остаётся сфабрикованный
контент или закрытый robots.txt.

## 1. Данные — заменить демо на реальное

- [ ] 🤖 `getCatalogForModelCity()` (src/data/catalog-stubs.ts) подключён к
      реальным D1-листингам; `isDemo` снят. Пока он `true`, страницы несут
      маркер `data-demo-content`, и `audit:launch` блокирует запуск.
      Vehicle/Offer JSON-LD и баннер «Sample preview» оживут сами — они
      гейтятся на `!isDemo` (аудит-находка №6).
- [ ] Demo-дилеры из SSG (`/dealers/` индекс: cypress-imports и др.) заменены
      реальными или скрыты — сейчас все 13 ведут на 404.
- [ ] Тестовые аккаунты вычищены из прод-D1 (`diag-*`, `e2e-test-*`,
      `hgasfgasfgasfg`, `svavdas`, `wgedrgweg`, `phase2c1-test-*`).
- [ ] Meta descriptions каталог-страниц не утверждают выдуманные количества
      листингов («N used listings» из генератора).
- [ ] Thin/near-duplicate шаблонный контент по city-variant страницам
      пересмотрен (аудит-находка №32): страницы без реального инвентаря —
      noindex или обогащены.

## 2. Домен и индексация

⚠️ **Подключение домена = немедленное открытие индексации.** Статический
`public/robots.txt` уже продовый (Allow всем + AI-краулеры); блокирующий
`Disallow: /` на стейдже подставляет middleware только для `*.pages.dev`
(functions/_middleware.ts). Ручного «открытия» robots не существует — поэтому
ВЕСЬ раздел 1 (данные) обязан быть закрыт ДО привязки japanauto.ca.

- [ ] Раздел 1 закрыт, `npm run audit:launch` зелёный — ТОЛЬКО ПОТОМ домен.
- [ ] Custom domain `japanauto.ca` подключён к Pages-проекту (сейчас отдаёт
      525 — DNS в Cloudflare есть, привязки нет), SSL зелёный.
- [ ] 🤖 Sanity: `dist/robots.txt` открыт (гейт упадёт, если кто-то заменит
      его на блокирующий) и `sitemap.xml` присутствует в dist.
- [ ] `japanauto.pages.dev` после запуска не плодит дубли: middleware уже
      блокирует его robots + canonical везде на japanauto.ca (уже так);
      опционально — 301 redirect pages.dev → japanauto.ca.
- [ ] Search Console: домен подтверждён, sitemap отправлен.

## 3. SEO-хвосты из аудита (исправить до запуска)

- [ ] №30 — Organization-логотип в page-shell.ts указывает на несуществующий
      `/logo.png` (есть только logo.svg).
- [ ] №31 — Breadcrumb listing-detail ссылается на legacy-URL c 301.
- [ ] №19 — CI deploy.yml не гоняет `audit:seo` (локальный `npm run deploy`
      гоняет; CI-путь должен тоже + `audit:launch` после запуска).

## 3b. Data retention (PII-минимизация)

- [ ] Настроить периодическую чистку (Cloudflare Cron Trigger / Worker — Pages
      Functions крон не умеют): истёкшие/отозванные `refresh_tokens`,
      использованные/просроченные `verification_tokens`, старые `contact_reveals`.
      Пример: `DELETE FROM refresh_tokens WHERE expires_at < unixepoch()-2592000`.
      Свежие строки уже хранят хеш IP, не сырой (аудит №20), но retention всё
      равно нужен. До крона можно чистить вручную перед запуском.

## 4. Секреты и конфигурация прода

- [ ] `JWT_SECRET` задан в Pages-проекте и **длиной ≥ 32 символов** — короче
      теперь fail-closed (аудит-находка №12 исправлена): `verifyAccessToken`
      денаит все токены (401), `signAccessToken` падает (500), логина нет. Это
      ловит мисконфиг, но значит: задеплоить прод без валидного секрета = полная
      неработоспособность auth (а не тихий обход).
- [ ] `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_IMAGES_API_TOKEN` заданы.
- [ ] `DAILY_IP_HASH_SALT` задан (не дефолт/пустой).
- [ ] Stripe: боевые ключи + webhook на прод-URL (когда платежи включаются).

## 5. Финальная проверка

- [ ] 🤖 `npm run audit:launch` — зелёный.
- [ ] `npm run deploy` — predeploy-гейты зелёные.
- [ ] Smoke: главная 200; листинг из D1 открывается; `/dealers/<real>/` 200;
      логин-лимитер отвечает 429 после 5 попыток.
- [ ] Rich Results Test на одной city-model странице: только честная разметка
      (Breadcrumb/Place/FAQ — или Vehicle/Offer, если инвентарь уже реальный).
