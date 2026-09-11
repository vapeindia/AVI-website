#!/usr/bin/env node
/**
 * Once an ISO week (Monday-Sunday) has fully elapsed, roll its daily news
 * digests + reviewed news items up into a single weekly digest paragraph,
 * so the News index can collapse that week to one card (expandable to the
 * daily breakdown underneath — see src/pages/news/index.astro). Writes
 * src/content/news-digests/<week-monday>.md with `type: weekly`.
 *
 * Only ever processes weeks that are already over — never the current,
 * still-forming week — and only reviewed:true news items, so a weekly
 * rollup never surfaces something a human hasn't already approved. Like
 * fetch-news.mjs/fetch-research.mjs, this doesn't commit straight to
 * main: the GitHub Action wraps it in a PR for review before it merges.
 *
 * Requires ANTHROPIC_API_KEY env var. Run via GitHub Action on a schedule
 * (weekly, after the week in question has ended).
 */
import fs from 'node:fs';
import path from 'node:path';

const NEWS_DIR = path.join(process.cwd(), 'src/content/news');
const DIGEST_DIR = path.join(process.cwd(), 'src/content/news-digests');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    val = val.trim();
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (/^".*"$/.test(val)) val = JSON.parse(val);
    fm[key] = val;
  }
  return fm;
}

// Monday of the ISO week containing `date`, at midnight UTC.
function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday -> 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function loadNewsItems() {
  if (!fs.existsSync(NEWS_DIR)) return [];
  return fs.readdirSync(NEWS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = parseFrontmatter(fs.readFileSync(path.join(NEWS_DIR, f), 'utf-8'));
      return { file: f, ...fm };
    })
    .filter((item) => item.reviewed === true && item.date);
}

function loadExistingDigests() {
  if (!fs.existsSync(DIGEST_DIR)) return { daily: new Map(), weekly: new Set() };
  const daily = new Map();
  const weekly = new Set();
  for (const f of fs.readdirSync(DIGEST_DIR)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFrontmatter(fs.readFileSync(path.join(DIGEST_DIR, f), 'utf-8'));
    if (fm.type === 'weekly') {
      // Weekly files are named <monday>-week.md — the -week suffix is what
      // keeps them from colliding with a daily file when the week's only
      // day of news happens to fall on that Monday.
      weekly.add(f.replace(/-week\.md$/, ''));
    } else {
      daily.set(f.replace(/\.md$/, ''), fm.summary);
    }
  }
  return { daily, weekly };
}

async function writeWeeklySummary(weekStartKey, weekEndKey, items, dailySummaries) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const lines = items.map((it) => `- [${it.date}] (${it.topic ?? 'other'}) ${it.title}: ${it.summary ?? ''}`);
  const dailyLines = [...dailySummaries.entries()].map(([d, s]) => `- [${d}] ${s}`);

  const prompt = `Write a neutral, paraphrased weekly roundup paragraph (max 550 characters, your own words, no verbatim quoting) for a tobacco-harm-reduction advocacy news page in India, covering the week of ${weekStartKey} to ${weekEndKey}. Base it on this week's news items and daily digests below. Pick out the throughline(s) of the week rather than listing every item.

Daily digests already written this week:
${dailyLines.join('\n') || '(none)'}

News items this week:
${lines.join('\n')}

Respond ONLY as JSON: {"summary": "..."}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  }).then((r) => r.json());

  const text = res.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim()).summary;
  } catch {
    return `This week in tobacco harm reduction: ${items.length} stories covered, spanning ${[...new Set(items.map((i) => i.topic ?? 'other'))].join(', ')}. See the daily breakdown below for details.`;
  }
}

async function main() {
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  const items = loadNewsItems();
  const { daily, weekly } = loadExistingDigests();

  const today = new Date();
  const currentWeekStart = isoWeekStart(today);

  // Group reviewed items by the Monday of their ISO week.
  const byWeek = new Map();
  for (const item of items) {
    const itemDate = new Date(`${item.date}T00:00:00Z`);
    const weekStart = isoWeekStart(itemDate);
    const key = isoDate(weekStart);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(item);
  }

  let written = 0;
  for (const [weekStartKey, weekItems] of byWeek) {
    if (weekStartKey >= isoDate(currentWeekStart)) {
      continue; // never roll up the current, still-forming week
    }
    if (weekly.has(weekStartKey)) {
      continue; // already have a weekly digest for this week
    }
    const weekStart = new Date(`${weekStartKey}T00:00:00Z`);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndKey = isoDate(weekEnd);

    const dailySummaries = new Map();
    for (const d of daily.keys()) {
      if (d >= weekStartKey && d <= weekEndKey) dailySummaries.set(d, daily.get(d));
    }

    const summary = await writeWeeklySummary(weekStartKey, weekEndKey, weekItems, dailySummaries);
    const content = `---\ntype: "weekly"\ndate: ${weekStartKey}\nweekEnd: ${weekEndKey}\nsummary: ${JSON.stringify(summary)}\n---\n`;
    const filename = `${weekStartKey}-week.md`;
    fs.writeFileSync(path.join(DIGEST_DIR, filename), content);
    written += 1;
    console.log(`Wrote weekly digest: ${filename} (${weekItems.length} items)`);
  }

  console.log(`Done. ${written} new weekly digest(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
