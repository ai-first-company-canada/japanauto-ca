#!/usr/bin/env node
/**
 * scripts/generate-llms-txt.mjs — Phase 4.1
 *
 * Builds public/llms.txt from the same brief data the skeleton pages use,
 * so the LLM-discovery hint file stays in sync with the actual published
 * content. Run after `generate-skeleton-content.mjs` (or anytime briefs
 * change). Output is per https://llmstxt.org spec.
 */

import fs from 'node:fs';
import yaml from 'js-yaml';

const BRIEFS = './_archives/orchestrator-2026-05-02/05-seo-content/seo-briefs-49-yaml.md';
const OUT = './public/llms.txt';
const SITE = 'https://japanauto.ca';

const text = fs.readFileSync(BRIEFS, 'utf-8');
const blocks = [...text.matchAll(/```yaml\n([\s\S]*?)\n```/g)].map((m) => yaml.load(m[1]));

const brands = blocks.filter((b) => b.make);
const posts = blocks.filter((b) => b.slug && b.category);
const terms = blocks.filter((b) => b.term);

const order = ['toyota','honda','nissan','mazda','subaru','lexus','acura','infiniti','mitsubishi'];
brands.sort((a, b) => order.indexOf(a.make) - order.indexOf(b.make));
posts.sort((a, b) => a.slug.localeCompare(b.slug));
terms.sort((a, b) => a.slug.localeCompare(b.slug));

const lines = [];
lines.push('# japanauto.ca');
lines.push('');
lines.push('> Independent Canadian marketplace for used Japanese cars and salvage-yard donor cars. Aggregates listings from verified AMVIC- and OMVIC-licensed dealers across Toronto, Montreal, Vancouver, Calgary, Edmonton, and Ottawa.');
lines.push('');
lines.push('Editorial: every regulatory or YMYL claim is fact-checked by an independent AMVIC- or OMVIC-licensed advisor before publication. See [/editorial-policy/](' + SITE + '/editorial-policy/) for sourcing rules.');
lines.push('');

lines.push('## Marketplace');
lines.push('- [Used Japanese cars in Canada](' + SITE + '/used-cars/): full catalog across 9 brands and 6 Tier-1 cities.');
lines.push('- [Donor-car parts directory](' + SITE + '/parts/): salvage-yard donor cars listed by make, model, and city.');
lines.push('- [Verified Canadian dealers](' + SITE + '/dealers/): independent AMVIC and OMVIC-licensed sellers.');
lines.push('');

lines.push('## Brand pages');
for (const b of brands) {
  const name = b.make.charAt(0).toUpperCase() + b.make.slice(1);
  lines.push(`- [${name} — used cars in Canada](${SITE}/brands/${b.make}/): ${b.canadian_angle.slice(0, 200).replace(/\s+\S*$/, '')}…`);
}
lines.push('');

lines.push('## Editorial — buying guides, regulations, model deep-dives');
for (const p of posts) {
  lines.push(`- [${p.h1}](${SITE}/blog/${p.slug}/): ${p.tldr_draft.slice(0, 220).replace(/\s+\S*$/, '')}…`);
}
lines.push('');

lines.push('## Glossary — Japanese vehicle technology and Canadian regulations');
for (const t of terms) {
  lines.push(`- [${t.term}](${SITE}/glossary/${t.slug}/): ${t.canonical_definition.slice(0, 200).replace(/\s+\S*$/, '')}…`);
}
lines.push('');

lines.push('## Editorial team and policy');
lines.push('- [Editorial team](' + SITE + '/editorial-team/): bylined editors and licensed reviewer disclosures.');
lines.push('- [Editorial policy](' + SITE + '/editorial-policy/): sourcing rules, fact-checking process, correction policy.');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`Wrote ${OUT} — ${lines.length} lines, ${brands.length} brands, ${posts.length} posts, ${terms.length} terms`);
