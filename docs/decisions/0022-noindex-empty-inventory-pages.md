# 0022 — Inventory pages are indexable only with real content

- **Status:** accepted, implemented
- **Date:** 2026-10-03
- **Context:** SEO/GEO audit 2026-10-03 (`docs/audits/2026-10-03-seo-geo.md`, B1).
  841 of 910 indexable pages were city × make × model / parts templates showing
  an empty "dealers onboarding" state; same-model pages across cities scored
  0.79–0.86 shingle similarity, `/used-cars/{make}/{model}/` was one text ×50.
  Attaching japanauto.ca opens indexing immediately, so that would have been the
  new domain's quality baseline (soft-404 / doorway pattern).

## Decision

1. **One rule, one place:** `src/lib/indexability.ts` `isIndexable(pathname)`.
   `BaseLayout.astro` derives `<meta name="robots" content="noindex, follow">`
   from it and `sitemap-static.xml.ts` filters through it, so the robots meta
   and the sitemap cannot disagree. Templates do not set robots themselves.
2. **Inventory templates** (`/{city}/{make}/`, `/{city}/{make}/{model}/`,
   `/used-cars/{make}/`, `/used-cars/{make}/{model}/`) are indexable when they
   show ≥ `MIN_INDEXABLE_LISTINGS` (1) live listings **or**, for city pages, a
   public price table (ADR 0021). Pages flip on the next build — no code change.
3. **Parts templates** below `/parts/` stay noindex until donor cars are
   exported to SSG (templates hard-code zero donors today).
4. **Empty blog categories** are noindex.
5. `noindex, follow` (not `nofollow`): crawlers still pass through to the
   indexable pages these link to.
6. `scripts/seo-audit.py` fails on any indexable page that renders an empty
   inventory state without a price table, and on sitemap or llms.txt URLs that
   aren't indexable.

## Rejected
- **Keep everything indexable and add filler copy** — city-swapped text is the
  doorway pattern itself; more of it doesn't fix it.
- **Remove the pages** — they are the navigation skeleton and become valuable
  as soon as inventory exists; noindex is reversible per page, deletion isn't.
- **Per-template robots props** — drifted from the sitemap within one audit.
