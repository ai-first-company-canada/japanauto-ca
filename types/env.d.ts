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

  // ==========================================================================
  // Secrets (wrangler secret put …)
  // ==========================================================================
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  DAILY_IP_HASH_SALT: string;
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
