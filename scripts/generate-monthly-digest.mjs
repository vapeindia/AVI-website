#!/usr/bin/env node
/**
 * Once a calendar month has fully elapsed, roll its news items (and
 * whatever weekly/daily digests exist for it) up into a single monthly
 * digest paragraph, so the News index can collapse that month to one card
 * (expanding it reveals the month's weekly cards, which themselves still
 * expand to daily digests and articles — see src/pages/news/index.astro).
 * Writes src/content/news-digests/<month>-01-month.md with `type: monthly`.
 *
 * Only ever processes months that are already over — never the current,
 * still-forming month — and only reviewed news items (which, as of
 * 2026-09, is everything fetch-news.mjs writes — see that file's header
 * comment for why this pipeline no longer has a human review gate).
 * Commits straight to main via the GitHub Action, same as
 * generate-weekly-digest.mjs.
 *
 * Requires ANTHROPIC_API_KEY env var. Run via GitHub Action on a schedule
 * (monthly, a few days into the new month, after the prior month's last
 * weekly digest has had a chance to run).
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

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLastDay(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day of this one
}

function loadNewsItems() {
  if (!fs.existsSync(NEWS_DIR)) return [];
  return fs.readdirSync(NEWS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseFrontmatter(fs.readFileSync(path.join(NEWS_DIR, f), 'utf-8')))
    .filter((item) => item.reviewed === true && item.date);
}

function loadExistingDigests() {
  if (!fs.existsSync(DIGEST_DIR)) return { weekly: [], monthly: new Set() };
  const weekly = [];
  const monthly = new Set();
  for (const f of fs.readdirSync(DIGEST_DIR)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFrontmatter(fs.readFileSync(path.join(DIGEST_DIR, f), 'utf-8'));
    if (fm.type === 'monthly') {
      monthly.add(f.replace(/-01-month\.md$/, ''));
    } else if (fm.type === 'weekly') {
      weekly.push({ date: fm.date, weekEnd: fm.weekEnd, summary: fm.summary });
    }
  }
  return { weekly, monthly };
}

async function writeMonthlySummary(monthKeyStr, items, weeklySummaries) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const lines = items.map((it) => `- [${it.date}] (${it.topic ?? 'other'}) ${it.title}: ${it.summary ?? ''}`);
  const weekLines = weeklySummaries.map((w) => `- [week of ${w.date}] ${w.summary}`);

  const prompt = `Write a neutral, paraphrased monthly roundup paragraph (max 550 characters, your own words, no verbatim quoting) for a tobacco-harm-reduction advocacy news page in India, covering the month of ${monthKeyStr}. Base it on this month's weekly roundups and news items below. Pick out the throughline(s) of the month rather than listing every item.

Weekly roundups already written this month:
${weekLines.join('\n') || '(none)'}

News items this month:
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
    return `This month in tobacco harm reduction: ${items.length} stories covered, spanning ${[...new Set(items.map((i) => i.topic ?? 'other'))].join(', ')}. See the weekly breakdown below for details.`;
  }
}

async function main() {
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  const items = loadNewsItems();
  const { weekly, monthly } = loadExistingDigests();

  const todayMonth = new Date().toISOString().slice(0, 7);

  const byMonth = new Map();
  for (const item of items) {
    const key = monthKey(item.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(item);
  }

  let written = 0;
  for (const [key, monthItems] of byMonth) {
    if (key >= todayMonth) continue; // never roll up the current, still-forming month
    if (monthly.has(key)) continue; // already have a monthly digest

    const weeksInMonth = weekly.filter((w) => monthKey(w.date) === key || monthKey(w.weekEnd ?? w.date) === key);
    const summary = await writeMonthlySummary(key, monthItems, weeksInMonth);
    const lastDay = monthLastDay(key);
    const content = `---\ntype: "monthly"\ndate: ${key}-01\nweekEnd: ${lastDay}\nsummary: ${JSON.stringify(summary)}\n---\n`;
    const filename = `${key}-01-month.md`;
    fs.writeFileSync(path.join(DIGEST_DIR, filename), content);
    written += 1;
    console.log(`Wrote monthly digest: ${filename} (${monthItems.length} items)`);
  }

  console.log(`Done. ${written} new monthly digest(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
