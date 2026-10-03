import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { brandMarkdown, markdownResponse } from '../../lib/markdown-alternates';

export async function getStaticPaths() {
  const brands = await getCollection('brand');
  return brands.map((b) => ({ params: { make: b.data.make }, props: { entry: b } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = props.entry as CollectionEntry<'brand'>;
  return markdownResponse(brandMarkdown(entry), `/brands/${entry.data.make}/`);
};
