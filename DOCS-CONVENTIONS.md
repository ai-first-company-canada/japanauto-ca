# Documentation conventions — JapanAuto

How documentation is written and maintained in this repository. The goal is that
the codebase stays **self-explaining and due-diligence-ready at all times** — a
new engineer (or a buyer's technical reviewer) can understand what exists, why it
was built that way, and how to operate it, without access to the original authors.

These conventions are themselves part of the contract: a change that adds or
alters behaviour is not "done" until its docs are updated in the same change.

---

## 1. Where documentation lives

| Kind | Location | Format |
|---|---|---|
| Project entry point | `README.md` | What the project is, quickstart, links into `docs/` |
| Agent/build operating rules | `CLAUDE.md` | Hard rules + gotchas for anyone (human or agent) working the repo |
| Architecture & how-it-works | `docs/architecture/*.md` | One file per subsystem |
| Architecture decisions | `docs/decisions/NNNN-*.md` | ADR format (§4) |
| Domain rules (the "source of truth" cited by code) | `docs/rules/*.md` | Stable normative rules |
| Security posture | `docs/security/posture.md` | Controls, fixed findings, open items |
| Operations / runbook | `docs/runbook.md` | Deploy, migrations, cron, secrets, incident steps |
| Per-area implementation notes | `<dir>/README.md` | Short, local to the code it describes |
| Launch | `LAUNCH-CHECKLIST.md` | Pre-cutover gate (machine-checked items marked 🤖) |
| Product plan (working) | Obsidian planning vault | NOT in repo — planning/coordination only |

**Rule R1 — docs ship with the code they describe.** Any document that code
references must live **in this repository** (`docs/` or a local `README.md`), not
in an external vault. Code header comments may cite `docs/rules/listing-lifecycle.md`,
never a path that only exists in someone's Obsidian.

> Known debt to clear (Phase 0/3): the rule files cited in code headers
> (`listing-lifecycle.md`, `validation-zod.md`, `vin-validation.md`,
> `slug-format.md`, `postal-phone-format.md`, `japanese-brands-whitelist.md`,
> `api-workers.md`, `model-catalog-page.md`) currently live only in the Obsidian
> archive `_archives/orchestrator-2026-05-02/`. Migrate them into `docs/rules/`
> and update the citing comments. Until then they are authoritative-but-unshipped.

---

## 2. The self-documenting-change rule

**Rule R2 — every behaviour change updates docs in the same commit/PR.** Concretely:

- New table / column / migration → update `docs/architecture/data-model.md`.
- New API endpoint or changed contract → update the relevant
  `docs/architecture/*.md` and the endpoint's own header comment.
- A decision with a rejected alternative → add an ADR (§4).
- New env var / binding / secret → update `docs/runbook.md` and `types/env.d.ts`.
- New scheduled job / worker → update `docs/runbook.md` + `CLAUDE.md`.
- A security-relevant change → update `docs/security/posture.md`.

If a change has none of the above, it needs no doc update — but that should be a
conscious "no", not an omission.

---

## 3. File header comments (the first line of documentation)

Every non-trivial source file opens with a block comment stating **purpose,
key invariants, and any non-obvious decision** — the existing files already do
this well; keep the bar. A header comment explains *why*, not *what the next line
does*. It may cite a `docs/rules/*.md` for the normative rule it enforces.

**Rule R3 — comments state constraints the code cannot show.** No "this came
from", no restating the line below, no review-chatter. The audience is the next
reader, not the current reviewer.

---

## 4. Architecture Decision Records (ADRs)

`docs/decisions/NNNN-short-slug.md`, sequentially numbered, never renumbered.
An ADR captures a decision a future maintainer/buyer must understand. Template:

```markdown
# NNNN — <title>

- **Status:** accepted | planned | superseded by [NNNN] | deprecated
- **Date:** YYYY-MM-DD
- **Commits:** <short hashes, if applicable>

## Context
What forced a decision. The constraint, not the whole world.

## Decision
What we chose, stated plainly.

## Alternatives
What we rejected and why — this is the most valuable part for a buyer.

## Consequences
What this makes easy, what it makes hard, what it commits us to.
```

**Rule R4 — record the rejected alternative.** A decision without its discarded
options is folklore. The "why not X" is what stops the next person re-litigating
or silently undoing it.

Decisions already made that warrant ADRs (seed list — captured in Phase 0):
city-first URL architecture; D1 atomic rate limiter (vs KV read-modify-write);
CSP nonce (SSR) + build-time hash (SSG), dropping `unsafe-inline`; `token_epoch`
session kill-switch; refresh-token reuse detection; CSRF via Origin/Sec-Fetch-Site
(no token); `isDemo` gating of fabricated Vehicle/Offer JSON-LD; `pending_media`
ownership binding at finalize; listing TTL + standalone cron sweeper; dealer
self-update allowlist; fail-closed JWT secret; billing "effective tier" indirection.

---

## 5. Style

- **English** for all repo docs and code comments (the planning vault may be Russian).
- **Terse and factual.** State the rule, cite the file. No marketing language.
- **Cite real paths** as `dir/file.ts:line` and real function names — never vague
  references. A doc that names a symbol must name one that exists.
- **Markdown**, GitHub-flavoured. Tables for enumerable facts, prose for reasoning.
- **Date facts absolutely** (`2026-06-11`), never "recently" / "now".
- **Mark what's not real.** Skeletons, stubs, and TODO surfaces are labelled as
  such (the audit's lesson #6: never let fabricated/placeholder state read as done).

---

## 6. Keeping docs honest

- **Rule R5 — a doc that names a file/function/flag is verified against the code
  when touched.** Stale docs are worse than none: they assert false confidence.
  Recalled/older docs reflect what was true when written — verify before relying.
- The pre-deploy gate (`npm run audit:seo`, `audit:launch`) enforces page-level
  correctness; treat doc accuracy with the same seriousness, even though it is not
  machine-checked.
- When a subsystem is materially refactored, its `docs/architecture/*.md` is
  rewritten, not patched into incoherence.
