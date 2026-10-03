import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { glossaryMarkdown, markdownResponse } from '../../lib/markdown-alternates';

export async function getStaticPaths() {
  const terms = await getCollection('glossary');
  return terms.map((t) => ({ params: { term: t.data.slug }, props: { entry: t } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = props.entry as CollectionEntry<'glossary'>;
  return markdownResponse(glossaryMarkdown(entry), `/glossary/${entry.data.slug}/`);
};
