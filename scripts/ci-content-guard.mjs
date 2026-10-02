#!/usr/bin/env node
/**
 * Build-time content guard. Runs as part of `npm run build` (see
 * package.json) and in .github/workflows/content-guard.yml on every push
 * to main — a failed check here fails the Cloudflare Pages build, so the
 * last good deploy stays live instead of a bad one going out.
 *
 * Scans the whole src/content and src/pages trees (not a diff — there's no
 * PR base ref in a direct-to-main workflow) for three things: a brand name
 * outside an approved quote, a leftover drafting note, and an internal
 * link missing its trailing slash.
 *
 * Usage: node scripts/ci-content-guard.mjs
 * Exits 1 and prints every violation if anything trips; exits 0 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';

function loadJson(file, fallback) {
  const p = path.join(process.cwd(), file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback;
}

const blocklist = loadJson('scripts/config/blocklist.json', { reviewBrands: [] });
const BRAND_NAMES = blocklist.reviewBrands ?? [];

const DRAFTING_NOTE_PATTERNS = [
  /\bsite[- ]owner'?s?\b/i,
  /\bplaceholder\b(?!=)/i, // not the HTML `placeholder="..."` attribute
  /\bTODO\b/,
  /\bTBD\b/,
  /\blorem\b/i,
  /\bunverified\b/i,
  /\bapproximate\b/i,
  /you'?d want/i,
  /\bREPLACES\b/,
  /\[(note|tk|citation needed)[:\]]/i,
];

// Internal links only: a leading single "/" and no second leading slash
// (excludes protocol-relative "//..."), not already ending in "/", and not
// pointing at a file (has a dot after the last slash — .jpg, .pdf, .xml,
// etc. never take a trailing slash).
const INTERNAL_LINK_PATTERN = /href="(\/(?!\/)[^"#?]*)"/g;

function isInsideQuote(line) {
  // Heuristic, not exhaustive: a blockquote line, or text wrapped in actual
  // quotation marks (a quoted government order/court record/news
  // headline) counts as "inside an approved quote." Doesn't understand
  // multi-line blockquotes that don't repeat the > marker.
  const trimmed = line.trim();
  if (trimmed.startsWith('>')) return true;
  return /"[^"]*"/.test(trimmed) || /[“][^”]*[”]/.test(trimmed);
}

function relFile(abs) {
  return path.relative(process.cwd(), abs).split(path.sep).join('/');
}

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// Content collection entries committed as `reviewed: false` (currently
// just pending testimonials awaiting moderation) haven't been checked by a
// human yet and never build into a live page, so a stray flagged word in
// visitor-submitted text shouldn't block the whole site's build.
const unreviewedDraftCache = new Map();
function isUnreviewedDraft(file) {
  if (!file.startsWith('src/content/')) return false;
  if (unreviewedDraftCache.has(file)) return unreviewedDraftCache.get(file);
  const abs = path.join(process.cwd(), file);
  const result = fs.existsSync(abs) && /^reviewed:\s*false\s*$/m.test(fs.readFileSync(abs, 'utf-8'));
  unreviewedDraftCache.set(file, result);
  return result;
}

const violations = [];

const files = [
  ...walk(path.join(process.cwd(), 'src/content'), ['.md', '.mdx']),
  ...walk(path.join(process.cwd(), 'src/pages'), ['.astro', '.md']),
];

for (const abs of files) {
  const file = relFile(abs);
  const draftExempt = isUnreviewedDraft(file);
  const lines = fs.readFileSync(abs, 'utf-8').split('\n');

  lines.forEach((lineText, i) => {
    const line = i + 1;

    if (!isInsideQuote(lineText)) {
      for (const brand of BRAND_NAMES) {
        const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(lineText)) {
          violations.push({ file, line, rule: 'brand-name', detail: `"${brand}" outside an approved quote`, text: lineText.trim() });
        }
      }
    }

    if (!draftExempt) {
      for (const re of DRAFTING_NOTE_PATTERNS) {
        if (re.test(lineText)) {
          violations.push({ file, line, rule: 'drafting-note', detail: `matches ${re}`, text: lineText.trim() });
        }
      }
    }

    let m;
    INTERNAL_LINK_PATTERN.lastIndex = 0;
    while ((m = INTERNAL_LINK_PATTERN.exec(lineText))) {
      const href = m[1];
      if (href === '' || href.endsWith('/')) continue;
      const lastSegment = href.slice(href.lastIndexOf('/') + 1);
      if (lastSegment.includes('.')) continue; // a file, not a page route
      violations.push({ file, line, rule: 'trailing-slash', detail: `"${href}" should end in "/"`, text: lineText.trim() });
    }
  });
}

if (violations.length === 0) {
  console.log('Content guard: no violations found.');
  process.exit(0);
}

console.error(`Content guard: ${violations.length} violation(s) found.\n`);
for (const v of violations) {
  console.error(`[${v.rule}] ${v.file}:${v.line} — ${v.detail}`);
  if (v.text) console.error(`    ${v.text}`);
}
process.exit(1);
