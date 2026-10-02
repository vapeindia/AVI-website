#!/usr/bin/env node
/**
 * Pulls candidate news items from RSS feeds (Google Alerts + outlet feeds
 * listed in feeds.json), filters out commercial/vendor domains (PECA
 * advertising-risk guard — blocklist.json plus a hostname-substring
 * backstop for vendor sites not yet enumerated there, see
 * isVendorHostname() below), spam/open-redirect URLs (see
 * isSuspiciousRedirectUrl() below — a compromised third-party server abused
 * to rank scam "quit vaping" pages), industry press releases
 * (press-wire-domains.json + launch-language title patterns — see
 * isIndustryPressRelease() below), off-topic items whose title+snippet
 * match none of a feed's `keywordFilter` array (e.g. Filter/GFN's feed
 * covers all drug policy, not just tobacco/nicotine), and non-article
 * pages a broad company-name/ticker alert can still surface — a
 * social-media post, a forum thread/post, a tag/category index page, or a
 * stock-data "company hub" page with no real story (see
 * NON_ARTICLE_URL_PATTERNS / MARKET_DATA_TITLE_PATTERNS / the post-summary
 * looksLikeNoContentSummary() check below), market-research/brand-ranking
 * wire reports (isMarketResearch()), and items with no actual tobacco/
 * nicotine/vaping term anywhere in the title or snippet (isRelevant() — the
 * floor that stops a loosely-matching Google Alert, e.g. "PECA 2019"
 * surfacing an NHL player named Peca, from reaching this far at all).
 * Syndicated copies of one wire story across multiple outlets are
 * deduplicated (dedupeSyndicated()), keeping the earliest.
 *
 * Direct-to-main, no review gate (per Samrat, 2026-10-02): an item that
 * clears every filter is written reviewed: true and committed straight to
 * main. Everything the filters reject is dropped and logged to
 * data/rejected-log.json instead of being written as a draft — there's no
 * review PR to send it to. A brand name may appear in a headline (it's the
 * original outlet's own wording, not AVI's), but the AI-written summary
 * must not name one — checked after generation; if it does, the whole item
 * is rejected and logged rather than published with an edited summary.
 * `sourceName` is the real publisher for every item, including Google
 * Alert results — resolved from the article's own URL, never shown as
 * "Google Alert" (see publisherNameForUrl() below).
 *
 * Requires ANTHROPIC_API_KEY env var. Run via GitHub Action on a schedule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { logRejected } from './lib/rejected-log.mjs';

const CONTENT_DIR = path.join(process.cwd(), 'src/content/news');
const CONFIG_DIR = path.join(process.cwd(), 'scripts/config');

function loadJson(file, fallback) {
  const p = path.join(CONFIG_DIR, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback;
}

const FEEDS = loadJson('feeds.json', []);
// blocklist.json used to be a flat domain array; it's now an object with
// `domains` (hostname blocklist, unchanged behaviour), `rejectPatterns`
// (promotional-language auto-reject) and `reviewBrands` (named vape/
// tobacco brands — no longer a routing signal for the item as a whole, see
// isBrandInSummary() below, which checks only the AI-written summary).
// Support the old flat-array shape too, so a stale/hand-edited config
// doesn't crash the script.
const BLOCKLIST_RAW = loadJson('blocklist.json', { domains: [], rejectPatterns: [], reviewBrands: [] });
const BLOCKLIST = Array.isArray(BLOCKLIST_RAW) ? BLOCKLIST_RAW : (BLOCKLIST_RAW.domains ?? []);
const REJECT_PATTERNS = Array.isArray(BLOCKLIST_RAW) ? [] : (BLOCKLIST_RAW.rejectPatterns ?? []).map((p) => new RegExp(p, 'i'));
const REVIEW_BRANDS = Array.isArray(BLOCKLIST_RAW) ? [] : (BLOCKLIST_RAW.reviewBrands ?? []);
const PRESS_WIRE_DOMAINS = loadJson('press-wire-domains.json', []);

// Known outlet hostnames → a real display name, for Google Alert results
// (whose `sourceName` would otherwise be the generic alert label, e.g.
// "Google Alert: e-cigarette India"). Anything not listed here falls back
// to hostnameToDisplayName() below rather than needing every domain
// enumerated up front.
const OUTLET_DISPLAY_NAMES = {
  'reuters.com': 'Reuters',
  'ptinews.com': 'PTI',
  'thehindu.com': 'The Hindu',
  'indianexpress.com': 'The Indian Express',
  'theprint.in': 'ThePrint',
  'hindustantimes.com': 'Hindustan Times',
  'timesofindia.indiatimes.com': 'The Times of India',
  'economictimes.indiatimes.com': 'The Economic Times',
  'livemint.com': 'Mint',
  'scroll.in': 'Scroll.in',
  'ndtv.com': 'NDTV',
  'bmj.com': 'The BMJ',
  'nature.com': 'Nature',
  'filtermag.org': 'Filter',
  'vapingpost.com': 'Vaping Post',
  'vapers.org.uk': 'Vapers Digest',
  'clearingtheair.eu': 'Clearing the Air',
  'quitlikesweden.org': 'Quit Like Sweden',
  'clivebates.com': 'Clive Bates',
};

function hostnameToDisplayName(host) {
  const label = host.replace(/^www\./, '').split('.')[0];
  return label.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Direct-outlet feeds (Filter, Vaping Post, etc.) already carry their real
// name in feeds.json — only a Google Alert result needs its publisher
// resolved from the article's own URL, since one Alert surfaces many
// different outlets.
function publisherNameForUrl(url, feedName) {
  if (!feedName.startsWith('Google Alert')) return feedName;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, name] of Object.entries(OUTLET_DISPLAY_NAMES)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
    return hostnameToDisplayName(host);
  } catch {
    return feedName;
  }
}

// These specific words are legitimate in an enforcement/crime story about a
// vape shop ("police raided a vape store", "customs seized stock from an
// e-cigarette shop") — exactly the kind of policy-relevant news this feed
// should keep, not promotional copy. Reject only when no such context is
// present; flavour/puff-count/pod/coil/launch-type patterns don't get this
// exception since they essentially never appear in a genuine enforcement
// story.
const COMMERCIAL_WORDS_NEEDING_CONTEXT = new Set(['buy', 'shop', 'shops', 'store', 'stores', 'price', 'prices', 'offer', 'offers', 'discount', 'discounts']);
const ENFORCEMENT_CONTEXT_PATTERN = /\b(police|raid(ed)?|seiz(e|ed|ure)|arrest(ed)?|bust(ed)?|sealed|crackdown|confiscat(e|ed|ion)|illegal|smuggl(e|ed|ing)|customs|court|sentenc(e|ed|ing)|fine(d)?|prosecut(e|ed|ion))\b/i;

function matchesRejectPattern(item) {
  const haystack = `${item.title} ${item.snippet}`;
  for (const re of REJECT_PATTERNS) {
    const m = re.exec(haystack);
    if (!m) continue;
    const word = m[0].toLowerCase().replace(/s$/, '');
    if (COMMERCIAL_WORDS_NEEDING_CONTEXT.has(m[0].toLowerCase()) || COMMERCIAL_WORDS_NEEDING_CONTEXT.has(word)) {
      if (ENFORCEMENT_CONTEXT_PATTERN.test(haystack)) continue; // legitimate enforcement story, not a promo
    }
    return re;
  }
  return null;
}

// Checked against the AI-written summary only, never the headline — a real
// outlet's own headline naming a brand (an FDA action, a lawsuit) is fine
// to show verbatim; AVI's own derived summary must not name one.
function brandInText(text) {
  return REVIEW_BRANDS.find((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) ?? null;
}

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKLIST.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return true; // malformed URL — exclude rather than guess
  }
}

// A specific e-cig brand's own product page went live once, surfaced the
// same way any vendor page can be — a broad "e-cigarettes" Google Alert
// doesn't care whose site uses the term. That one domain is in
// blocklist.json too, but an enumerated domain list will always lag every
// new vendor site Google indexes. This is a narrow backstop for hostnames
// that announce what they are: compound vendor-category words checked
// against every current feeds.json/blocklist.json entry first to avoid a
// false positive (deliberately NOT "vape" alone, which would wrongly catch
// vapers.org.uk and vapingpost.com).
const VENDOR_HOSTNAME_SUBSTRINGS = [
  'electroniccigarette',
  'ecigarettestore',
  'vapeshop',
  'vapestore',
  'vapewholesale',
  'ecigwholesale',
  'buyvape',
  'eliquid',
  'ejuice',
  'e-liquid',
  'e-juice',
];

function isVendorHostname(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return VENDOR_HOSTNAME_SUBSTRINGS.some((s) => host.includes(s));
  } catch {
    return false;
  }
}

// A handful of live "quit vaping guide" entries once turned out to have a
// `pannellum.htm?config=...` open redirect on a compromised third-party
// server as their sourceUrl — an SEO-poisoning technique abusing a trusted
// domain's search authority to rank scam pages. Title matching alone is
// too fragile against a campaign that varies its wording, so the URL shape
// itself is checked directly.
const SUSPICIOUS_REDIRECT_URL_PATTERNS = [
  /pannellum\.htm\?config=/i,
  /unkk\.top/i,
];

function isSuspiciousRedirectUrl(url) {
  return SUSPICIOUS_REDIRECT_URL_PATTERNS.some((re) => re.test(url));
}

// Industry product-launch press releases (new device/flavour announcements,
// "proud to unveil" copy) carry PECA advertising risk and aren't the kind of
// coverage this feed is for — distinct from genuine reporting ABOUT the
// industry (a trade body's regulatory response, a lawsuit, a market-size
// story), which stays in. Two signals: known PR-wire distribution domains,
// or launch-announcement language in the title itself.
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

// Every item must mention an actual tobacco/nicotine/vaping term somewhere
// in the title or snippet — a floor that applies to every feed, Google
// Alerts included, regardless of whether that feed also defines its own
// keywordFilter.
const RELEVANCE_TERMS = /\b(nicotine|tobacco|cigarette|e-?cigarette|vap(e|es|ing|er|ers)|ENDS|smokeless|snus|nicotine pouch(es)?|heated tobacco|HTP|bidi(s)?|khaini|gutk?h?a|hookah|waterpipe|PECA)\b/i;

function isRelevant(item) {
  return RELEVANCE_TERMS.test(`${item.title} ${item.snippet}`);
}

// Market-research/brand-ranking wire content ("Market Forecast to 2035",
// "Top N Tobacco Brands...") — genuine news coverage ABOUT the industry
// (a lawsuit, a regulatory action, a market-size figure cited inside a
// policy story) stays in; a standalone market-research report doesn't.
const MARKET_RESEARCH_TITLE_PATTERNS = [
  /\bmarket (forecast|report|size|growth|analysis|outlook)\b/i,
  /\bindustry report\b/i,
  /\btop\s+\d+\s+.{0,30}\bbrands?\b/i,
  /\bmarket is growing\b/i,
  /\bcagr\b/i,
];

function isMarketResearch(title) {
  return MARKET_RESEARCH_TITLE_PATTERNS.some((re) => re.test(title));
}

function matchesKeywords(item, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const haystack = `${item.title} ${item.snippet}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

// Violent/general crime stories where a vape shop or the word "tobacco" is
// only incidental (an armed robbery AT a vape shop, a firearm-possession
// sentencing that happened to match a Tobacco Google Alert), SEO/content-
// farm "ultimate guide" articles, device/brand product reviews, and
// garbled/truncated scrapes ("print this page", a bare tag name).
// Deliberately narrow and pattern-specific rather than blanket keyword bans
// on words like "arrested" or "smuggling" — a cigarette-smuggling or
// counterfeit-vape bust is a genuine tobacco-black-market/policy story and
// must stay in.
const OFF_TOPIC_CRIME_PATTERNS = [
  /\barmed robbery\b/i,
  /\b(first|second)[- ]degree murder\b/i,
  /\bpossessing (a |an )?firearms?\b/i,
  /\bon scene of a shooting\b/i,
  /\bshooting\b.{0,20}\b(scene|investigation)\b/i,
];

const SEO_GUIDE_SPAM_PATTERN = /\b(ultimate|comprehensive|proven|complete|definitive|science-backed)\s+guide\b/i;

// Google Alerts also surface individual social-media posts (a caption, not
// a news item), forum threads, and non-article index/hub pages. Caught
// here by URL shape, unambiguously and regardless of domain, before
// spending an AI call on them. Deliberately NOT extended to generic
// tag/category/author/companies path segments — real outlets use those
// words as ordinary URL taxonomy for genuine articles. A Facebook post
// pattern was tried and reverted too: unlike the other platforms, this
// feed's Facebook links are often a real news org's own distribution of a
// substantive story, so the URL shape alone can't tell them apart —
// looksLikeNoContentSummary() below catches a genuinely empty one anyway.
const NON_ARTICLE_URL_PATTERNS = [
  /linkedin\.com\/posts\//i,
  /tiktok\.com\/@[^/]+\/video\//i,
  /(twitter|x)\.com\/[^/]+\/status\//i,
  /instagram\.com\/(p|reel)\//i,
  /proboards\.com/i,
  /\/threads?\/[^/]+\.\d+\/(post-\d+)?/i, // XenForo/vBulletin-style forum thread+post URLs
];

function isNonArticleUrl(url) {
  return NON_ARTICLE_URL_PATTERNS.some((re) => re.test(url));
}

// A company "news & analysis" listing page's own title gives it away even
// when the URL shape above doesn't catch it.
const MARKET_DATA_TITLE_PATTERNS = [
  /\bnews\s*&\s*analysis\b/i,
  /\|\s*the markets\b/i,
  /^tag:/i,
];

// Last-resort net, independent of domain/URL/title shape: when the RSS
// snippet is empty or too thin to summarize, the AI politely says so
// rather than fabricating content — the most reliable signal that this
// isn't a real article. Checked after the AI call, so this can't prevent
// that one API call, but it does stop the item from being published.
const OFF_TOPIC_SELF_ADMISSION_PATTERNS = [
  /not (relevant|related) to (tobacco harm reduction|this (site|page|topic))/i,
  /(is|was|be) not (relevant|related) to/i,
  /falls? outside (the )?scope/i,
  /outside the scope of/i,
  /does not (pertain|relate) to/i,
];

const NO_CONTENT_SUMMARY_PATTERNS = [
  /\bno\b.{0,25}\bcontent\b.{0,60}\b(summar|snippet|provided|available)\b/i,
  /does not (contain|provide|have)\b.{0,40}\b(content|information|details?|context)\b/i,
  /details? (are|is) not provided/i,
  /not provided in the snippet/i,
  /please provide the actual/i,
  /no information available/i,
  ...OFF_TOPIC_SELF_ADMISSION_PATTERNS,
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

function offTopicReason(item) {
  const title = item.title;
  if (isGarbledTitle(title)) return 'garbled/truncated title';
  if (isProductReviewTitle(title)) return 'device/brand product review';
  if (SEO_GUIDE_SPAM_PATTERN.test(title)) return 'SEO "ultimate guide" spam pattern';
  const crimeHit = OFF_TOPIC_CRIME_PATTERNS.find((re) => re.test(title));
  if (crimeHit) return 'incidental mention in an unrelated crime story';
  return null;
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

async function fetchFeed(feedUrl, feedName) {
  const xml = await fetch(feedUrl).then((r) => r.text());
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.filter(Boolean).map((item) => {
    const url = unwrapGoogleRedirect(item.link?.['@_href'] ?? item.link ?? '');
    return {
      title: cleanText(item.title?.['#text'] ?? item.title ?? ''),
      url,
      date: item.pubDate ?? item.published ?? new Date().toISOString(),
      snippet: cleanText(item.description ?? item.summary ?? '').slice(0, 1000),
      sourceName: publisherNameForUrl(url, feedName),
    };
  });
}

// Must match the `topic` enum in src/content.config.ts exactly, and
// `SUMMARY_MAX` the news `summary` field's z.string().max(400) — this is
// the guardrail that stops a malformed AI response from reaching disk and
// breaking the whole site build (Astro's getCollection() fails the ENTIRE
// build on one bad entry). Don't remove this to "simplify".
const VALID_TOPICS = new Set(['policy', 'litigation', 'science', 'industry', 'other']);
const SUMMARY_MAX = 400;

function clampSummary(str, max) {
  const s = String(str ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

// Deliberately does NOT clamp `summary` here — looksLikeNoContentSummary()
// downstream needs to see the AI's full, unclamped text to catch a
// self-admitted off-topic/no-content response reliably. Length is only
// clamped right before writing to disk, in toFrontmatter().
function sanitizeSummary(ai, fallbackSnippet) {
  const topic = VALID_TOPICS.has(ai.topic) ? ai.topic : 'other';
  const summary = String(ai.summary || fallbackSnippet).trim();
  return { summary, topic };
}

async function writeSummary(item) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const prompt = `Write a neutral, paraphrased 1-2 sentence summary (max 400 characters, your own words, no verbatim quoting) of this news item for a tobacco-harm-reduction advocacy news page in India. Never name a specific product brand, even if the source headline does — describe it by category instead (e.g. "a vaping brand", "a heat-not-burn device"). Also classify its topic as one of: policy, litigation, science, industry, other.

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
  let ai;
  try {
    ai = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    ai = { summary: item.snippet, topic: 'other' };
  }
  return sanitizeSummary(ai, item.snippet.slice(0, 300));
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
summary: ${JSON.stringify(clampSummary(ai.summary, SUMMARY_MAX))}
topic: ${JSON.stringify(ai.topic)}
reviewed: true
---
`;
}

// Syndicated copies of one wire story cluster here by a normalized title
// signature — lowercased, punctuation stripped, common stopwords dropped,
// remaining significant words sorted so word-order differences between
// outlets' headlines don't defeat the match — plus a 72-hour date window.
// Within a cluster, keep whichever item is dated earliest.
const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'is', 'are', 'was', 'were', 'as', 'it', 'its', 'after', 'over', 'amid']);

function titleSignature(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return [...new Set(words)].sort().join(' ');
}

function dedupeSyndicated(items) {
  const clusters = [];
  for (const item of items) {
    const sig = titleSignature(item.title);
    const itemTime = new Date(item.date).getTime();
    const cluster = clusters.find((c) => c.sig === sig && Math.abs(c.items[0].time - itemTime) < 72 * 3600_000);
    if (cluster) {
      cluster.items.push({ item, time: itemTime });
    } else {
      clusters.push({ sig, items: [{ item, time: itemTime }] });
    }
  }
  const kept = [];
  for (const cluster of clusters) {
    if (cluster.items.length === 1) {
      kept.push(cluster.items[0].item);
      continue;
    }
    const winner = [...cluster.items].sort((a, b) => a.time - b.time)[0];
    kept.push(winner.item);
    console.log(`Deduped ${cluster.items.length} syndicated copies of "${winner.item.title}" — kept ${winner.item.url}`);
  }
  return kept;
}

function reject(item, reason) {
  console.log(`Rejected (${reason}): ${item.title}`);
  logRejected({ feed: 'news', title: item.title, url: item.url, reason });
}

async function main() {
  const seen = existingUrls();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let publishedCount = 0;
  let rejectedCount = 0;

  // Phase 1: gather every candidate from every feed before filtering, so
  // cross-feed syndicated duplicates (the same wire story via two different
  // outlets' RSS) can be caught by dedupeSyndicated() below — a per-feed
  // loop could never see across feeds.
  let allItems = [];
  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed.url, feed.name);
      allItems.push(...items.map((it) => ({ ...it, keywordFilter: feed.keywordFilter })));
    } catch (err) {
      console.error(`Feed failed: ${feed.name} — ${err.message}`);
    }
  }
  allItems = allItems.filter((item) => item.url && !seen.has(item.url));
  allItems = dedupeSyndicated(allItems);

  for (const item of allItems) {
    if (seen.has(item.url)) continue; // dedup may have re-surfaced an already-written URL as a cluster loser

    if (isBlocked(item.url)) { reject(item, 'commercial/vendor domain'); rejectedCount++; continue; }
    if (isVendorHostname(item.url)) { reject(item, 'vendor-shaped hostname'); rejectedCount++; continue; }
    if (isSuspiciousRedirectUrl(item.url)) { reject(item, 'spam/open-redirect URL shape'); rejectedCount++; continue; }
    if (isIndustryPressRelease(item)) { reject(item, 'industry press release'); rejectedCount++; continue; }
    const offTopic = offTopicReason(item);
    if (offTopic) { reject(item, offTopic); rejectedCount++; continue; }
    if (isNonArticleUrl(item.url) || MARKET_DATA_TITLE_PATTERNS.some((re) => re.test(item.title))) {
      reject(item, 'not an article — social post, forum thread, tag page or market-data hub'); rejectedCount++; continue;
    }
    if (isMarketResearch(item.title)) { reject(item, 'market-research/brand-ranking report'); rejectedCount++; continue; }
    if (!isRelevant(item)) { reject(item, 'no tobacco/nicotine/vaping term in title or snippet'); rejectedCount++; continue; }
    if (!matchesKeywords(item, item.keywordFilter)) { reject(item, 'off-topic per feed keywordFilter'); rejectedCount++; continue; }
    const rejectHit = matchesRejectPattern(item);
    if (rejectHit) { reject(item, `promotional-language pattern ${rejectHit}`); rejectedCount++; continue; }

    seen.add(item.url);
    const ai = await writeSummary(item);
    if (looksLikeNoContentSummary(ai.summary)) {
      reject(item, 'AI reports no real content in snippet'); rejectedCount++; continue;
    }
    const brandHit = brandInText(ai.summary);
    if (brandHit) {
      reject(item, `AI summary named a brand ("${brandHit}") despite the prompt`); rejectedCount++; continue;
    }

    const date = new Date(item.date);
    const filename = `${date.toISOString().slice(0, 10)}-${slugify(item.title)}.md`;
    fs.writeFileSync(path.join(CONTENT_DIR, filename), toFrontmatter(item, ai));
    publishedCount += 1;
    console.log(`Published: ${filename}`);
  }
  console.log(`Done. ${publishedCount} entries published to main, ${rejectedCount} rejected and logged to data/rejected-log.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
