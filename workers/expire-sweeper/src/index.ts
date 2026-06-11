/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
}

export default {
  async scheduled(controller, env, _ctx) {
    const { meta } = await env.DB.prepare(
      `UPDATE listings
          SET status = 'expired', updated_at = unixepoch()
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at <= unixepoch()`,
    ).run();
    console.log(
      `expire-sweeper: ${meta.changes} listing(s) marked expired (cron "${controller.cron}")`,
    );
  },
} satisfies ExportedHandler<Env>;
