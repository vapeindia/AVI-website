#!/usr/bin/env node
/**
 * Fetches AVI's YouTube uploads from the channel's public RSS feed and
 * writes an entry per video under src/content/videos/. No AI step, no
 * review gate — this is just metadata about AVI's own already-published
 * videos (title, publish date, thumbnail), nothing that needs vetting.
 *
 * Run via GitHub Action on a schedule (.github/workflows/fetch-youtube.yml).
 * Idempotent: skips any videoId already present in src/content/videos/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const CHANNEL_ID = 'UCEgd8dgEScqYKKUBHwD1DDQ'; // Association of Vapers India
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CONTENT_DIR = path.join(process.cwd(), 'src/content/videos');

function existingIds() {
  const ids = new Set();
  if (!fs.existsSync(CONTENT_DIR)) return ids;
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    const text = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const m = text.match(/videoId:\s*"?([\w-]+)"?/);
    if (m) ids.add(m[1]);
  }
  return ids;
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

async function main() {
  const xml = await fetch(FEED_URL).then((r) => {
    if (!r.ok) throw new Error(`YouTube feed returned ${r.status}`);
    return r.text();
  });

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const feed = parser.parse(xml);
  const rawEntries = feed?.feed?.entry ?? [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  const seen = existingIds();
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let written = 0;

  for (const entry of entries) {
    const videoId = entry['yt:videoId'];
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

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
    written += 1;
    console.log(`Wrote: ${filename}`);
  }

  console.log(`Done. ${written} new video entries written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
