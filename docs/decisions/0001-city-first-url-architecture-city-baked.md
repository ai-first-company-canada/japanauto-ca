# 0001 — City-first URL architecture (city baked into every URL at SSG time)

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 74c87ac, 39cd43b

## Context

The original routing scheme placed the make/segment first and the city later (e.g. /used-cars/{make}/{city}/, /parts/{city}/), and relied on _middleware geo-detection (cf.city) to redirect users and to rewrite HTML per-request with data-geo* attributes. This produced per-request HTML mutation (uncacheable, CSP-hostile), duplicate-content ambiguity for crawlers, and a dependency on runtime geolocation for the canonical surface. The platform's core value is local + answer-engine (GEO) discoverability across Tier-1 Canadian cities, so the city dimension is the primary index axis.

## Decision

Refactor to a city-first URL space where the city slug is the leading path segment (/[city]/[make]/[model]/, city-scoped parts hubs) and is baked into every URL and rendered HTML at static-site-generation time. Old make-first/parts routes were removed and 301-redirected via public/_redirects. _middleware no longer geo-redirects or rewrites HTML; data-geo* attributes and HTML rewriting were removed entirely. The jc_city cookie (Secure) is demoted to a navbar hint only, never affecting canonical output. City resolution from cf.city + city_aliases survives in middleware only to populate a navbar suggestion.

## Consequences

Every page is fully static and cacheable with a stable canonical URL, removing per-request HTML mutation and its CSP friction. Crawlers and answer engines see one canonical city-scoped URL per page. Cost: the city set is fixed at build time (TIER_1_CITIES via getStaticPaths) so adding a city requires a rebuild/redeploy; legacy inbound links depend on the _redirects 301 map staying in sync.
