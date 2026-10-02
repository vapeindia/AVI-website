// Shared by fetch-news.mjs and fetch-research.mjs: records every item a
// pipeline drops so there's a trail now that rejected items no longer
// surface anywhere (no review PR). Keeps only the most recent 200 entries
// across both feeds combined.
import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = path.join(process.cwd(), 'data/rejected-log.json');
const MAX_ENTRIES = 200;

function load() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export function logRejected({ feed, title, url, reason }) {
  const log = load();
  log.push({ date: new Date().toISOString(), feed, title, url: url ?? null, reason });
  const trimmed = log.slice(-MAX_ENTRIES);
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, `${JSON.stringify(trimmed, null, 2)}\n`);
}
