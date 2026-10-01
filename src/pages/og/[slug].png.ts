import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { generateOgImage } from '../../lib/og-image';

// Titles must match each page's own <Base title=...> exactly — see
// src/pages/india/law.astro, faq.astro, policy.astro, press/index.astro.
const STATIC_PAGES: Record<string, string> = {
  'india-law': 'Is Vaping Banned in India?',
  faq: 'Vaping Law FAQ: India',
  policy: 'The Policy Case for Tobacco Harm Reduction',
  press: 'Press',
};

export const getStaticPaths: GetStaticPaths = async () => {
  const litigation = await getCollection('litigation');
  return [
    ...Object.entries(STATIC_PAGES).map(([slug, title]) => ({ params: { slug }, props: { title } })),
    ...litigation.map((item) => ({
      params: { slug: `litigation-${item.id}` },
      props: { title: item.data.title },
    })),
  ];
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage(props.title as string);
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
