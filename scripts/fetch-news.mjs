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
 * deduplicated (dedupeSyndicated()), keeping the earliest/most-original
 * publisher. Writes a paraphrased AI summary per item.
 *
 * As of a fix/pipelines hardening pass, this is a HYBRID, not fully
 * automated: an item only gets `reviewed: true` (auto-published, GitHub
 * Action commits straight to main) when it also comes from an outlet on
 * ALLOWLISTED_OUTLETS and clears every filter above. Everything else that
 * clears the filters — a named vape/tobacco brand (matchedReviewBrand(),
 * routed to review rather than blocked outright since a brand mention
 * isn't always an ad), a trade outlet that itself runs product advertising
 * (vapingpost.com and similar), or simply an outlet not on the allowlist
 * (most Google Alert results, since an Alert can surface any domain Google
 * indexes) — is written `reviewed: false` and reaches the site only via the
 * weekly review PR (see .github/workflows/fetch-news.yml), not main
 * directly. `reviewed: true` still means "passed the automated filters AND
 * is from a trusted outlet," not "a person checked this specific item" —
 * see the standing disclaimer on the News index page, which describes this
 * distinction. Scoped to `news` only; fetch-research.mjs and the
 * testimonials pipeline are separate and already require human review for
 * anything not auto-approved by their own rules.
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
// blocklist.json used to be a flat domain array; it's now an object with
// `domains` (hostname blocklist, unchanged behaviour), `rejectPatterns`
// (promotional-language auto-reject, added after two DOJO flavour-launch
// posts and similar went live) and `reviewBrands` (named vape brands that
// route to manual review instead of either publishing or rejecting outright
// — a brand mention isn't always an ad, e.g. a lawsuit or FDA action, so it
// gets a human glance rather than a blanket block). Support the old flat-
// array shape too, so a stale/hand-edited config doesn't crash the script.
const BLOCKLIST_RAW = loadJson('blocklist.json', { domains: [], rejectPatterns: [], reviewBrands: [] });
const BLOCKLIST = Array.isArray(BLOCKLIST_RAW) ? BLOCKLIST_RAW : (BLOCKLIST_RAW.domains ?? []);
const REJECT_PATTERNS = Array.isArray(BLOCKLIST_RAW) ? [] : (BLOCKLIST_RAW.rejectPatterns ?? []).map((p) => new RegExp(p, 'i'));
const REVIEW_BRANDS = Array.isArray(BLOCKLIST_RAW) ? [] : (BLOCKLIST_RAW.reviewBrands ?? []);
const PRESS_WIRE_DOMAINS = loadJson('press-wire-domains.json', []);

// Established outlets whose own editorial process is trusted enough to
// auto-publish once an item has passed every other filter below. Everything
// else — including every other domain a broad Google Alert can surface —
// is written as a reviewed:false draft instead of published outright; see
// main() and .github/workflows/fetch-news.yml for how those drafts reach a
// weekly review PR rather than main directly.
const ALLOWLISTED_OUTLETS = [
  'reuters.com', 'ptinews.com', 'thehindu.com', 'indianexpress.com',
  'theprint.in', 'hindustantimes.com', 'timesofindia.indiatimes.com',
  'economictimes.indiatimes.com', 'livemint.com', 'scroll.in', 'ndtv.com',
  'bmj.com', 'nature.com', 'filtermag.org',
];

function isAllowlistedOutlet(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ALLOWLISTED_OUTLETS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
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

function matchedReviewBrand(item) {
  const haystack = `${item.title} ${item.snippet}`;
  return REVIEW_BRANDS.find((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)) ?? null;
}

function isBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKLIST.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return true; // malformed URL — exclude rather than guess
  }
}

// Added 2026-09-13: a specific e-cig brand's own product page
// (whitecloudelectroniccigarettes.com/cirrus-rechargeable-ecig) went live,
// surfaced the same way any vendor page can be — a broad "e-cigarettes"
// Google Alert doesn't care whose site uses the term. Added that one
// domain to blocklist.json too, but an enumerated domain list will always
// lag every new vendor site Google indexes. This is a narrow backstop for
// hostnames that announce what they are: compound vendor-category words
// checked against every current feeds.json/blocklist.json entry first to
// avoid a false positive (deliberately NOT "vape" alone, which would wrongly
// catch vapers.org.uk and vapingpost.com).
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

// Added 2026-09-13: found six live "quit vaping guide" news entries whose
// sourceUrl was actually a `pannellum.htm?config=...` open redirect on a
// compromised third-party server (a University of Tokyo research-institute
// subdomain, a personal site) pointing at video.unkk.top — an SEO-poisoning
// technique that abuses a trusted domain's search authority to rank scam
// pages. These predate the SEO_GUIDE_SPAM_PATTERN title filter below (added
// later the same day) and slipped through before it existed, but title
// matching alone is too fragile against a campaign that's clearly varying
// its wording ("Science Backed Ultimate Guide", "Proven Guide", "Complete
// Guide") — the URL shape itself is the unambiguous signature, checked
// directly here rather than relying on any title pattern to catch it.
// Not folded into BLOCKLIST/isBlocked(): that's a hostname allowlist check
// against known vendor domains, and the abused hosts here are innocent,
// unrelated domains each time — the fingerprint is the URL shape, not who
// owns it.
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

// Every item must mention an actual tobacco/nicotine/vaping term somewhere
// in the title or snippet — added after the "PECA 2019" Google Alert
// (which has no per-feed keywordFilter, unlike the Filter/GFN feed) matched
// an NHL player's surname, Matthew Peca, with zero tobacco relevance
// anywhere in the story. This is a floor that applies to every feed,
// Google Alerts included, regardless of whether that feed also defines its
// own keywordFilter below.
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
// Same day, same root cause: two ProBoards forum-thread posts and one
// XenForo-style forum post (e-cigarette-forum.com) were also live — an
// individual user's discussion-board post is exactly as non-editorial as a
// social-media caption, just running on older forum software. Detected the
// same way: by URL shape, not content, since a forum thread/post URL is an
// unambiguous shape regardless of what community runs it.
// Tried adding a facebook.com/<page>/posts/ pattern here too (a Delray
// Beach PD community post slipped through the same day) but reverted it:
// unlike the other platforms above, Facebook posts in this feed are often
// a real news org's own distribution of a real, substantive story (a
// Houston TV station, a Philippine outlet) — the URL shape alone doesn't
// distinguish that from a random community page's post. The one bad case
// was already caught by looksLikeNoContentSummary() below regardless
// (its AI summary said "Unable to provide summary..."), so no separate
// URL rule was actually needed for it.
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
// Broadened same day: a fifth live entry's summary read "The snippet
// provided does not contain sufficient content to create a meaningful
// summary" — different phrasing from every pattern below, so it slipped
// through. Added a more general pattern (any "no/does-not-X content-word"
// construction near a summarizing word) rather than one more exact phrase,
// since the AI clearly doesn't repeat itself verbatim across these and a
// growing list of exact strings will always be one phrasing behind.
// Broadened again 2026-09-13: a Filter/GFN item about prison re-entry
// support was deleted as off-topic earlier the same day, then reappeared
// on the very next scheduled run — deleting a published entry doesn't
// blocklist its URL, so an item whose RSS snippet happens to mention a
// stray keyword (enough to pass the feed's own keywordFilter) will keep
// coming back. Its own AI summary said so plainly both times ("This
// article is not relevant to tobacco harm reduction advocacy"), just in
// off-topic language rather than no-content language — added a second
// pattern group for that self-admission specifically.
const OFF_TOPIC_SELF_ADMISSION_PATTERNS = [
  // 2026-09-16: the exact same prison re-entry article this block was
  // originally written for (see the 2026-09-13 note above) came back a
  // THIRD time — its AI summary said "is not related to tobacco harm
  // reduction" this run, which the original relevant-only pattern missed
  // entirely. Broadened to catch "related"/"relevant" as a pair, and
  // dropped the requirement that the topic phrase immediately follow —
  // AI phrasing varies ("not relevant to X", "not related to X",
  // "X... is not relevant", etc.) more than a fixed-order regex can
  // chase. If this recurs again, the lesson from last time still holds:
  // broaden the content-based check, don't special-case the URL.
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

// Must match the `topic` enum in src/content.config.ts exactly, and
// `SUMMARY_MAX` the news `summary` field's z.string().max(400) — this is
// the guardrail that stops a malformed AI response from reaching disk and
// breaking the whole site build (Astro's getCollection() fails the ENTIRE
// build on one bad entry — this happened for real once already, via an
// unvalidated enum value in the `research` collection's generator; see
// that script for the fuller account). Don't remove this to "simplify".
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

function toFrontmatter(item, ai, reviewed) {
  const date = new Date(item.date);
  return `---
title: ${JSON.stringify(item.title)}
date: ${date.toISOString().slice(0, 10)}
sourceName: ${JSON.stringify(item.sourceName)}
sourceUrl: ${JSON.stringify(item.url)}
summary: ${JSON.stringify(clampSummary(ai.summary, SUMMARY_MAX))}
topic: ${JSON.stringify(ai.topic)}
reviewed: ${reviewed}
---
`;
}

// Syndicated copies of one wire story (the same nicotine-pouch story ran
// under five different outlet bylines on 25-26 Sep once) cluster here by a
// normalized title signature — lowercased, punctuation stripped, common
// stopwords dropped, remaining significant words sorted so word-order
// differences between outlets' headlines don't defeat the match — plus a
// 72-hour date window. Within a cluster, keep whichever item is both dated
// earliest AND from an allowlisted outlet when one exists (a syndicator
// often reposts a wire story a few hours after the original with an
// identical or near-identical pubDate, so earliest-alone isn't a reliable
// tiebreaker); otherwise just the earliest.
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
    const sorted = [...cluster.items].sort((a, b) => a.time - b.time);
    const allowlistedFirst = sorted.find((x) => isAllowlistedOutlet(x.item.url));
    const winner = allowlistedFirst ?? sorted[0];
    kept.push(winner.item);
    console.log(`Deduped ${cluster.items.length} syndicated copies of "${winner.item.title}" — kept ${winner.item.url}`);
  }
  return kept;
}

async function main() {
  const seen = existingUrls();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let publishedCount = 0;
  let reviewCount = 0;

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
    if (isBlocked(item.url)) {
      console.log(`Blocked (commercial domain): ${item.url}`);
      continue;
    }
    if (isVendorHostname(item.url)) {
      console.log(`Blocked (vendor-shaped hostname): ${item.url}`);
      continue;
    }
    if (isSuspiciousRedirectUrl(item.url)) {
      console.log(`Blocked (spam/open-redirect URL shape): ${item.url}`);
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
    if (isMarketResearch(item.title)) {
      console.log(`Skipped (market-research/brand-ranking report): ${item.title}`);
      continue;
    }
    if (!isRelevant(item)) {
      console.log(`Skipped (no tobacco/nicotine/vaping term in title or snippet): ${item.title}`);
      continue;
    }
    if (!matchesKeywords(item, item.keywordFilter)) {
      console.log(`Skipped (off-topic per keywordFilter): ${item.title}`);
      continue;
    }
    const rejectHit = matchesRejectPattern(item);
    if (rejectHit) {
      console.log(`Blocked (promotional-language pattern ${rejectHit}): ${item.title}`);
      continue;
    }

    seen.add(item.url);
    const ai = await writeSummary(item);
    if (looksLikeNoContentSummary(ai.summary)) {
      console.log(`Skipped (AI reports no real content in snippet): ${item.title}`);
      continue;
    }

    // Needs-review routing: a named vape/tobacco brand (could be a lawsuit
    // or FDA action, not necessarily an ad — a human should glance at it),
    // a trade outlet that itself carries product advertising, or any
    // outlet not on the trusted allowlist — which, for the Google Alerts
    // feeds especially, is most items, since an Alert can surface any
    // domain Google indexes. Only an allowlisted outlet that also clears
    // every filter above auto-publishes; everything else becomes a
    // reviewed:false draft for the weekly review PR (see
    // .github/workflows/fetch-news.yml) rather than main directly.
    const brandHit = matchedReviewBrand(item);
    const isTradeOutletWithAds = PRESS_WIRE_DOMAINS.some((d) => { try { return new URL(item.url).hostname.replace(/^www\./, '').endsWith(d); } catch { return false; } }) || /vapingpost\.com$/i.test(new URL(item.url).hostname);
    const allowlisted = isAllowlistedOutlet(item.url);
    const needsReview = !!brandHit || isTradeOutletWithAds || !allowlisted;

    const date = new Date(item.date);
    const filename = `${date.toISOString().slice(0, 10)}-${slugify(item.title)}.md`;
    fs.writeFileSync(path.join(CONTENT_DIR, filename), toFrontmatter(item, ai, !needsReview));
    if (needsReview) {
      reviewCount += 1;
      const why = brandHit ? `named brand "${brandHit}"` : isTradeOutletWithAds ? 'trade outlet running product ads' : 'outlet not on the trusted allowlist';
      console.log(`Wrote for review (${why}): ${filename}`);
    } else {
      publishedCount += 1;
      console.log(`Wrote draft: ${filename}`);
    }
  }
  console.log(`Done. ${publishedCount} entries auto-published (reviewed: true — allowlisted outlet, passed every automated filter), ${reviewCount} entries written for weekly human review (reviewed: false).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
