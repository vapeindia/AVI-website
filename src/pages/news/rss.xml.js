// Hand-rolled RSS 2.0 (no @astrojs/rss dependency), matching the pattern in
// src/pages/analysis/rss.xml.js. News items link out to their original
// source (sourceUrl) rather than an AVI page, same as the news index.
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
  const items = (await getCollection('news', ({ data }) => data.reviewed))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 60);

  const site = context.site;

  const xmlItems = items.map((n) => {
    const url = n.data.sourceUrl;
    return `    <item>
      <title>${escapeXml(n.data.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${n.data.date.toUTCString()}</pubDate>
      <description>${escapeXml(n.data.summary)}</description>
      <source url="${new URL('/news/', site).toString()}">AVI Daily News</source>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AVI Daily News</title>
    <link>${new URL('/news/', site).toString()}</link>
    <atom:link href="${new URL('/news/rss.xml', site).toString()}" rel="self" type="application/rss+xml" />
    <description>Auto-aggregated daily coverage of tobacco harm reduction and vaping policy relevant to India, curated by the Association of Vapers India. These items are machine-summarized from third-party sources and do not represent AVI's own views.</description>
    <language>en-in</language>
${xmlItems}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
