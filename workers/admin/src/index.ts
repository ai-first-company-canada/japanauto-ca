/// <reference types="@cloudflare/workers-types" />
/**
 * japanauto-admin — operator panel on admin.japanauto.ca.
 *
 * Layers: Cloudflare Access at the edge (identity, OTP) → requireAdmin()
 * re-verifies the Access JWT in-Worker (defense in depth, fail-closed) →
 * POSTs additionally require a same-origin Sec-Fetch-Site (CSRF — same
 * pattern as the public API, decision 0006) → every mutation hits
 * admin_audit_log (0017).
 *
 * Pages are server-rendered HTML (src/pages/*); no client framework.
 */

import type { AdminEnv } from "./lib/access";
import { requireAdmin } from "./lib/access";
import { dealersAction, dealersPage } from "./pages/dealers";
import { dashboardPage } from "./pages/dashboard";
import { listingsAction, listingsPage } from "./pages/listings";
import { slotsAction, slotsCreate, slotsPage } from "./pages/slots";
import { socialAction, socialPage } from "./pages/social";
import { opsAction, opsPage } from "./pages/ops";

function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  // Browsers always send Sec-Fetch-Site; its absence means a non-browser
  // client, which has no business POSTing to the panel.
  return site === "same-origin";
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const auth = await requireAdmin(request, env);
    if (auth instanceof Response) return auth;
    const adminEmail = auth;

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "GET") {
        switch (path) {
          case "/": return await dashboardPage(url, env, adminEmail);
          case "/dealers": return await dealersPage(url, env, adminEmail);
          case "/listings": return await listingsPage(url, env, adminEmail);
          case "/slots": return await slotsPage(url, env, adminEmail);
          case "/social": return await socialPage(url, env, adminEmail);
          case "/ops": return await opsPage(url, env, adminEmail);
          case "/favicon.ico": return new Response(null, { status: 404 });
        }
      }

      if (request.method === "POST") {
        if (!sameOrigin(request)) {
          return new Response("Cross-origin POST rejected.", { status: 403 });
        }
        switch (path) {
          case "/dealers/action": return await dealersAction(request, env, adminEmail);
          case "/listings/action": return await listingsAction(request, env, adminEmail);
          case "/slots/create": return await slotsCreate(request, env, adminEmail);
          case "/slots/action": return await slotsAction(request, env, adminEmail);
          case "/social/action": return await socialAction(request, env, adminEmail);
          case "/ops/action": return await opsAction(request, env, adminEmail);
        }
      }

      return new Response("Not found.", { status: 404 });
    } catch (e) {
      // No stack traces to the browser, full detail to Worker logs.
      console.error("admin error:", path, e instanceof Error ? e.stack ?? e.message : e);
      return new Response("Internal error — check Worker logs.", { status: 500 });
    }
  },
} satisfies ExportedHandler<AdminEnv>;
