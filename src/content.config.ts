/**
 * src/content.config.ts — Astro Content Layer collections (Phase 4.1)
 *
 * Three collections drive the SEO/GEO content pillar:
 *   - brand     → /brands/[make]/                  (9 entries, one per make)
 *   - blog      → /blog/[slug]/                    (10 entries from SEO Guru briefs)
 *   - glossary  → /glossary/[term-slug]/           (30 entries)
 *
 * Frontmatter shape mirrors the YAML blocks in
 * `_archives/orchestrator-2026-05-02/05-seo-content/seo-briefs-49-yaml.md`.
 *
 * `body_status` distinguishes skeleton entries (frontmatter only — Phase 4.1)
 * from filled bodies (Phase 4.2 content-maker). Templates render TL;DR, FAQ
 * questions, and Sources straight from frontmatter so even skeleton pages
 * carry SEO/GEO weight.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ---------------------------------------------------------------------------
// brand
// ---------------------------------------------------------------------------
const brand = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/brands' }),
  schema: z.object({
    make: z.enum([
      'toyota', 'honda', 'nissan', 'mazda', 'subaru',
      'lexus', 'acura', 'infiniti', 'mitsubishi',
    ]),
    primary_keyword: z.string(),
    secondary_keywords: z.array(z.string()).default([]),
    long_tail_keywords: z.array(z.string()).default([]),
    title_tag: z.string(),
    meta_description: z.string(),
    suggested_h1: z.string(),
    suggested_h2_blocks: z.array(z.string()).default([]),
    faq_questions: z.array(z.string()).default([]),
    canadian_angle: z.string(),
    ai_citation_hooks: z.array(z.string()).default([]),
    serp_competitors: z.array(z.string()).default([]),
    serp_features_observed: z.string().optional(),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
    notes: z.string().optional(),
    body_status: z.enum(['skeleton', 'in-review', 'published']).default('skeleton'),
    last_reviewed: z.string().optional(),
    reviewer_role: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// blog
// ---------------------------------------------------------------------------
const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    category: z.enum([
      'buying-guides', 'model-deep-dives', 'canada-regulations',
      'parts-101', 'news',
    ]),
    slug: z.string(),
    title: z.string(),
    h1: z.string(),
    primary_keyword: z.string(),
    secondary_keywords: z.array(z.string()).default([]),
    target_audience: z.string(),
    intent: z.enum([
      'informational', 'commercial-investigation',
      'transactional', 'navigational',
    ]),
    estimated_search_volume: z.enum(['low', 'medium', 'high']),
    competition: z.enum(['low', 'medium', 'high']),
    why_this_topic: z.string(),
    tldr_draft: z.string(),
    section_outline: z.array(z.string()),
    internal_links: z.array(z.string()).default([]),
    external_sources: z.array(z.string()).default([]),
    faq_questions: z.array(z.string()).default([]),
    canadian_angle_specifics: z.string().optional(),
    ai_citation_hooks: z.array(z.string()).default([]),
    serp_competitors: z.array(z.string()).default([]),
    serp_features_observed: z.string().optional(),
    estimated_word_count: z.string().optional(),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
    author: z.enum(['marc-tremblay', 'sarah-chen', 'japanauto-editorial'])
      .default('japanauto-editorial'),
    reviewer_role: z.string().optional(),
    pub_date: z.string().optional(),
    last_reviewed: z.string().optional(),
    body_status: z.enum(['skeleton', 'in-review', 'published']).default('skeleton'),
    notes: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// glossary
// ---------------------------------------------------------------------------
const glossary = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/glossary' }),
  schema: z.object({
    term: z.string(),
    slug: z.string(),
    group: z.enum([
      'vehicle-tech', 'brand-specific-tech',
      'marketplace', 'canadian-regulations', 'parts',
    ]),
    priority: z.number().int().min(1).max(3).default(2),
    canonical_definition: z.string(),
    tldr_draft: z.string(),
    why_it_matters_in_canada: z.string(),
    related_questions: z.array(z.string()).default([]),
    related_terms: z.array(z.string()).default([]),
    sources: z.array(z.string()).default([]),
    ai_citation_hooks: z.array(z.string()).default([]),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
    notes: z.string().optional(),
    last_reviewed: z.string().optional(),
    reviewer_role: z.string().optional(),
    body_status: z.enum(['skeleton', 'in-review', 'published']).default('skeleton'),
  }),
});

export const collections = { brand, blog, glossary };
