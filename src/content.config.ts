import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Human-written analysis and updates from AVI.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string().default('Association of Vapers India'),
    summary: z.string().max(280),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Auto-pulled news items (from Google Alerts / outlet RSS via GitHub Action).
// Lands in news/_inbox as a PR; human moves/approves into news/ proper.
const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    sourceName: z.string(),        // e.g. "The Hindu"
    sourceUrl: z.string().url(),
    summary: z.string().max(400),  // 1-2 sentence AI-written brief, paraphrased
    topic: z.enum(['policy', 'litigation', 'science', 'industry', 'other']).default('other'),
    reviewed: z.boolean().default(false), // human approval gate before it's linked from nav
  }),
});

// Auto-pulled research (PubMed / Europe PMC via GitHub Action) with AI brief.
const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    authors: z.string(),
    journal: z.string(),
    year: z.number(),
    doi: z.string().optional(),
    pubmedId: z.string().optional(),
    studyType: z.enum([
      'systematic-review', 'meta-analysis', 'rct', 'cohort',
      'cross-sectional', 'policy-report', 'other',
    ]),
    substance: z.array(z.enum(['e-cigarette', 'nicotine-pouch', 'snus', 'combustible', 'general'])).default(['general']),
    brief: z.string().max(500),   // plain-language AI summary, paraphrased not quoted
    relevanceToIndia: z.string().optional(),
    reviewed: z.boolean().default(false),
  }),
});

// Press coverage OF AVI (distinct from `news`, which is coverage of the topic generally).
const press = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/press' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    outlet: z.string(),
    url: z.string().url().optional(),   // optional: some archive items are scans, no live URL
    type: z.enum(['coverage', 'op-ed', 'quote', 'interview', 'press-release']),
    archivePdf: z.string().optional(),  // path under /public/archive if the live link is dead
  }),
});

// Litigation AVI has supported — one entry per case/matter, built from the CASE folder archive.
// Most entries name an individual or allied organisation as the petitioner of record,
// not AVI itself — see each entry's notes for AVI's actual documented role.
const litigation = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/litigation' }),
  schema: z.object({
    title: z.string(),          // e.g. "Karnataka High Court — WP 36696/2017"
    state: z.string(),
    court: z.string(),
    filedDate: z.date().optional(),
    status: z.enum(['pending', 'disposed', 'withdrawn', 'superseded-by-peca']),
    outcome: z.string().optional(),
    summary: z.string(),
    documents: z.array(z.object({
      label: z.string(),
      path: z.string(),
    })).default([]),
  }),
});

// Visitor-submitted testimonials on quitting combustible tobacco via vaping or
// nicotine pouches. Submitted through the form at /testimonials, which posts to
// the Cloudflare Pages Function at functions/api/testimonial.js. That function
// deliberately does NOT commit the submitter's email into this repo — only
// name, location and the testimonial text ever reach a content file — and
// opens a PR with `reviewed: false`; a human must flip that flag before a
// testimonial appears on the site. See functions/api/testimonial.js for the
// full submission pipeline and functions/README.md for required setup.
const testimonials = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/testimonials' }),
  schema: z.object({
    name: z.string(),
    location: z.string(),        // city or state, as submitted
    date: z.date(),
    testimonial: z.string().max(2000),
    reviewed: z.boolean().default(false),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, news, research, press, litigation, testimonials };
