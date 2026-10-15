// Hand-rolled RSS 2.0, matching src/pages/analysis/rss.xml.js. The
// `research` collection only has a `year`, not a full date, so pubDate is
// synthesised as Jan 1 of that year — same approach search-index.json.ts
// already uses for this collection.
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
  const items = (await getCollection('research', ({ data }) => data.reviewed))
    .sort((a, b) => b.data.year - a.data.year)
    .slice(0, 60);

  const site = context.site;

  const xmlItems = items.map((r) => {
    const url = new URL(`/science/${r.id}/`, site).toString();
    const pubDate = new Date(Date.UTC(r.data.year, 0, 1));
    return `    <item>
      <title>${escapeXml(r.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(r.data.brief)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AVI Science / Evidence Library</title>
    <link>${new URL('/science/', site).toString()}</link>
    <atom:link href="${new URL('/science/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />
    <description>Published tobacco harm reduction research, auto-aggregated and plain-language summarised by the Association of Vapers India.</description>
    <language>en-in</language>
${xmlItems}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
