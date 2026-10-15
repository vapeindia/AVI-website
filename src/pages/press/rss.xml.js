// Hand-rolled RSS 2.0, matching src/pages/analysis/rss.xml.js. Links to
// each item's own AVI page (src/pages/press/[...slug].astro), not the
// external outlet -- this is AVI's catalogue of its own press record.
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
  const items = (await getCollection('press'))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 60);

  const site = context.site;

  const xmlItems = items.map((p) => {
    const url = new URL(`/press/${p.id}/`, site).toString();
    return `    <item>
      <title>${escapeXml(p.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
      <description>${escapeXml(p.data.outlet)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AVI Press &amp; Media Coverage</title>
    <link>${new URL('/press/', site).toString()}</link>
    <atom:link href="${new URL('/press/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />
    <description>Independent media coverage of the Association of Vapers India, and AVI's own public statements, letters and rebuttals.</description>
    <language>en-in</language>
${xmlItems}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
