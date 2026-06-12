/// <reference types="@cloudflare/workers-types" />
/**
 * Admin audit log (migration 0017): every mutation the panel performs is
 * recorded with the Access-verified operator email. Writes must never crash
 * an action — but a failed audit write is loud in the Worker logs.
 */

import type { AdminEnv } from "./access";

/**
 * Returns false when the audit row could NOT be written (e.g. migration 0017
 * not applied yet) — callers surface that in the flash message so an
 * unaudited mutation is never silent (security review 2026-06-12).
 */
export async function audit(
  env: AdminEnv,
  adminEmail: string,
  action: string,
  target: string | null,
  details?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_log (id, at, admin_email, action, target, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      Math.floor(Date.now() / 1000),
      adminEmail,
      action,
      target,
      details ? JSON.stringify(details) : null,
    ).run();
    return true;
  } catch (e) {
    console.error("audit write failed:", action, target, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Appends a loud marker to a flash message when the audit write failed. */
export function auditMark(msg: string, ok: boolean): string {
  return ok ? msg : `${msg} — ⚠ AUDIT WRITE FAILED (migration 0017 applied?)`;
}
