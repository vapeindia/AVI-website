#!/usr/bin/env node
/**
 * Pulls candidate news items from RSS feeds (Google Alerts + outlet feeds
 * listed in feeds.json), filters out commercial/vendor domains (PECA
 * advertising-risk guard — see blocklist.json) and, for any feed with a
 * `keywordFilter` array (e.g. Filter/GFN's feed covers all drug policy,
 * not just tobacco/nicotine), off-topic items whose title+snippet match
 * none of those keywords, writes a paraphrased AI summary per item, and
 * creates draft entries under src/content/news/ with `reviewed: false`.
 * A human must review and flip that flag — nothing here auto-publishes.
 *
 * Requires ANTHROPIC_API_KEY env var. Run via GitHub Action on a schedule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const CONTENT_DIR = path.join(process.cwd(), 'src/content/news');
const CONFIG_DIR = path.join(process.cwd(), 'scripts/config');

function loadJson(file, fallback) {
  const p = path.join(CONFIG_DIR, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback;
}

const FEEDS = loadJson('feeds.json', []);
const BLOCKLIST = loadJson('blocklist.json', []);

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKLIST.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return true; // malformed URL — exclude rather than guess
  }
}

function matchesKeywords(item, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const haystack = `${item.title} ${item.snippet}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function existingUrls() {
  const urls = new Set();
  if (!fs.existsSync(CONTENT_DIR)) return urls;
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    const text = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const m = text.match(/sourceUrl:\s*"([^"]+)"/);
    if (m) urls.add(m[1]);
  }
  return urls;
}

const HTML_ENTITIES = {
  '&amp;': '&', '&#39;': "'", '&#8217;': '’', '&#8216;': '‘',
  '&quot;': '"', '&#8220;': '“', '&#8221;': '”', '&#8211;': '–',
  '&#8212;': '—', '&#8230;': '…', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
};

// Google Alerts titles arrive as mixed HTML (matched keywords wrapped in <b>)
// and items may be double-entity-encoded — strip tags and decode entities
// (twice, to catch double-encoding) so what lands in frontmatter is plain text.
function cleanText(s) {
  let text = String(s ?? '').replace(/<[^>]+>/g, '');
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/&#39;|&#8217;|&#8216;|&quot;|&#8220;|&#8221;|&#8211;|&#8212;|&#8230;|&nbsp;|&lt;|&gt;|&amp;/g, (m) => HTML_ENTITIES[m] ?? m);
  }
  return text.trim();
}

// Google Alerts links are wrapped in a google.com/url tracking redirect
// (?...&url=<real link>&...) — unwrap to the real article URL so the site
// links directly rather than through Google's redirector.
function unwrapGoogleRedirect(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'www.google.com' && parsed.pathname === '/url') {
      const real = parsed.searchParams.get('url');
      if (real) return real;
    }
  } catch {
    // not a valid URL — fall through and return as-is
  }
  return url;
}

async function fetchFeed(feedUrl, sourceName) {
  const xml = await fetch(feedUrl).then((r) => r.text());
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.filter(Boolean).map((item) => ({
    title: cleanText(item.title?.['#text'] ?? item.title ?? ''),
    url: unwrapGoogleRedirect(item.link?.['@_href'] ?? item.link ?? ''),
    date: item.pubDate ?? item.published ?? new Date().toISOString(),
    snippet: cleanText(item.description ?? item.summary ?? '').slice(0, 1000),
    sourceName,
  }));
}

async function writeSummary(item) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const prompt = `Write a neutral, paraphrased 1-2 sentence summary (max 400 characters, your own words, no verbatim quoting) of this news item for a tobacco-harm-reduction advocacy news page in India. Also classify its topic as one of: policy, litigation, science, industry, other.

Title: ${item.title}
Snippet: ${item.snippet}

Respond ONLY as JSON: {"summary": "...", "topic": "..."}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  }).then((r) => r.json());

  const text = res.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return { summary: item.snippet.slice(0, 300), topic: 'other' };
  }
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function toFrontmatter(item, ai) {
  const date = new Date(item.date);
  return `---
title: ${JSON.stringify(item.title)}
date: ${date.toISOString().slice(0, 10)}
sourceName: ${JSON.stringify(item.sourceName)}
sourceUrl: ${JSON.stringify(item.url)}
summary: ${JSON.stringify(ai.summary)}
topic: ${JSON.stringify(ai.topic)}
reviewed: false
---
`;
}

async function main() {
  const seen = existingUrls();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let written = 0;

  for (const feed of FEEDS) {
    let items = [];
    try {
      items = await fetchFeed(feed.url, feed.name);
    } catch (err) {
      console.error(`Feed failed: ${feed.name} — ${err.message}`);
      continue;
    }
    for (const item of items) {
      if (!item.url || seen.has(item.url)) continue;
      if (isBlocked(item.url)) {
        console.log(`Blocked (commercial domain): ${item.url}`);
        continue;
      }
      if (!matchesKeywords(item, feed.keywordFilter)) {
        console.log(`Skipped (off-topic per keywordFilter): ${item.title}`);
        continue;
      }
      seen.add(item.url);
      const ai = await writeSummary(item);
      const date = new Date(item.date);
      const filename = `${date.toISOString().slice(0, 10)}-${slugify(item.title)}.md`;
      fs.writeFileSync(path.join(CONTENT_DIR, filename), toFrontmatter(item, ai));
      written += 1;
      console.log(`Wrote draft: ${filename}`);
    }
  }
  console.log(`Done. ${written} new draft news entries written (reviewed: false).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
