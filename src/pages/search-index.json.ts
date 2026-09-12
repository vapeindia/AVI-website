// Static JSON search index, built at deploy time from every content
// collection worth searching. Astro prerenders this like any other static
// route (this site has no adapter/SSR — output is fully static), so it's
// just a JSON file on the CDN, refreshed on every build/deploy exactly like
// the rest of the content pipeline. Consumed client-side by /search.
//
// Kept deliberately simple — plain substring matching client-side, no
// external search library — this is ~600 items today, well within what a
// browser can filter instantly without a dependency.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

interface SearchItem {
  title: string;
  url: string;
  type: string;
  date: string; // ISO date, or '' if the collection has none to offer
  snippet: string;
}

export const GET: APIRoute = async () => {
  const items: SearchItem[] = [];

  const news = await getCollection('news', ({ data }) => data.reviewed);
  for (const n of news) {
    items.push({
      title: n.data.title,
      url: n.data.sourceUrl,
      type: 'News',
      date: n.data.date.toISOString(),
      snippet: n.data.summary,
    });
  }

  const research = await getCollection('research', ({ data }) => data.reviewed);
  for (const r of research) {
    items.push({
      title: r.data.title,
      url: `/science/${r.id}`,
      type: 'Science',
      date: new Date(Date.UTC(r.data.year, 0, 1)).toISOString(),
      snippet: r.data.brief,
    });
  }

  const press = await getCollection('press');
  for (const p of press) {
    items.push({
      title: p.data.title,
      url: p.data.url ?? p.data.archivePdf ?? '/press',
      type: 'Press',
      date: p.data.date.toISOString(),
      snippet: p.data.outlet,
    });
  }

  const litigation = await getCollection('litigation');
  for (const l of litigation) {
    items.push({
      title: l.data.title,
      url: `/litigation/${l.id}`,
      type: 'Litigation',
      date: l.data.filedDate ? l.data.filedDate.toISOString() : '',
      snippet: l.data.summary,
    });
  }

  const campaigns = await getCollection('campaigns');
  for (const c of campaigns) {
    items.push({
      title: c.data.title,
      url: `/campaigns#${c.id}`,
      type: 'Campaign',
      date: c.data.dateStart.toISOString(),
      snippet: c.data.summary,
    });
  }

  const submissions = await getCollection('submissions');
  for (const s of submissions) {
    items.push({
      title: s.data.title,
      url: '/submissions',
      type: 'Submission',
      date: s.data.date.toISOString(),
      snippet: s.data.summary,
    });
  }

  const testimonials = await getCollection('testimonials', ({ data }) => data.reviewed);
  for (const t of testimonials) {
    items.push({
      title: `${t.data.name}, ${t.data.location}`,
      url: '/testimonials',
      type: 'Testimonial',
      date: t.data.date.toISOString(),
      snippet: t.data.testimonial.slice(0, 200),
    });
  }

  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json' },
  });
};
