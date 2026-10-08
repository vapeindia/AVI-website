// Hand-rolled RSS 2.0 (no @astrojs/rss dependency — this is simple enough
// not to need it, matching the project's general low-dependency approach).
// Drafts are excluded unconditionally here (unlike index.astro/[...slug]'s
// DEV-only preview), since a build-time feed has no "local preview"
// audience distinction.
import { getCollection } from 'astro:content';

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context) {
  const posts = (await getCollection('analysis', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const site = context.site;
  const feedUrl = new URL('/analysis/', site).toString();

  const items = posts.map((p) => {
    const url = new URL(`/analysis/${p.id}/`, site).toString();
    return `    <item>
      <title>${escapeXml(p.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
      <description>${escapeXml(p.data.intro)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AVI Analysis</title>
    <link>${feedUrl}</link>
    <atom:link href="${new URL('/analysis/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />
    <description>Commentary and analysis from the Association of Vapers India.</description>
    <language>en-in</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
