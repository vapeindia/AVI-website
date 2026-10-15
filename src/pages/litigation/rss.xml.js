// Hand-rolled RSS 2.0, matching src/pages/analysis/rss.xml.js. Sorted by
// filedDate (newest first) rather than the index page's
// pending-cases-first ordering -- a feed is about recency, not status.
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
  const items = (await getCollection('litigation'))
    .sort((a, b) => (b.data.filedDate?.valueOf() ?? 0) - (a.data.filedDate?.valueOf() ?? 0));

  const site = context.site;

  const xmlItems = items.map((l) => {
    const url = new URL(`/litigation/${l.id}/`, site).toString();
    const pubDate = l.data.filedDate ?? new Date(0);
    return `    <item>
      <title>${escapeXml(l.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(l.data.summary)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AVI Litigation</title>
    <link>${new URL('/litigation/', site).toString()}</link>
    <atom:link href="${new URL('/litigation/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />
    <description>Court cases the Association of Vapers India has organised and directed against India's ENDS bans since 2017.</description>
    <language>en-in</language>
${xmlItems}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
