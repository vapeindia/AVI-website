import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const items = (await getCollection('research', ({ data }) => data.reviewed))
    .sort((a, b) => b.year - a.year);

  return rss({
    title: "AVI Evidence Library",
    description: "New tobacco harm reduction research, added to AVI's evidence library — e-cigarettes, nicotine pouches, snus and smokeless tobacco.",
    site: context.site,
    items: items.map((item) => ({
      title: item.data.title,
      link: `/science/${item.id}/`,
      pubDate: new Date(item.data.year, 0, 1),
      description: item.data.brief,
      categories: item.data.substance,
    })),
    customData: '<language>en-in</language>',
  });
}
