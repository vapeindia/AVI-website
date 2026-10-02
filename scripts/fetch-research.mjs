#!/usr/bin/env node
/**
 * Fetches recent publications on THR/vaping/nicotine-pouch topics from
 * PubMed (E-utilities) and Europe PMC, writes plain-language AI briefs
 * via the Anthropic API, and creates entries under src/content/research/.
 *
 * Fully automated as of 2026-09 (explicit site-owner instruction, mirroring
 * the same change made to fetch-news.mjs) — entries are written with
 * `reviewed: true` and committed straight to main, no PR, no human gate.
 * That's only safe because every AI-classified field is validated/clamped
 * against the exact Zod schema in src/content.config.ts before it's ever
 * written to disk (see sanitizeBrief() below) — this project had a real,
 * full-site build outage once already from an unvalidated AI enum value
 * (`studyType: "systematic-review, meta-analysis"`, an invalid `substance`
 * tag) reaching this same collection, since Astro's getCollection() fails
 * the ENTIRE build on one bad entry. Don't remove the validation step to
 * "simplify" this script — it's the thing that makes auto-publish safe.
 *
 * Run via GitHub Action on a schedule. Requires ANTHROPIC_API_KEY env var.
 * Idempotent: skips any PMID/DOI already present in src/content/research/.
 * A paper the relevance gate rejects is logged to data/rejected-log.json
 * (shared with fetch-news.mjs) rather than written anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { logRejected } from './lib/rejected-log.mjs';

const CONTENT_DIR = path.join(process.cwd(), 'src/content/research');
const LOOKBACK_DAYS = 8; // slight overlap with weekly schedule to avoid gaps

// Must match the `studyType` / `substance` enums in src/content.config.ts
// exactly — this is the guardrail that keeps a malformed AI response from
// breaking the whole site build (see file header comment).
const VALID_STUDY_TYPES = new Set([
  'systematic-review', 'meta-analysis', 'rct', 'cohort',
  'cross-sectional', 'policy-report', 'other',
]);
const VALID_SUBSTANCES = new Set(['e-cigarette', 'nicotine-pouch', 'snus', 'combustible', 'general']);
const BRIEF_MAX = 500; // matches brief: z.string().max(500) in content.config.ts

function clamp(str, max) {
  const s = String(str ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

// Sanitizes the AI's JSON response into something guaranteed to pass the
// Zod schema, regardless of what the model actually returned — an invalid
// studyType/substance falls back to a safe default rather than reaching
// disk, since there's no human reviewing this before it's live.
function sanitizeBrief(brief) {
  const studyType = VALID_STUDY_TYPES.has(brief.studyType) ? brief.studyType : 'other';
  const rawSubstance = Array.isArray(brief.substance) ? brief.substance : [brief.substance];
  const substance = rawSubstance.filter((s) => VALID_SUBSTANCES.has(s));
  return {
    studyType,
    substance: substance.length > 0 ? substance : ['general'],
    brief: clamp(brief.brief || 'Auto-summary unavailable; see the source directly.', BRIEF_MAX),
    relevanceToIndia: brief.relevanceToIndia ? String(brief.relevanceToIndia).trim() : 'None stated.',
  };
}

// Relevance gate, added after the library accumulated papers on gambling,
// cannabis craving, opioid/stimulant use, alcohol in pregnancy, COPD
// epigenetics and the Trier social stress test — each matched one of the
// broad PubMed queries below on a tangential mention (nicotine used only as
// a covariate, a shared study population, etc.), not because the paper is
// actually about tobacco/nicotine harm reduction. Two independent
// requirements, both checked against title+abstract: a real product/
// substance term, AND a harm-reduction-relevant angle. Title/abstract
// mentioning nicotine in passing is not enough on its own.
//
// Verified against the actual research library before finalizing: an
// earlier draft of these two regexes missed plain "smoking"/"smoker",
// plural forms (adolescent{s}, regulat{ion/ory/ions}), "quitline" (word-
// boundary \b doesn't match mid-compound-word), and comparative-risk
// phrasing that doesn't use the literal string "reduced-risk" (e.g.
// "exhibit reduced toxicological effects compared to cigarette smoke") —
// each would have wrongly flagged a genuinely on-topic paper as a removal
// candidate. Fixed by using \w* stems instead of a fixed set of suffixes
// wherever a plural/inflection was the actual gap.
const PRODUCT_TERMS = /\b(nicotine|tobacco|smoking|smoker\w*|cigarette\w*|e-?cigarette\w*|vap\w*|ENDS|smokeless|snus|nicotine pouch\w*|heated tobacco|HTP|cigar\w*|bidi\w*|khaini|gutk?h?a|hookah|waterpipe)\b/i;
const ANGLE_TERMS = /\b(cessation|quit\w*|abstinen\w*|relative risk|harm reduction|less harmful|safer|reduced|modified[- ]risk|compared (to|with)|versus|vs\.?|youth|young(er)? (people|adults?)|teen\w*|adolescent\w*|minor\w*|underage|regulat\w*|polic\w*|ban\w*|legislat\w*|tax\w*)\b/i;

function isRelevant(paper) {
  const haystack = `${paper.title} ${paper.abstract || ''}`;
  return PRODUCT_TERMS.test(haystack) && ANGLE_TERMS.test(haystack);
}

const QUERIES = [
  '(electronic cigarette OR e-cigarette OR vaping OR ENDS) AND (smoking cessation OR harm reduction)',
  '(nicotine pouch OR snus) AND (health OR cessation OR safety)',
  '(smokeless tobacco) AND India',
];

function existingIds() {
  const ids = new Set();
  if (!fs.existsSync(CONTENT_DIR)) return ids;
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    const text = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const m = text.match(/pubmedId:\s*"?(\w+)"?/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

async function searchPubMed(query, sinceDate) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const term = encodeURIComponent(`${query} AND ("${sinceDate}"[PDAT] : "3000"[PDAT])`);
  const searchUrl = `${base}/esearch.fcgi?db=pubmed&retmax=25&retmode=json&term=${term}`;
  const searchRes = await fetch(searchUrl).then((r) => r.json());
  const ids = searchRes.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryUrl = `${base}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryRes = await fetch(summaryUrl).then((r) => r.json());

  const fetchUrl = `${base}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=text&id=${ids.join(',')}`;
  const abstractText = await fetch(fetchUrl).then((r) => r.text());
  const abstractsById = splitPubmedAbstracts(abstractText, ids);

  return ids.map((id) => {
    const s = summaryRes.result[id];
    return {
      pubmedId: id,
      title: s.title,
      authors: (s.authors ?? []).map((a) => a.name).join(', ') || 'Unknown',
      journal: s.fulljournalname ?? s.source ?? '',
      // Prefer epubdate (when the article actually went live online) over
      // pubdate (the print/issue date) — for continuously-published online
      // journals these can land a full year apart (e.g. an article epub'd
      // Sept 2026 whose print issue is dated "2027 Jan"), and pubdate alone
      // produced a visibly-wrong future-dated entry on the live site once
      // already. Fall back to pubdate, then today, if epubdate is absent.
      year: parseInt((s.epubdate || s.pubdate || '').slice(0, 4), 10) || new Date().getFullYear(),
      doi: (s.elocationid ?? '').replace('doi: ', '') || undefined,
      abstract: abstractsById[id] ?? '',
    };
  });
}

function splitPubmedAbstracts(text, ids) {
  // efetch abstract text doesn't cleanly map to IDs without XML; this is a
  // best-effort split. For production, switch efetch retmode to xml and
  // parse properly — left as text for scaffold simplicity.
  const chunks = text.split(/\n\n(?=\d+\.\s)/);
  const out = {};
  ids.forEach((id, i) => { out[id] = chunks[i] ?? ''; });
  return out;
}

async function writeBrief(paper) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const prompt = `You are drafting a plain-language brief for a public tobacco-harm-reduction research library aimed at Indian policymakers, journalists and the public.

Title: ${paper.title}
Abstract: ${paper.abstract || '(abstract unavailable — infer cautiously from title only, and say so)'}

Write, in your own words (do not quote the abstract verbatim, paraphrase fully):
1. A 2-3 sentence plain-language brief of what the study found (max 500 characters).
2. One sentence on relevance to India specifically, if any is apparent, else write "None stated."
3. A study type classification: one of systematic-review, meta-analysis, rct, cohort, cross-sectional, policy-report, other.
4. Substance tags from: e-cigarette, nicotine-pouch, snus, combustible, general (comma separated, can be multiple).

Respond ONLY as JSON: {"brief": "...", "relevanceToIndia": "...", "studyType": "...", "substance": ["..."]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  }).then((r) => r.json());

  const text = res.content?.[0]?.text ?? '{}';
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { brief: 'Auto-summary unavailable; see the source directly.', relevanceToIndia: 'None stated.', studyType: 'other', substance: ['general'] };
  }
}

// Breaks at a word boundary rather than a hard character cut — a plain
// .slice(N) can land mid-word or leave a dangling trailing hyphen (both
// happened across most of this collection's existing slugs before a
// fix/pipelines pass renamed them with 301s; see public/_redirects).
function slugify(title) {
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (slug.length > 60) {
    slug = slug.slice(0, 60);
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen > 0) slug = slug.slice(0, lastHyphen);
  }
  return slug.replace(/-+$/, '');
}

function toFrontmatter(paper, brief) {
  return `---
title: ${JSON.stringify(paper.title)}
authors: ${JSON.stringify(paper.authors)}
journal: ${JSON.stringify(paper.journal)}
year: ${paper.year}
${paper.doi ? `doi: ${JSON.stringify(paper.doi)}` : ''}
pubmedId: ${JSON.stringify(paper.pubmedId)}
studyType: ${JSON.stringify(brief.studyType)}
substance: ${JSON.stringify(brief.substance)}
brief: ${JSON.stringify(brief.brief)}
relevanceToIndia: ${JSON.stringify(brief.relevanceToIndia)}
reviewed: true
---
`;
}

async function main() {
  const seen = existingIds();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
  const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`;

  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  let written = 0;

  for (const query of QUERIES) {
    const papers = await searchPubMed(query, sinceStr);
    for (const paper of papers) {
      if (seen.has(paper.pubmedId)) continue;
      seen.add(paper.pubmedId);
      if (!isRelevant(paper)) {
        const reason = 'no product term + harm-reduction angle together';
        console.log(`Rejected (${reason}): ${paper.title}`);
        logRejected({ feed: 'research', title: paper.title, url: paper.doi ? `https://doi.org/${paper.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${paper.pubmedId}/`, reason });
        continue;
      }

      const rawBrief = await writeBrief(paper);
      const brief = sanitizeBrief(rawBrief);
      const filename = `${paper.year}-${slugify(paper.title)}.md`;
      fs.writeFileSync(path.join(CONTENT_DIR, filename), toFrontmatter(paper, brief));
      written += 1;
      console.log(`Wrote: ${filename}`);
    }
  }
  console.log(`Done. ${written} new entries written and published (reviewed: true).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
