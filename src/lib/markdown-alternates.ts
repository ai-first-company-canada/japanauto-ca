/**
 * src/lib/markdown-alternates.ts — `.md` twins of the editorial pages for LLM
 * crawlers (factory pattern: 02-astro-knowledge/markdown-alternates-llm-pattern.md).
 *
 * Only the three content collections get a twin: their bodies are already
 * Markdown, so the twin carries the same facts as the HTML without chrome.
 * Marketplace templates are left out until they carry an answer capsule —
 * an `.md` of an empty listing grid would be noise.
 *
 * BaseLayout calls `markdownHrefFor(pathname)` and emits
 * <link rel="alternate" type="text/markdown"> only when a twin exists.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { authorBio, formatIsoDate } from './schema-graph';

export const SITE = 'https://japanauto.ca';

const footer = (path: string, updated?: string) =>
  `\n\n---\nSource: <${SITE}${path}>` + (updated ? `\nLast reviewed: ${updated}` : '') + '\n';

export function blogMarkdown(e: CollectionEntry<'blog'>): string {
  const d = e.data;
  const path = `/blog/${d.slug}/`;
  const by = authorBio(d.author).name;
  const dates = [
    d.pub_date ? `Published ${formatIsoDate(d.pub_date)}` : '',
    d.last_reviewed ? `last reviewed ${formatIsoDate(d.last_reviewed)}` : '',
  ].filter(Boolean).join(', ');
  const sources = d.external_sources.length
    ? '\n\n## Sources\n\n' + d.external_sources.map((s) => `- <${s}>`).join('\n')
    : '';
  return `# ${d.h1}\n\n> ${d.tldr_draft.trim()}\n\nBy ${by}${dates ? ` · ${dates}` : ''}\n\n${(e.body ?? '').trim()}${sources}${footer(path, d.last_reviewed)}`;
}

export function glossaryMarkdown(e: CollectionEntry<'glossary'>): string {
  const d = e.data;
  const path = `/glossary/${d.slug}/`;
  const sources = d.sources.length
    ? '\n\n## Sources\n\n' + d.sources.map((s) => `- <${s}>`).join('\n')
    : '';
  return `# ${d.term}\n\n> ${d.canonical_definition.trim()}\n\n${(e.body ?? '').trim()}${sources}${footer(path, d.last_reviewed)}`;
}

export function brandMarkdown(e: CollectionEntry<'brand'>): string {
  const d = e.data;
  const path = `/brands/${d.make}/`;
  return `# ${d.h1 ?? d.suggested_h1}\n\n> ${d.meta_description.trim()}\n\n${(e.body ?? '').trim()}${footer(path, d.last_reviewed)}`;
}

let paths: Set<string> | undefined;

/** Set of HTML paths (with trailing slash) that have a `.md` twin. */
export async function markdownPaths(): Promise<Set<string>> {
  if (paths) return paths;
  const [blog, glossary, brands] = await Promise.all([
    getCollection('blog'), getCollection('glossary'), getCollection('brand'),
  ]);
  paths = new Set([
    ...blog.map((e) => `/blog/${e.data.slug}/`),
    ...glossary.map((e) => `/glossary/${e.data.slug}/`),
    ...brands.map((e) => `/brands/${e.data.make}/`),
  ]);
  return paths;
}

/** `/blog/foo/` → `https://japanauto.ca/blog/foo.md`, or undefined when no twin. */
export async function markdownHrefFor(pathname: string): Promise<string | undefined> {
  const p = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (!(await markdownPaths()).has(p)) return undefined;
  return `${SITE}${p.replace(/\/$/, '')}.md`;
}

export function markdownResponse(body: string, canonicalPath: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${SITE}${canonicalPath}>; rel="canonical"`,
    },
  });
}
