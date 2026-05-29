# japanauto.ca — project brief

Canadian marketplace for used Japanese cars + parts. Astro SSG on Cloudflare Pages.
Working dir: `/Users/andreuziubanov/sites/japanauto`. Prod: https://japanauto.pages.dev (DNS cutover to japanauto.ca = Phase 6, pending).

## Stack

- **Astro 6.2.2** SSG, **TS 5.6.3**, **Tailwind 4.1.18** via `@tailwindcss/vite`
- **Cloudflare Pages** (static dist/) + **Pages Functions** (functions/ — `_middleware.ts`, `/api/*`, `/parts/listing/[slug]`, sitemaps)
- **D1** (binding `DB`, database `japanauto-prod`), **KV**, **R2** — see `wrangler.toml`
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name japanauto`
- Dev: `npm run dev` (port 4321). For Cowork preview use the `japanauto-dev` config in brandlifts launch.json (port 4322) — wraps `cd /Users/andreuziubanov/sites/japanauto && npm run dev`.

## URL architecture (city-first, as of 2026-05-19)

Each URL bakes in its own city. **Fully static for SEO/GEO**: every city/brand/model page renders 100% server-side with literal city name in HTML — no client-side fetches, no `data-geo*` attributes, no edge HTML rewriting. The cookie `jc_city` is only a navigation hint for the navbar pill on subsequent navigations.

**Used cars:**
- `/` — all-Canada home, static, no personalization. Brand cards → national brand pages.
- `/[city]/` — city hub (6 SSG pages: toronto/montreal/vancouver/calgary/edmonton/ottawa)
- `/[city]/[make]/` — brand+city (54 pages)
- `/[city]/[make]/[model]/` — model+city (~486 pages)
- `/used-cars/` — national listings hub (sample feed)
- `/used-cars/[make]/` — national brand page (city directory)
- `/used-cars/[make]/[model]/` — national model page
- `/used-cars/listing/[slug]/` — individual listing (Pages Function, D1-backed)

**Parts:**
- `/parts/` — national parts hub
- `/parts/[make]/` — national brand parts
- `/parts/[make]/[model]/` — national model parts
- `/[city]/parts/` — city parts hub (6 pages)
- `/[city]/parts/[make]/` — brand+city parts (54 pages)
- `/[city]/parts/[make]/[model]/` — model+city parts (~486 pages)
- `/parts/listing/[slug]/` — individual donor car (Pages Function, D1-backed)

**Other:** `/brands/`, `/brands/[make]/`, `/blog/`, `/blog/[category]/`, `/blog/[slug]/`, `/glossary/`, `/glossary/[term]/`, `/dealers/`, `/dealer/...` (auth-gated), `/editorial-policy/`, `/editorial-team/`, `/404.astro`.

**Old URLs** (`/used-cars/{make}/{city}/`, `/used-cars/{make}/{model}/{city}/`, `/parts/{city}/`, `/parts/{make}/{city}/`, `/parts/{make}/{model}/{city}/`) — all 301 to new pattern via `public/_redirects` (30 rules). Never re-introduce them.

Total: 902 SSG pages + Pages Function endpoints.

## City + cookie flow

- 6 Tier-1 cities (`TIER_1_CITIES` in `src/data/brand-content.ts`): Toronto/Montreal/Vancouver/Calgary/Edmonton/Ottawa.
- City picker dialog (`src/components/sections/CityPickerDialog.astro`) calls `window.setCityCookie(slug, province)` which sets `jc_city` + `jc_province` cookies and `window.location.assign('/' + slug + '/')` — defined in `src/layouts/BaseLayout.astro:106`.
- Navbar pill: each page passes `cityShort` prop to `<Navbar>` (e.g. "Calgary, AB"). Home and national pages pass nothing → default "Canada".
- Middleware (`functions/_middleware.ts`) responsibilities: resolves city from `cf.city` into `md.geo` (for downstream Pages Functions only — no geo-redirect, no HTML rewriting), adds security headers, handles CORS preflight, gates `/dealer/*` with JWT.

## Layout system (Phase 1 polish, 2026-05-19)

- `.section` / `.section-tight` — section padding: `40px 16px → 56px 24px → 72px 40px`.
- `.gutter` — horizontal-only padding, same ramp (16→24→40). Use when section needs custom vertical padding but uniform horizontal alignment.
- Content column caps at 1200px at ≥1280px viewport via `body main { max-width: 1280px }` + `.gutter`'s 40px → 1200px content.
- Tinted bands inside main (`.band-subtle`, `.band-ink`) are clipped to 1200px width at ≥1280px so the background visually aligns with section headings instead of overhanging.

## Conventions / gotchas

- **`curl -sI` lies for Pages Functions** — they return 405 on HEAD even when GET is 200. Smoke-test with GET (`curl -s -o /dev/null -w "%{http_code}\n"`).
- **zsh word-splitting**: `for x in $VAR` doesn't split; use `while IFS= read -r`. Also `(toronto|montreal|...)` in shell args needs single quotes — `|` is a pipe.
- **Brand counts on `/`** are computed as `baseCount × CITY_FACTOR_SUM` where `CITY_FACTOR_SUM = Σ(city.count / 1284)` ≈ 3.585 across the 6 Tier-1 cities. Don't hardcode national numbers.
- **`BrandCard` / `PartsEntryPoint`**: if `citySlug` is undefined → national URL (`/used-cars/{slug}/`, `/parts/`). If passed → city-bound URL.
- **`PopularModels`**: pass `cityName={cityInfo.name}` so heading reads "...near Calgary" instead of default "...near Canada"; pass `href` per model to override the default `/{citySlug}/{make}/{model}/` fallback (used on home for national links).
- **No `data-geo*` attributes anywhere** — removed 2026-05-19 along with the `/api/listings` runtime fetch on model-city pages. City must be baked in at SSG time via component props; if you need dynamic content, that's a separate architectural decision. SEO/GEO crawlers must see the same HTML the user sees.
- **Schema.org**: every brand/model/city page has `BreadcrumbList` + `ItemList` + `Place` + `FAQPage` JSON-LD. When moving URLs, update all 3-4 JSON-LD blocks AND the canonical AND the breadcrumb component AND any internal links.
- **Sitemap**: `/sitemap.xml` is the index pointing to `/sitemap-static.xml` (build-time, 887 URLs) + `/sitemap-listings.xml` + `/sitemap-donors.xml` (Pages Functions, D1-backed, 1h edge cache).
- **IndexNow** key file at `/e3d465c40a7250b500ed3d3358a86ee5.txt`; auto-pings on listing/donor CRUD. After DNS cutover, change `host` field in batch-ping payloads from `japanauto.pages.dev` to `japanauto.ca`.

## Open work

1. **Phase 6 — DNS cutover to japanauto.ca.** Before flipping: verify Cloudflare AI Crawl Control is OFF for the new zone (analogous concern as on brandlifts). After flip: change IndexNow `host` field.
2. **D1 listings** still empty in prod; stub data is what users see until first dealer signs up. `sitemap-listings.xml` / `sitemap-donors.xml` return empty `<urlset>` and that's correct.
3. **Phase 6 production pieces**: Stripe live keys, Resend (transactional email), custom domain.

## Notable files

- Routes: `src/pages/[city]/`, `src/pages/used-cars/[make]/`, `src/pages/parts/[make]/`
- Middleware: `functions/_middleware.ts`
- Redirects: `public/_redirects` (30 rules — don't lose this on rebuild)
- Sitemap generator: `src/pages/sitemap-static.xml.ts`
- City picker JS: `src/layouts/BaseLayout.astro:106`
- City data: `src/data/brand-content.ts` (`TIER_1_CITIES`, `BRAND_CONTENT`)
- Model data: `src/data/models-stubs.ts` (`MODELS_BY_BRAND`, `getModelsForCity`)
- Layout utilities: `src/styles/global.css` (`.section`, `.gutter`, `.band-subtle`)
