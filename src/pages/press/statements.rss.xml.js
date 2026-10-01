import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// AVI's own voice only — press-release/quote entries, excluding anything
// still `reviewed: false` (a draft statement awaiting sign-off, see
// content/newsroom). Third-party `coverage`/`op-ed`/`interview` items stay
// out of this feed for the same reason they don't get an Article schema on
// press/index.astro: this feed is specifically AVI's own statements, not
// everything mentioning AVI.
export async function GET(context) {
  const items = (await getCollection('press', ({ data }) =>
    data.reviewed && (data.type === 'press-release' || data.type === 'quote')
  )).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'AVI statements',
    description: "Association of Vapers India's own public statements, press releases and rebuttals.",
    site: context.site,
    items: items.map((item) => ({
      title: item.data.title,
      link: `/press/${item.id}/`,
      pubDate: item.data.date,
      description: item.data.outlet,
    })),
    customData: '<language>en-in</language>',
  });
}
