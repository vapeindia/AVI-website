#!/usr/bin/env node
/**
 * CI guard, run on every PR (.github/workflows/content-guard.yml).
 *
 * Checks 1-3 below look only at LINES ADDED by the PR (the diff against its
 * base), not the whole file — the site had trailing-slash-less internal
 * links and other now-disallowed patterns everywhere before this guard
 * existed; scanning whole-file state would fail every future PR on
 * pre-existing content nobody touched. Scoping to added lines means this
 * guard only stops a PR from introducing a NEW instance of a known problem,
 * which is the realistic bar for a check introduced partway through a
 * project's life. Check 4 (reviewed:false leaking into the build) checks
 * the actual build output, not the diff, since that failure mode doesn't
 * depend on what a specific PR touched.
 *
 * Usage: node scripts/ci-content-guard.mjs <base-ref>
 * Exits 1 and prints every violation if anything trips; exits 0 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const baseRef = process.argv[2];
if (!baseRef) {
  console.error('Usage: node scripts/ci-content-guard.mjs <base-ref>');
  process.exit(2);
}

function loadJson(file, fallback) {
  const p = path.join(process.cwd(), file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback;
}

const blocklist = loadJson('scripts/config/blocklist.json', { reviewBrands: [] });
const BRAND_NAMES = blocklist.reviewBrands ?? [];

// Same families as the urgent-fixes task's sweep — see CLAUDE.md's "Site
// rules (October 2026 review)", rule 4.
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

const FLAVOUR_WORDS = /\b(flavou?rs?|mint|menthol|fruit|berry|mango|melon|tobacco[- ]flavou?r)\b/i;
const PRICE_PATTERN = /(₹|Rs\.?\s?|\$)\s?\d[\d,]*(\.\d+)?/;

function isInsideQuote(line) {
  // Heuristic, not exhaustive: a blockquote line, or text wrapped in actual
  // quotation marks (a quoted government order/court record/news
  // headline, per the PECA-guardrail rule's approved exception) counts as
  // "inside an approved quote." Doesn't understand multi-line blockquotes
  // that don't repeat the > marker — a real gap, documented rather than
  // silently assumed away.
  const trimmed = line.replace(/^\+/, '').trim();
  if (trimmed.startsWith('>')) return true;
  return /"[^"]*"/.test(trimmed) || /[“][^”]*[”]/.test(trimmed);
}

function getAddedLines(base) {
  const diff = execSync(`git diff --unified=0 ${base}...HEAD -- src/content src/pages`, { maxBuffer: 1024 * 1024 * 50 }).toString();
  const lines = [];
  let currentFile = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      currentFile = raw.slice(6).replace(/^b\//, '');
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      lineNo = parseInt(hunk[1], 10);
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      lines.push({ file: currentFile, line: lineNo, text: raw.slice(1) });
      lineNo += 1;
    } else if (!raw.startsWith('-')) {
      lineNo += 1;
    }
  }
  return lines;
}

const violations = [];

function check1_2_brandFlavourPrice(addedLines) {
  for (const { file, line, text } of addedLines) {
    if (isInsideQuote(text)) continue;
    for (const brand of BRAND_NAMES) {
      const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) {
        violations.push({ file, line, rule: 'brand-name', detail: `"${brand}" outside an approved quote`, text: text.trim() });
      }
    }
    if (FLAVOUR_WORDS.test(text)) {
      violations.push({ file, line, rule: 'flavour-word', detail: 'flavour/flavor term outside an approved quote', text: text.trim() });
    }
    if (PRICE_PATTERN.test(text)) {
      violations.push({ file, line, rule: 'price', detail: 'price-shaped text outside an approved quote', text: text.trim() });
    }
  }
}

function check3_draftingNotes(addedLines) {
  for (const { file, line, text } of addedLines) {
    for (const re of DRAFTING_NOTE_PATTERNS) {
      if (re.test(text)) {
        violations.push({ file, line, rule: 'drafting-note', detail: `matches ${re}`, text: text.trim() });
      }
    }
  }
}

// Internal links only: a leading single "/" and no second leading slash
// (excludes protocol-relative "//..."), not already ending in "/", and not
// pointing at a file (has a dot after the last slash — .jpg, .pdf, .xml,
// .json, etc. never take a trailing slash) or a hash/query-only fragment.
const INTERNAL_LINK_PATTERN = /href="(\/(?!\/)[^"#?]*)"/g;

function check4_trailingSlash(addedLines) {
  for (const { file, line, text } of addedLines) {
    let m;
    INTERNAL_LINK_PATTERN.lastIndex = 0;
    while ((m = INTERNAL_LINK_PATTERN.exec(text))) {
      const href = m[1];
      if (href === '') continue; // bare "/" already has no further slash to add
      if (href.endsWith('/')) continue;
      const lastSegment = href.slice(href.lastIndexOf('/') + 1);
      if (lastSegment.includes('.')) continue; // a file, not a page route
      violations.push({ file, line, rule: 'trailing-slash', detail: `"${href}" should end in "/"`, text: text.trim() });
    }
  }
}

function check5_reviewedFalseLeak() {
  const researchDir = path.join(process.cwd(), 'src/content/research');
  if (!fs.existsSync(researchDir)) return;
  const unreviewedSlugs = [];
  for (const file of fs.readdirSync(researchDir)) {
    if (!file.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(researchDir, file), 'utf-8');
    if (/^reviewed:\s*false\s*$/m.test(text)) {
      unreviewedSlugs.push(file.replace(/\.md$/, ''));
    }
  }
  for (const slug of unreviewedSlugs) {
    const builtPath = path.join(process.cwd(), 'dist/science', slug, 'index.html');
    if (fs.existsSync(builtPath)) {
      violations.push({ file: `src/content/research/${slug}.md`, line: 0, rule: 'reviewed-false-leak', detail: `built as a live page at dist/science/${slug}/index.html despite reviewed: false`, text: '' });
    }
  }
}

const added = getAddedLines(baseRef);
check1_2_brandFlavourPrice(added);
check3_draftingNotes(added);
check4_trailingSlash(added);
check5_reviewedFalseLeak();

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
