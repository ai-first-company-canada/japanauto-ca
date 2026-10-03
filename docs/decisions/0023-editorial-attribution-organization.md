# 0023 — Editorial content is credited to the organization, not personas

- **Status:** accepted, implemented (owner decision 2026-10-03)
- **Date:** 2026-10-03
- **Context:** SEO/GEO audit 2026-10-03 (B2). Articles carried two house
  pseudonyms (Marc Tremblay, Sarah Chen) with invented bios, emitted as schema
  `Person`, and YMYL pages claimed review by an "AMVIC-/OMVIC-licensed advisor"
  that does not exist (regulators license dealers and salespeople, not
  advisors). `/editorial-policy/` promised a named reviewer in every byline.

## Decision

1. Every blog, brand and glossary entry has `author: japanauto-editorial`;
   `authorBio()` resolves only that key ("japanauto.ca Editorial"). BlogPosting
   `author` is `{ "@id": "https://japanauto.ca/#organization" }`.
2. No `reviewer_role` frontmatter, no visible "Reviewed by", no `reviewedBy`
   in JSON-LD. A reviewer is added back only for a real, named person with a
   checkable credential (registry link), as `Person` + `sameAs` on the page.
3. `/editorial-team/` and `/editorial-policy/` describe the actual process:
   facts checked against the primary sources listed on each page; "Last
   reviewed" = date facts were rechecked; corrections by email; paid placements
   labelled and kept out of articles.
4. AI assistance is **not** disclosed on the policy page (owner decision
   2026-10-03); the page makes no claim either way about how drafts are written.
5. First-person anecdotes that can't be verified are written as hypothetical
   examples.

## Rejected
- **Keep the personas** — unverifiable experts on YMYL topics hurt trust
  signals and are a misrepresentation risk for a commercial site.
- **Owner as named author** — possible later; needs a real bio and profile.
