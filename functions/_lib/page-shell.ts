/**
 * Shared HTML shell for Phase 2c2b dynamic pages (listing detail, dealer
 * profile). Mirrors the layout and head metadata that Astro's BaseLayout
 * emits for SSG pages — the global stylesheet is served at /styles/global.css
 * (copied to dist/ during build), so dynamic pages share the same look as
 * Astro-rendered ones.
 *
 * Lives outside functions/api/ so the public HTML routes can import it
 * without the api/* path prefix being baked in.
 */

export interface SchemaJsonGraph {
  '@context': 'https://schema.org';
  '@graph': unknown[];
}

export interface ShellOptions {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string | null;
  schemaLD?: unknown[];
}

const SHELL_HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#FFFFFF" />`;

/** Escape HTML special chars in a user-supplied string. */
export function esc(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Return `href` only if it uses a safe scheme (http/https/mailto/tel) or is a
 * relative path/anchor; otherwise '#'. Blocks `javascript:`/`data:`/`vbscript:`
 * URLs that survive esc() (they carry no HTML metachars) and would execute on
 * click inside an `<a href>`. `new URL()` strips embedded tab/newline, so
 * obfuscations like `java\tscript:` are normalized and caught too.
 */
export function safeUrl(s: string | null | undefined): string {
  if (s == null) return '#';
  const raw = String(s).trim();
  if (raw === '') return '#';
  if (raw.startsWith('/') || raw.startsWith('#')) return raw;
  try {
    return SAFE_URL_SCHEMES.has(new URL(raw).protocol) ? raw : '#';
  } catch {
    return '#';
  }
}

/** Format an integer with US-style thousands separators. */
export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Wrap rendered body markup in the shared head/footer shell. */
export function renderShell(opts: ShellOptions, body: string): string {
  const ogImage = opts.ogImage ?? 'https://japanauto.ca/og-default.png';
  const graph: SchemaJsonGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://japanauto.ca/#organization',
        name: 'japanauto.ca',
        url: 'https://japanauto.ca',
        logo: 'https://japanauto.ca/logo.png',
        description: 'Canadian marketplace for used Japanese cars and parts donor cars',
        areaServed: { '@type': 'Country', name: 'Canada' },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://japanauto.ca/#website',
        url: 'https://japanauto.ca',
        name: 'japanauto.ca',
        publisher: { '@id': 'https://japanauto.ca/#organization' },
        inLanguage: 'en-CA',
      },
      ...(opts.schemaLD ?? []),
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${SHELL_HEAD}
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}" />
<link rel="canonical" href="${esc(opts.canonical)}" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.description)}" />
<meta property="og:url" content="${esc(opts.canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="en_CA" />
<meta property="og:site_name" content="japanauto.ca" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(opts.title)}" />
<meta name="twitter:description" content="${esc(opts.description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
<link rel="stylesheet" href="/styles/global.css" />
<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
</head>
<body>
${body}
</body>
</html>`;
}

/** Build the imagedelivery.net URL for a Cloudflare Images id. */
export function cfImageUrl(hash: string, imageId: string, variant = 'public'): string {
  return `https://imagedelivery.net/${hash}/${imageId}/${variant}`;
}

/** Format an E.164 NANP phone like +14035551234 → "(403) 555-1234". */
export function formatPhone(e164: string | null | undefined): { display: string; tel: string } {
  if (!e164) return { display: '—', tel: '' };
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return { display: e164, tel: e164 };
  return { display: `(${m[1]}) ${m[2]}-${m[3]}`, tel: e164 };
}

/** Friendly relative-time label from a unix timestamp (seconds). */
export function relativeTime(ts: number): string {
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (ageSec < 86_400) return 'Listed today';
  const days = Math.floor(ageSec / 86_400);
  if (days === 1) return 'Listed 1 day ago';
  if (days < 7) return `Listed ${days} days ago`;
  if (days < 14) return 'Listed 1 week ago';
  if (days < 30) return `Listed ${Math.floor(days / 7)} weeks ago`;
  return `Listed ${Math.floor(days / 30)} months ago`;
}
