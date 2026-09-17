#!/usr/bin/env node
/**
 * Fetches AVI's YouTube uploads from the channel's public RSS feed and
 * writes an entry per video under src/content/videos/. No AI step, no
 * review gate — this is just metadata about AVI's own already-published
 * videos (title, publish date, thumbnail), nothing that needs vetting.
 *
 * Also refreshes `viewCount` on every known video (not just ones in the
 * RSS feed, which only ever returns the latest 15) via the YouTube Data
 * API v3 (videos.list?part=statistics), so the "Most watched" ranking on
 * /media stays current rather than a one-time snapshot. Requires
 * YOUTUBE_API_KEY (see CLAUDE.md); if unset, the script still fetches new
 * videos as before and just skips the view-count refresh, logging why.
 *
 * Run via GitHub Action on a schedule (.github/workflows/fetch-youtube.yml).
 * Idempotent for new entries: skips any videoId already present in
 * src/content/videos/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const CHANNEL_ID = 'UCEgd8dgEScqYKKUBHwD1DDQ'; // Association of Vapers India
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CONTENT_DIR = path.join(process.cwd(), 'src/content/videos');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const STATS_BATCH_SIZE = 50; // videos.list max ids per request

// videoId -> filepath, for every video already written
function existingEntries() {
  const entries = new Map();
  if (!fs.existsSync(CONTENT_DIR)) return entries;
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    const filepath = path.join(CONTENT_DIR, file);
    const text = fs.readFileSync(filepath, 'utf-8');
    const m = text.match(/videoId:\s*"?([\w-]+)"?/);
    if (m) entries.set(m[1], filepath);
  }
  return entries;
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function jq(s) {
  return JSON.stringify(s);
}

// AVI's video descriptions repeat the same channel boilerplate (social
// links, donate pitch, PECA disclaimer) after a short video-specific
// intro. Take the text before that boilerplate starts, if there's enough
// of it to be useful; otherwise fall back to the schema default.
const BOILERPLATE_MARKERS = [
  'AVI is a non profit', 'AVI is a non-profit', '═╣', 'SOCIAL MEDIA',
  'For Full video', 'DISCLAIMER',
];
function extractSummary(description) {
  if (!description) return undefined;
  let text = description;
  for (const marker of BOILERPLATE_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx !== -1) text = text.slice(0, idx);
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length < 15) return undefined; // nothing usable before the boilerplate
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function toFrontmatter(video) {
  return `---
videoId: ${jq(video.videoId)}
title: ${jq(video.title)}
publishedDate: ${video.publishedDate}
thumbnailUrl: ${jq(video.thumbnailUrl)}
${video.summary ? `summary: ${jq(video.summary)}` : ''}
---
`;
}

// Sets or replaces the viewCount line in an already-written entry, leaving
// every other field untouched.
function updateViewCount(filepath, viewCount) {
  const text = fs.readFileSync(filepath, 'utf-8');
  if (/^viewCount:\s*\d+\s*$/m.test(text)) {
    const updated = text.replace(/^viewCount:\s*\d+\s*$/m, `viewCount: ${viewCount}`);
    if (updated !== text) fs.writeFileSync(filepath, updated);
    return;
  }
  const closeMatch = text.match(/\n---\s*\n/);
  if (!closeMatch) return; // malformed frontmatter, leave it alone
  const idx = closeMatch.index;
  const updated = `${text.slice(0, idx)}\nviewCount: ${viewCount}${text.slice(idx)}`;
  fs.writeFileSync(filepath, updated);
}

async function fetchViewCounts(videoIds) {
  const counts = new Map();
  if (!YOUTUBE_API_KEY || videoIds.length === 0) return counts;
  for (let i = 0; i < videoIds.length; i += STATS_BATCH_SIZE) {
    const batch = videoIds.slice(i, i + STATS_BATCH_SIZE);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(',')}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`YouTube stats fetch failed: ${res.status} ${await res.text()}`);
      continue; // don't fail the whole run over stats — new-video fetching still matters
    }
    const json = await res.json();
    for (const item of json.items ?? []) {
      const n = Number(item.statistics?.viewCount);
      if (Number.isFinite(n)) counts.set(item.id, n);
    }
  }
  return counts;
}

async function main() {
  const xml = await fetch(FEED_URL).then((r) => {
    if (!r.ok) throw new Error(`YouTube feed returned ${r.status}`);
    return r.text();
  });

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const feed = parser.parse(xml);
  const rawEntries = feed?.feed?.entry ?? [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  const existing = existingEntries();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let written = 0;

  for (const entry of entries) {
    const videoId = entry['yt:videoId'];
    if (!videoId || existing.has(videoId)) continue;

    const title = entry.title;
    const publishedDate = (entry.published ?? '').slice(0, 10); // YYYY-MM-DD
    const mediaGroup = entry['media:group'] ?? {};
    const thumbnailUrl = mediaGroup['media:thumbnail']?.['@_url']
      ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const summary = extractSummary(mediaGroup['media:description']);

    const filename = `${publishedDate}-${slugify(title)}.md`;
    const filepath = path.join(CONTENT_DIR, filename);
    if (fs.existsSync(filepath)) continue; // filename collision guard

    fs.writeFileSync(filepath, toFrontmatter({ videoId, title, publishedDate, thumbnailUrl, summary }));
    existing.set(videoId, filepath);
    written += 1;
    console.log(`Wrote: ${filename}`);
  }

  if (!YOUTUBE_API_KEY) {
    console.log('YOUTUBE_API_KEY not set — skipping view-count refresh.');
  } else {
    const viewCounts = await fetchViewCounts([...existing.keys()]);
    let refreshed = 0;
    for (const [videoId, filepath] of existing) {
      const count = viewCounts.get(videoId);
      if (count == null) continue;
      updateViewCount(filepath, count);
      refreshed += 1;
    }
    console.log(`Refreshed view counts for ${refreshed} of ${existing.size} known video(s).`);
  }

  console.log(`Done. ${written} new video entries written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
