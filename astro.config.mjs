// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// --- Sitemap lastmod + exclusions -------------------------------------
// @astrojs/sitemap's filter/serialize callbacks only see the final URL
// string, not the source file — this maps a URL back to the file it was
// built from so lastmod can come from real git history rather than a
// guess, and so a research entry without a human-written India-relevance
// note (noindex'd on the page itself — see science/[...slug].astro) is
// also left out of the sitemap, not just out of search results. Listing a
// noindexed URL in the sitemap is a contradictory signal to crawlers.
function gitModified(filePath) {
  try {
    const out = execSync(`git log -1 --format=%ad --date=short -- "${filePath}"`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

const RESEARCH_DIR = 'src/content/research';
const noindexedScienceSlugs = new Set();
if (fs.existsSync(RESEARCH_DIR)) {
  for (const file of fs.readdirSync(RESEARCH_DIR)) {
    if (!file.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf-8');
    if (!/^whyItMattersIndia:/m.test(text)) {
      noindexedScienceSlugs.add(file.replace(/\.md$/, ''));
    }
  }
}

function sourceFileForPathname(pathname) {
  const trimmed = pathname.replace(/^\/|\/$/g, '');
  if (trimmed === '') return 'src/pages/index.astro';
  const scienceMatch = trimmed.match(/^science\/(.+)$/);
  if (scienceMatch && scienceMatch[1] !== '') return `src/content/research/${scienceMatch[1]}.md`;
  const litigationMatch = trimmed.match(/^litigation\/(.+)$/);
  if (litigationMatch && litigationMatch[1] !== '') return `src/content/litigation/${litigationMatch[1]}.md`;
  const asIndex = `src/pages/${trimmed}/index.astro`;
  const asFile = `src/pages/${trimmed}.astro`;
  if (fs.existsSync(asIndex)) return asIndex;
  if (fs.existsSync(asFile)) return asFile;
  return undefined;
}

// `site` targets the production domain (vapeindia.org) rather than the
// current avi-website-9f9.pages.dev staging URL, since that's the
// canonical/sitemap domain search engines should index once DNS cuts
// over (see CLAUDE.md, Hosting/DNS section) — not what's live today.
// https://astro.build/config
export default defineConfig({
  site: 'https://vapeindia.org',
  // Canonicals and the sitemap already used the trailing-slash form
  // (/faq/) while every nav/footer/in-page link omitted it (/faq) — every
  // internal click took an extra 301 hop. 'always' makes Astro itself
  // enforce and generate the trailing-slash form consistently; every
  // internal href sitewide was updated to match in this same change.
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => {
        const url = new URL(page);
        if (url.pathname.startsWith('/search')) return false; // a tool, not content — noindex'd on the page itself too
        const scienceMatch = url.pathname.match(/^\/science\/([^/]+)\/?$/);
        if (scienceMatch && noindexedScienceSlugs.has(scienceMatch[1])) return false;
        return true;
      },
      serialize: (item) => {
        const url = new URL(item.url);
        const sourceFile = sourceFileForPathname(url.pathname);
        const lastmod = sourceFile ? gitModified(sourceFile) : undefined;
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
