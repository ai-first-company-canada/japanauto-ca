import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { blogMarkdown, markdownResponse } from '../../lib/markdown-alternates';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((p) => ({ params: { slug: p.data.slug }, props: { entry: p } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = props.entry as CollectionEntry<'blog'>;
  return markdownResponse(blogMarkdown(entry), `/blog/${entry.data.slug}/`);
};
