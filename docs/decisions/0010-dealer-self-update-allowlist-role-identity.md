# 0010 — Dealer self-update allowlist (role/identity columns immutable)

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 2fc5937

## Context

PATCH /api/dealers/me derived its update from dealerUpdateInputSchema, which descends from dealerBaseFields and therefore includes type, email, and slug. The handler built a fully dynamic UPDATE from every parsed key, so a dealer could change their own type (role — which inventory APIs the account may use), email (the unique login identifier — changing it while keeping verified=1 decouples the verified identity from the real login), and slug (the public URL), all without admin review or re-verification (mass-assignment, audit #13/#34).

## Decision

Introduce an explicit MUTABLE_COLUMNS allowlist on the handler (name, phone, website, description, address fields, lat/lng, business/gst/amvic numbers, hours, specializes_in, bio, founded_year). The dynamic UPDATE is built only from parsed keys present in that set; type, email, and slug are excluded and can only be changed through an admin/support flow (email additionally requiring re-verification). UNIQUE violations map to a 409 conflict.

## Consequences

A dealer can no longer self-escalate role, hijack the verified-identity-to-login binding, or reassign their public URL. Adding a new self-editable field now requires consciously extending the allowlist (secure-by-default). Role/email/slug changes require an out-of-band admin path that must exist operationally.
