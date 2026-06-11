# 0008 — pending_media ownership binding for Cloudflare Images direct upload

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 2fc5937

## Context

Photo upload uses Cloudflare Images Direct Creator Upload: /api/media/upload-url mints a one-time URL, the browser PUTs the file straight to Cloudflare, then /api/media/finalize records the media row from a client-supplied image_id. But image_id is a public segment of the delivery URL, so a finalize call alone cannot prove the caller actually minted that image for that entity — a dealer could finalize an image_id belonging to another entity or fabricated from a known delivery URL (audit #14).

## Decision

At mint time, record a pending-upload claim (recordPendingUpload / pending_media) binding this dealer + this image_id + this entity. /api/media/finalize does not trust the client image_id on its own; it verifies and atomically consumes the claim via consumePendingUpload, so the row is created only if THIS dealer minted THIS image_id for THIS entity, and the claim is single-use. Entity ownership (listing/donor belongs to the dealer) is checked at both mint and finalize.

## Consequences

Finalize cannot be forged or replayed: image ids are useless without a matching single-use claim, and the atomic consume prevents double-finalize races. Adds a pending_media table and a two-write lifecycle (mint records, finalize consumes) plus the need to expire/clean abandoned claims. The browser-direct upload path (server not in the byte path) is preserved.
