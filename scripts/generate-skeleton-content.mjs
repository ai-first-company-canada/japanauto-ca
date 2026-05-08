#!/usr/bin/env node
/**
 * scripts/generate-skeleton-content.mjs — Phase 4.1
 *
 * Parses `_archives/.../seo-briefs-49-yaml.md` (49 fenced YAML blocks) into
 * 49 skeleton markdown files under `src/content/{brands,blog,glossary}/`.
 *
 * Each block carries the full brief frontmatter plus a body that already
 * renders useful content from frontmatter alone (TL;DR, FAQ questions,
 * canonical definitions, sources). Phase 4.2 content-maker fills the
 * remaining `## H2 — Coming Phase 4.2` placeholder sections.
 *
 * Idempotent: re-running overwrites all 49 files. `body_status: skeleton`
 * marks every file so the templates know to show progress UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const BRIEFS = './_archives/orchestrator-2026-05-02/05-seo-content/seo-briefs-49-yaml.md';
const OUT_BRANDS = './src/content/brands';
const OUT_BLOG = './src/content/blog';
const OUT_GLOSSARY = './src/content/glossary';

[OUT_BRANDS, OUT_BLOG, OUT_GLOSSARY].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const text = fs.readFileSync(BRIEFS, 'utf-8');
const blocks = [...text.matchAll(/```yaml\n([\s\S]*?)\n```/g)].map((m) => m[1]);
console.log(`Found ${blocks.length} YAML blocks`);

let nBrand = 0;
let nBlog = 0;
let nGlossary = 0;

for (const block of blocks) {
  const data = yaml.load(block);
  // Rewrite known broken URLs (granular parts, hybrid sub-models, nested blog
  // paths) onto routes that actually exist post-Phase-3.x. Preserves SEO
  // Guru's link intent without 404ing.
  if (Array.isArray(data.internal_links)) {
    data.internal_links = data.internal_links
      .map((u) => rewriteInternalLink(u))
      .filter(Boolean);
  }
  if (Array.isArray(data.related_terms)) {
    data.related_terms = data.related_terms
      .map((u) => rewriteInternalLink(u))
      .filter(Boolean);
  }
  if (data.make) {
    const fm = withBodyStatus(data, { body_status: 'skeleton' });
    const body = renderBrandSkeletonBody(data);
    writeMd(path.join(OUT_BRANDS, `${data.make}.md`), fm, body);
    nBrand++;
  } else if (data.term) {
    const fm = withBodyStatus(data, { body_status: 'skeleton' });
    const body = renderGlossarySkeletonBody(data);
    writeMd(path.join(OUT_GLOSSARY, `${data.slug}.md`), fm, body);
    nGlossary++;
  } else if (data.slug && data.category) {
    // Author by category. canada-regulations → editorial collective + AMVIC
    // reviewer; news → west-coast desk; parts-101 → west-coast (parts content
    // skews JDM/import which is more west); buying-guides + model-deep-dives
    // → east-coast desk.
    const author = data.category === 'canada-regulations'
      ? 'japanauto-editorial'
      : ['news', 'parts-101'].includes(data.category)
        ? 'sarah-chen'
        : 'marc-tremblay';
    const reviewer_role = data.category === 'canada-regulations'
      ? 'AMVIC-licensed advisor (Alberta) / OMVIC-licensed advisor (Ontario)'
      : undefined;
    const fm = withBodyStatus(data, {
      author, reviewer_role, body_status: 'skeleton', pub_date: '2026-05-15',
    });
    const body = renderBlogSkeletonBody(data);
    writeMd(path.join(OUT_BLOG, `${data.slug}.md`), fm, body);
    nBlog++;
  } else {
    console.warn('Skipping unrecognised block (no make/term/slug+category):', JSON.stringify(data).slice(0, 80));
  }
}

console.log(`Wrote ${nBrand} brands, ${nBlog} blog posts, ${nGlossary} glossary terms`);

if (nBrand !== 9 || nBlog !== 10 || nGlossary !== 30) {
  console.error('FAIL: expected 9/10/30 — check briefs file for malformed blocks');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Map briefs' aspirational URLs onto Phase-3.x reality.
 *
 *   /blog/<category>/<slug>/                        → /blog/<slug>/
 *     (templates use a flat /blog/[slug]/ — Phase 4.1 prompt.)
 *
 *   /parts/<part>/<make>/             (granular)    → /parts/<make>/
 *   /parts/<part>/<make>-<model>/                   → /parts/<make>/<model>/
 *   /parts/<part>/                                  → /parts/
 *     (ADR-0008 rejected granular parts catalog. Closest is the donor-car
 *     hub for the matching make/model.)
 *
 *   /used-cars/<make>/<model>-hybrid/<city>/       → /used-cars/<make>/<model>/<city>/
 *     (Catalog tracks `camry` and `accord` only; trims/hybrids fold into the
 *     parent model. Phase 5 may split them out.)
 */
function rewriteInternalLink(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u = raw.trim();
  // Always end with a slash for stable matching, then strip at the end.
  if (!u.endsWith('/') && !u.includes('?') && !u.includes('#')) u = u + '/';

  // Blog: flatten nested category path.
  let m = u.match(/^\/blog\/[a-z0-9-]+\/([a-z0-9-]+)\/$/);
  if (m) return `/blog/${m[1]}/`;

  // Parts: granular part-prefix paths → make hub or make/model hub.
  m = u.match(/^\/parts\/[a-z0-9-]+\/([a-z]+)-([a-z0-9]+)\/$/);
  if (m) return `/parts/${m[1]}/${m[2]}/`;
  m = u.match(/^\/parts\/[a-z0-9-]+\/([a-z]+)\/$/);
  if (m) return `/parts/${m[1]}/`;
  m = u.match(/^\/parts\/[a-z0-9-]+\/$/);
  if (m) return '/parts/';

  // Used cars: hybrid sub-model → parent model.
  m = u.match(/^\/used-cars\/([a-z0-9-]+)\/([a-z0-9-]+)-hybrid\/([a-z0-9-]+)\/$/);
  if (m) return `/used-cars/${m[1]}/${m[2]}/${m[3]}/`;
  m = u.match(/^\/used-cars\/([a-z0-9-]+)\/([a-z0-9-]+)-hybrid\/$/);
  if (m) return `/used-cars/${m[1]}/${m[2]}/`;

  return u;
}

function withBodyStatus(data, extras) {
  const out = { ...data };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function writeMd(filePath, frontmatter, body) {
  // js-yaml dumps with 2-space indent and uses block style by default — that
  // matches the briefs file format and keeps diffs readable.
  const fm = yaml.dump(frontmatter, { lineWidth: 200, noRefs: true });
  fs.writeFileSync(filePath, `---\n${fm}---\n\n${body}\n`);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderBrandSkeletonBody(d) {
  const opener = `## Why buy a used ${capitalize(d.make)} in Canada\n\n${d.canadian_angle}\n`;

  const facts = (d.ai_citation_hooks ?? []).length
    ? `## Key facts at a glance\n\n${(d.ai_citation_hooks ?? []).map((h) => `- ${h}`).join('\n')}\n`
    : '';

  const placeholders = (d.suggested_h2_blocks ?? [])
    .filter((h) => !/^why buy/i.test(h))
    .map((h) => `## ${h}\n\n_Content production in progress — coming Phase 4.2._\n`)
    .join('\n');

  return [opener, facts, placeholders].filter(Boolean).join('\n');
}

function renderBlogSkeletonBody(d) {
  const sections = (d.section_outline ?? [])
    .map((s) => `## ${s}\n\n_Content production in progress — coming Phase 4.2._\n`)
    .join('\n');
  return `${sections}\n`;
}

function renderGlossarySkeletonBody(d) {
  // Glossary skeleton is nearly publishable: canonical_definition + TL;DR +
  // why-it-matters are already in frontmatter and templates surface them.
  // Body adds an explanatory section and a "Common questions" stub that
  // 4.2 will turn into proper Q&A.
  const what = `## What is ${d.term}?\n\n${d.tldr_draft}\n`;
  const why = `## Why it matters in Canada\n\n${d.why_it_matters_in_canada}\n`;
  const questions = (d.related_questions ?? []).length
    ? `## Common questions\n\n${(d.related_questions ?? []).map((q) => `### ${q}\n\n_Detailed answer coming Phase 4.2._\n`).join('\n')}\n`
    : '';
  return [what, why, questions].filter(Boolean).join('\n');
}
