/**
 * Cloudflare Pages Functions bindings — globally available via context.env.
 *
 * All bindings declared in wrangler.toml must appear here typed.
 * Pages Functions inherit Worker request context automatically.
 */

/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // ==========================================================================
  // D1 — primary database
  // ==========================================================================
  DB: D1Database;

  // ==========================================================================
  // KV — caches and rate-limit counters
  // ==========================================================================
  CACHE: KVNamespace;
  RATE_LIMIT: KVNamespace;

  // ==========================================================================
  // R2 — media storage
  // ==========================================================================
  MEDIA: R2Bucket;

  // ==========================================================================
  // Cloudflare Images
  // ==========================================================================
  IMAGES: ImagesBinding;

  // ==========================================================================
  // Public vars
  // ==========================================================================
  ENV: "production" | "preview" | "dev";
  PUBLIC_SITE_URL: string;
  JWT_ISSUER: string;
  JWT_ACCESS_TTL_SECONDS: string;
  JWT_REFRESH_TTL_SECONDS: string;
  LISTING_DEFAULT_TTL_DAYS: string;
  USED_CAR_AGE_CAP_YEARS: string;
  /** Cloudflare account id — used by /api/media/upload-url to call the Images API. Public (visible in dashboard URLs). */
  CLOUDFLARE_ACCOUNT_ID: string;
  /** Public delivery host hash for `https://imagedelivery.net/<hash>/<image_id>/<variant>`. Public by design. */
  PUBLIC_CLOUDFLARE_ACCOUNT_HASH: string;
  /** IndexNow API key. The same hex string is hosted at `/<key>.txt` for ownership verification — public by design. Empty disables IndexNow pings. */
  INDEXNOW_KEY: string;

  // ==========================================================================
  // Secrets (wrangler secret put …)
  // ==========================================================================
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  /** Resend API key for transactional email (WS-2, decision 0020). OPTIONAL by
   *  design: absent → email flows degrade honestly (reset-request 501,
   *  signup verify-send silently skipped). Needed in TWO places: this Pages
   *  project AND workers/expire-sweeper (reports have their own copy). */
  RESEND_API_KEY?: string;
  /** Optional From override for transactional auth email ("name <addr>"). */
  AUTH_EMAIL_FROM?: string;
  DAILY_IP_HASH_SALT: string;
  /** Cloudflare API token with `Account → Cloudflare Images: Edit` scope. Used by upload-url to mint direct-upload URLs. */
  CLOUDFLARE_IMAGES_API_TOKEN: string;
  /** Anthropic API key for the listing text improver (Feature 2). Absent = endpoint returns 503 not_configured. */
  ANTHROPIC_API_KEY?: string;
  /** Bearer token for the external content factory pulling /api/social/jobs (Feature 3). Absent = factory endpoints return 503. */
  SOCIAL_FACTORY_TOKEN?: string;
  /** Access key for the Meta vehicle-catalog feed /feeds/meta-vehicles.csv (decision 0015). Absent = feed returns 503. */
  META_FEED_KEY?: string;
  /** HMAC secret for report unsubscribe links (decision 0016) — shared with the cron worker. Absent = endpoint 503. */
  REPORTS_UNSUB_SECRET?: string;
  /** Override the improver model (var, not secret). Defaults to claude-haiku-4-5 in the handler. */
  AI_IMPROVER_MODEL?: string;
}

/**
 * Pages Functions context. Use this typed alias in handlers:
 *
 *   export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => { ... }
 */
export type AppContext = EventContext<Env, string, Record<string, unknown>>;

/**
 * Cloudflare Images binding (typed loosely until @cloudflare/workers-types
 * ships a fuller definition).
 */
export interface ImagesBinding {
  input(stream: ReadableStream): {
    transform(opts: Record<string, unknown>): {
      output(opts: { format: string; quality?: number }): Promise<{
        response(): Response;
      }>;
    };
  };
}
