# AVI website (vapeindia.org) — rebuild

Astro static site with two automated content pipelines (research + news) that
open pull requests for human review before anything publishes.

## Structure

```
src/content/
  blog/        # your own written analysis, one .md per post
  news/        # auto-pulled news drafts (reviewed: false until approved)
  research/    # auto-pulled PubMed/Europe PMC entries with AI briefs
  press/       # coverage of AVI itself — migrate from Drive manually
  litigation/  # one entry per court case, from the CASE folder archive
scripts/
  fetch-research.mjs   # run by .github/workflows/fetch-research.yml
  fetch-news.mjs        # run by .github/workflows/fetch-news.yml
  config/
    feeds.json           # RSS feed list — fill in real Google Alerts URLs
    blocklist.json        # commercial domains excluded from news ingestion
```

## First-time setup

1. **Create the GitHub repo.** Go to github.com/new, create a repo (public is
   recommended — GitHub Actions is unlimited and free on public repos, and it
   makes your evidence base auditable).

2. **Push this code.**
   ```
   cd avi-site
   git init
   git add .
   git commit -m "Initial scaffold"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/avi-site.git
   git push -u origin main
   ```

3. **Add your Anthropic API key as a repo secret.** Repo → Settings → Secrets
   and variables → Actions → New repository secret → name it
   `ANTHROPIC_API_KEY`. This is what powers the research briefs and news
   summaries. Get a key from console.anthropic.com — Haiku is the model used
   in both scripts, which keeps this cheap (a few hundred rupees a month at
   most for these volumes).

4. **Set up Google Alerts as RSS.** For each term you want tracked (e.g.
   "PECA 2019", "e-cigarette India", "nicotine pouch India"), create an
   alert at google.com/alerts, set delivery to "RSS feed" instead of email,
   and copy the feed URL into `scripts/config/feeds.json`.

5. **Connect Cloudflare Pages.**
   - Sign up at dash.cloudflare.com (free).
   - Pages → Create a project → Connect to Git → select this repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Deploy. You'll get a `*.pages.dev` URL immediately.

6. **Point the domain.** In Cloudflare, add vapeindia.org as a site (still
   free). Cloudflare will show you two nameservers — set those at GoDaddy
   (Domain Settings → Nameservers → Custom). This does NOT move the
   registration, only DNS. Your existing Gmail MX records get imported
   automatically during this step — verify they appear before finishing,
   so `contact@vapeindia.org` doesn't go dark.
   Then in Cloudflare DNS, add a CNAME from `vapeindia.org` (or `www`) to
   your `*.pages.dev` address, or use Cloudflare Pages' custom domain
   button, which sets this up for you.

## Day-to-day workflow

- **Write a blog post:** add a `.md` file to `src/content/blog/` with the
  right frontmatter (see `src/content.config.ts` for the schema), commit,
  push. Site rebuilds automatically via Cloudflare Pages' Git integration.

- **Review auto-fetched drafts:** the two GitHub Actions run on schedule
  (news daily, research weekly) and open pull requests. Open the PR, check
  the diffs, edit any file directly in the GitHub PR UI if a brief needs
  fixing, then either flip `reviewed: false` to `reviewed: true` in each
  file you want live, and merge. Anything left as `reviewed: false` stays
  built but unlisted (not linked from any index page).

- **Ask Claude to do it for you:** point Claude Code at this repo and say
  things like "clear this week's research inbox, keep anything about
  cessation efficacy, discard the rest" or "add a blog post from these
  notes." Claude edits files and commits directly; Cloudflare Pages
  rebuilds automatically on push.

- **Manual trigger:** both workflows can be run on demand from the
  repo's Actions tab (workflow_dispatch) without waiting for the schedule.

## What's built vs. what still needs your input

**Built and rendering:** Home, About, India/law, Contribute, Litigation
history (index + 3 case entries), Press (index + 2 entries), Science
(index + 1 entry), News (index, empty until the pipeline runs), Blog
(index + detail route, empty until you write one).

**Needs your input before publishing — search each file for `PLACEHOLDER`
comments:**
- `src/pages/about/index.astro` — HRPR's CIN, registered office address,
  audit-status line; any board/advisor names beyond the founder.
- `src/pages/contribute/index.astro` — UPI QR image, bank account details,
  first annual statement link.
- `src/pages/india/law.astro` — the nicotine pouch/snus legal section is
  intentionally left blank pending counsel review. Do not publish a legal
  claim there without sign-off — this is the single highest-liability
  sentence on the whole site.
- `src/content/litigation/*.md` — the Delhi and J&K entries are drafted
  from file names and the old site's text, not the source PDFs. Verify
  each against the actual CASE folder documents before treating them as
  final. Karnataka entry is a placeholder needing the same treatment.
- `src/content/press/*.md` — only 2 of the ~80+ items in the Drive
  "Press Releases" folder are migrated, as examples of the format.

- `public/_redirects` — has the main section mappings but needs every
  surviving post URL from the old site's sitemap before DNS cutover.
- `scripts/config/feeds.json` has placeholder Google Alerts URLs — replace
  before the news workflow will find anything.
