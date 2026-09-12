#!/usr/bin/env node
/**
 * Pulls candidate news items from RSS feeds (Google Alerts + outlet feeds
 * listed in feeds.json), filters out commercial/vendor domains (PECA
 * advertising-risk guard — see blocklist.json), industry press releases
 * (press-wire-domains.json + launch-language title patterns — see
 * isIndustryPressRelease() below), off-topic items whose title+snippet match
 * none of a feed's `keywordFilter` array (e.g. Filter/GFN's feed covers all
 * drug policy, not just tobacco/nicotine), and non-article pages a broad
 * company-name/ticker alert can still surface — a social-media post, a
 * tag/category index page, or a stock-data "company hub" page with no real
 * story (see NON_ARTICLE_URL_PATTERNS / MARKET_DATA_TITLE_PATTERNS / the
 * post-summary looksLikeNoContentSummary() check below). Writes a
 * paraphrased AI summary per item and creates entries under
 * src/content/news/ with `reviewed: true` — as of 2026-09 this pipeline is
 * fully automated (explicit site-owner instruction) and the GitHub Action
 * commits straight to main, no PR/human gate. `reviewed` here means "passed
 * the automated filters above," not "a person checked it" — see the
 * standing disclaimer on the News index page. This is scoped to `news`
 * only; fetch-research.mjs and the testimonials pipeline are unchanged and
 * still require human review.
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
const PRESS_WIRE_DOMAINS = loadJson('press-wire-domains.json', []);

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKLIST.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return true; // malformed URL — exclude rather than guess
  }
}

// Industry product-launch press releases (new device/flavour announcements,
// "proud to unveil" copy) carry PECA advertising risk and aren't the kind of
// coverage this feed is for — distinct from genuine reporting ABOUT the
// industry (a trade body's regulatory response, a lawsuit, a market-size
// story), which stays in. Two signals: known PR-wire distribution domains,
// or launch-announcement language in the title itself (works regardless of
// which domain syndicates it).
const PRESS_RELEASE_TITLE_PATTERNS = [
  /\blaunch(es|ed|ing)?\b.{0,40}\b(vape|e-?cig|device|pod|disposable|flavou?r)/i,
  /\bunveil(s|ed|ing)?\b.{0,40}\b(vape|e-?cig|device|pod|flavou?r)/i,
  /\bannounces?( the)? launch\b/i,
  /\bproud to (announce|unveil)\b/i,
  /industry-first/i,
  /\bnow available\b.{0,30}\b(vape|e-?cig|pods?)/i,
  /\bnew flavou?r\b/i,
];

function isIndustryPressRelease(item) {
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '');
    if (PRESS_WIRE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  } catch {
    // malformed URL — let isBlocked() handle exclusion, not this check
  }
  return PRESS_RELEASE_TITLE_PATTERNS.some((re) => re.test(item.title));
}

function matchesKeywords(item, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const haystack = `${item.title} ${item.snippet}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

// Added 2026-09-12 after reviewing a batch of live auto-committed entries
// and a stale PR that surfaced the same patterns: violent/general crime
// stories where a vape shop or the word "tobacco" is only incidental (an
// armed robbery AT a vape shop, a firearm-possession sentencing that
// happened to match a Tobacco Google Alert), SEO/content-farm "ultimate
// guide" articles (thin, and a real risk of disguised product promotion —
// the same PECA advertising-risk concern isIndustryPressRelease() already
// guards against), device/brand product reviews, and garbled/truncated
// scrapes ("print this page", a bare tag name). Deliberately narrow and
// pattern-specific rather than blanket keyword bans on words like
// "arrested" or "smuggling" — a cigarette-smuggling or counterfeit-vape
// bust is a genuine tobacco-black-market/policy story and must stay in.
const OFF_TOPIC_CRIME_PATTERNS = [
  /\barmed robbery\b/i,
  /\b(first|second)[- ]degree murder\b/i,
  /\bpossessing (a |an )?firearms?\b/i,
  /\bon scene of a shooting\b/i,
  /\bshooting\b.{0,20}\b(scene|investigation)\b/i,
];

const SEO_GUIDE_SPAM_PATTERN = /\b(ultimate|comprehensive|proven|complete|definitive|science-backed)\s+guide\b/i;

// Added 2026-09-13 after an Altria stock-data "company hub" page (no real
// article, matched by a broad "e-cigarettes" Google Alert on the ticker)
// went live on the homepage. Google Alerts also surface individual
// social-media posts (a caption, not a news item) the same way — those are
// caught here by URL shape, unambiguously and regardless of domain, before
// spending an AI call on them. Deliberately NOT extended to generic
// tag/category/author/companies path segments: tried that, but real outlets
// use those words as ordinary URL taxonomy for genuine articles (Free
// Malaysia Today's permalinks all include "/category/nation/...", and SMH's
// include "/business/companies/..." for a real story) — path-shape alone
// can't distinguish a news-org's section URL from a stock-data ticker hub.
// The looksLikeNoContentSummary() check below is what actually catches
// those non-article index/hub pages instead, since a real article always
// has content to summarize and a hub page never does.
const NON_ARTICLE_URL_PATTERNS = [
  /linkedin\.com\/posts\//i,
  /tiktok\.com\/@[^/]+\/video\//i,
  /(twitter|x)\.com\/[^/]+\/status\//i,
  /instagram\.com\/(p|reel)\//i,
];

function isNonArticleUrl(url) {
  return NON_ARTICLE_URL_PATTERNS.some((re) => re.test(url));
}

// Same 2026-09-13 fix: a company "news & analysis" listing page's own title
// gives it away even when the URL shape above doesn't catch it.
const MARKET_DATA_TITLE_PATTERNS = [
  /\bnews\s*&\s*analysis\b/i,
  /\|\s*the markets\b/i,
  /^tag:/i,
];

// Last-resort net, independent of domain/URL/title shape: when the RSS
// snippet is empty or too thin to summarize, the AI politely says so
// rather than fabricating content — that admission is the most reliable
// signal of all that this isn't a real article, and catches shapes the
// checks above don't anticipate. Checked after the AI call, so this can't
// prevent that one API call, but it does stop the item from being
// published and the URL is still marked `seen` so it won't be retried.
const NO_CONTENT_SUMMARY_PATTERNS = [
  /no (specific )?(news )?content (was|is) provided/i,
  /not provided in the snippet/i,
  /please provide the actual/i,
  /details? (are|is) not provided/i,
  /no information available/i,
  /unable to summarize/i,
];

function looksLikeNoContentSummary(summary) {
  return NO_CONTENT_SUMMARY_PATTERNS.some((re) => re.test(summary));
}

// A genuine research "systematic review" / "literature review" / Cochrane
// review must never be caught by the product-review check below.
const RESEARCH_REVIEW_ALLOW_PATTERN = /\b(systematic|literature|scoping|narrative)\s+review\b|\bcochrane\b|\bmeta-analysis\b/i;

function isProductReviewTitle(title) {
  if (RESEARCH_REVIEW_ALLOW_PATTERN.test(title)) return false;
  if (!/\breview\b/i.test(title)) return false;
  if (/^review[:\-]/i.test(title)) return true;
  return /\b(disposable|vaporesso|aspire|geekbar|elf ?bar|lost mary|voopoo|uwell|smok|puff bar|pod|mod|kit|device)\b/i.test(title);
}

function isGarbledTitle(title) {
  const t = title.trim();
  if (!t) return true;
  if (/^print this page$/i.test(t)) return true;
  if (/^tag\b/i.test(t)) return true;
  return t.split(/\s+/).length < 3;
}

function isOffTopicJunk(item) {
  const title = item.title;
  if (isGarbledTitle(title)) return true;
  if (isProductReviewTitle(title)) return true;
  if (SEO_GUIDE_SPAM_PATTERN.test(title)) return true;
  return OFF_TOPIC_CRIME_PATTERNS.some((re) => re.test(title));
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
reviewed: true
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
      if (isIndustryPressRelease(item)) {
        console.log(`Skipped (industry press release): ${item.title}`);
        continue;
      }
      if (isOffTopicJunk(item)) {
        console.log(`Skipped (off-topic/low-quality title pattern): ${item.title}`);
        continue;
      }
      if (isNonArticleUrl(item.url) || MARKET_DATA_TITLE_PATTERNS.some((re) => re.test(item.title))) {
        console.log(`Skipped (not an article — social post, tag page or company market-data hub): ${item.title}`);
        continue;
      }
      if (!matchesKeywords(item, feed.keywordFilter)) {
        console.log(`Skipped (off-topic per keywordFilter): ${item.title}`);
        continue;
      }
      seen.add(item.url);
      const ai = await writeSummary(item);
      if (looksLikeNoContentSummary(ai.summary)) {
        console.log(`Skipped (AI reports no real content in snippet): ${item.title}`);
        continue;
      }
      const date = new Date(item.date);
      const filename = `${date.toISOString().slice(0, 10)}-${slugify(item.title)}.md`;
      fs.writeFileSync(path.join(CONTENT_DIR, filename), toFrontmatter(item, ai));
      written += 1;
      console.log(`Wrote draft: ${filename}`);
    }
  }
  console.log(`Done. ${written} new news entries written (reviewed: true — passed automated filters, no human gate).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
