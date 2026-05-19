/**
 * IndexNow helper — fire-and-forget ping to https://api.indexnow.org so Bing
 * and Yandex (and any other IndexNow-participating engines) discover new or
 * updated URLs within seconds instead of waiting on a crawl cycle.
 *
 * Always wrap calls in `ctx.waitUntil(...)` so the user response returns
 * immediately while the ping fires in background.
 *
 * If `INDEXNOW_KEY` is empty (preview env, local dev) we silently no-op.
 */

export interface IndexNowEnv {
  PUBLIC_SITE_URL: string;
  INDEXNOW_KEY: string;
}

const ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function pingIndexNow(env: IndexNowEnv, urls: string[]): Promise<void> {
  if (!env.INDEXNOW_KEY) return;
  if (!urls.length) return;

  const site = env.PUBLIC_SITE_URL.replace(/\/$/, '');
  const host = new URL(site).host;
  const key = env.INDEXNOW_KEY;
  const keyLocation = `${site}/${key}.txt`;

  try {
    if (urls.length === 1) {
      const url = `${ENDPOINT}?url=${encodeURIComponent(urls[0])}&key=${key}&keyLocation=${encodeURIComponent(keyLocation)}`;
      await fetch(url);
      return;
    }

    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
    });
  } catch (e) {
    // Non-fatal. Sitemap fallback still works on the next crawl cycle.
    console.error('IndexNow ping failed:', e instanceof Error ? e.message : String(e));
  }
}
