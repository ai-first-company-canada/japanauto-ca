# 0003 — CSP without script-src 'unsafe-inline' (build-time hash + per-request nonce)

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 95d6bfd, df56d10

## Context

The Content-Security-Policy carried script-src 'self' 'unsafe-inline', which both permits arbitrary injected inline scripts and (critically) allows javascript: URI execution, neutralizing CSP as a backstop for the stored-XSS sinks in dealer/donor website fields. The codebase mixes ~900 statically generated Astro pages (each with inline <script> bodies) and dynamic Pages Functions that emit HTML via page-shell.ts, so a single allowlisting strategy does not fit both (audit #18).

## Decision

Drop 'unsafe-inline' from script-src and allowlist inline scripts two ways under one header: (1) SSG pages — every unique inline <script> body is SHA-256 hashed at build time by scripts/generate-csp-hashes.mjs into csp-script-hashes.ts (~24 unique bodies across 900+ pages) and listed in script-src; (2) dynamic page-shell.ts routes — a per-request nonce generated in _middleware.ts and consumed via takeCspNonce(), emitted only when a route actually used it so cacheable static responses never advertise one. Inline on*= event-handler attributes are allowed by neither mechanism; the build gate fails if one ships. object-src 'none', base-uri 'self', form-action 'self', frame-ancestors 'self' were also added. style-src deliberately keeps 'unsafe-inline' for now (Astro inlines all stylesheets and the markup uses style="" attributes; hashing is a tracked follow-up).

## Consequences

Injected inline JS and javascript:/data: URI execution are blocked, restoring CSP as a real XSS backstop. New maintenance obligation: any new or changed inline script must be re-hashed by the build script, and inline event handlers are now a hard build failure, so contributors must move handlers to addEventListener. Static responses stay cacheable because the nonce is conditional. style-src remains a known weaker spot until styles are hashed.
