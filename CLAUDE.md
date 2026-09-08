# AVI website rebuild — project brief for Claude Code

This file is read automatically by Claude Code on startup. It exists so you
don't need to re-explain project context in a fresh session — everything
below reflects decisions made in prior conversation with the site owner.

## Who this is for

Association of Vapers India (AVI) — a tobacco harm reduction consumer
advocacy group in India, founded by Samrat Chowdhery (former smoker who
quit via vaping, past president of INNCO). AVI is not a registered legal
entity. Domestic contributions are received through **Harm Reduction
Policy & Research Pvt. Ltd. (HRPR)**, an MCA-registered private limited
company Samrat also directs — confirmed OK for domestic contributions
(not tax-deductible, no 80G). Foreign contributions are legally blocked
(FCRA) and out of scope for this site's Contribute page; overseas support
is handled separately as invoiced project work, not via the website.

Focus has expanded beyond vaping/e-cigarettes to smokeless nicotine
(pouches, snus) — ~200M Indian smokeless tobacco users vs ~100M smokers.
**Frame everything as tobacco harm reduction (THR)** with vaping and
smokeless as subsections of one identity, not two separate things —
this was an explicit instruction from the site owner. Split content by
product only where the underlying law genuinely differs (it does — see
below), never for branding/identity reasons.

## Why this rebuild exists

Old site (vapeindia.org, still live during migration) is WordPress 5.9.16,
frozen at mid-2018 content, broken plugin shortcodes rendering as literal
text on the Join page, dead `goo.gl` links throughout, no mention of PECA
2019 anywhere despite it being the current governing law. Full audit is
in prior conversation history if needed, but the short version: rebuilding
static removes hosting cost and security risk, and enables automation
that WordPress can't do here.

## Confirmed legal positions (site owner assumption, not yet in writing
from counsel — see disclaimers already in the relevant pages)

- **E-cigarettes/ENDS:** banned nationally under the Prohibition of
  Electronic Cigarettes Act, 2019 (PECA). Possession clarified by Health
  Ministry (Oct 2023) as violating the Act in any quantity.
- **Nicotine pouches/snus:** not banned by name, but FSSAI has not
  approved nicotine as a food additive, so there is no lawful market
  pathway under food safety law — effectively unavailable, by a different
  legal mechanism than PECA. This distinction is written into
  `src/pages/india/law.astro` — do not soften or merge the two into one
  vague statement, the *mechanism* differs even though the outcome
  (unavailable) is similar for both.
- Never write content that could read as advertising, product promotion,
  purchase guidance, vendor links, or "how to obtain" — PECA's
  advertisement prohibition is broadly drafted. This constraint governs
  the news-ingestion blocklist (`scripts/config/blocklist.json`) and
  should govern all future content decisions too.

## Stack and why

Astro (static site) + GitHub (content + Actions automation) + Cloudflare
Pages (free hosting, unlimited bandwidth, no card, no credit-based
surprise-suspension risk unlike Netlify's current pricing). Domain stays
registered at GoDaddy; only nameservers point to Cloudflare. Email
(`contact@vapeindia.org`) is on Gmail and unaffected by any of this — MX
records carry over automatically during the Cloudflare DNS import, verify
they're present before finishing that step.

Accounts: GitHub/Cloudflare should be under `contact@vapeindia.org` (or a
GitHub org), not the owner's personal Gmail, and NOT the same GitHub
account used for HRPR's separate work — different audience, different
access control, keep them apart.

## Content collections (see `src/content.config.ts`)

- `blog` — human-written, manual
- `news` — auto-pulled via `scripts/fetch-news.mjs` (RSS: Google Alerts +
  outlet feeds in `scripts/config/feeds.json`), AI-paraphrased summary,
  `reviewed: false` by default. GitHub Action `fetch-news.yml` runs daily,
  opens a PR. **Never** flip `reviewed: true` on anything touching a
  commercial/vendor domain — check `blocklist.json` is doing its job.
- `research` — auto-pulled via `scripts/fetch-research.mjs` (PubMed +
  Europe PMC), AI brief, same review gate. GitHub Action
  `fetch-research.yml` runs weekly.
- `press` — coverage OF AVI specifically (distinct from `news`, which is
  coverage of the topic generally). Migrating from the Google Drive
  archive's "AVI Board/AVI Outreach/Press releases" folder (~130 files
  across all archive parts, counting draft-revision duplicates — closer to
  ~60-70 distinct releases, 2016-2021, PR agency Brands2Life). As of
  2026-09-08 this collection has 59 entries (was "only 2 of ~80" as of
  2026-09-07 — that note was stale; most of the migration had already
  happened in an earlier session not reflected in this file at the time).
  Six items were confirmed genuinely new and added on 2026-09-08 by
  extracting text from the source .docx files directly (via a PowerShell
  zip-extraction trick — Word .docx is a zip of XML; legacy binary .doc
  files can't be read this way and were skipped): an Only My Health op-ed
  on tobacco-as-pandemic, a Pinkvilla op-ed specifically on SLT/spitting
  bans during COVID (distinct from the existing Gogate Pinkvilla piece), a
  cessation-ecosystem webinar release, a second, earlier Pratik Gupta op-ed
  (distinct from the existing Feb 2019 one), a nationwide Sept 28, 2019
  protest call, and a July 2018 letter to Haryana's CM (distinct from the
  existing Jan 2019 Haryana entry). All four dates without a source
  dateline are marked "approximate" in the entry body with the reasoning
  shown. **Still unreviewed:** the remaining ~120 source files in that
  Drive folder (many are near-duplicate draft revisions of releases already
  covered, but not all — this was a targeted pass on the most likely-new
  titles by filename, not an exhaustive one). If asked to continue this,
  don't re-open files already confirmed as duplicates (noted in the
  session that did this pass); prioritise titles that don't obviously match
  any of the 59 existing entries' subjects.
- `litigation` — one entry per court case. Source material is the Drive
  "CASE" folder (87 files: actual court orders, PILs, affidavits, RTI
  replies across Karnataka, J&K, Delhi, Bombay HC, Kolkata HC, and more).
  All 8 entries were checked against the actual source PDFs on 2026-09-07
  (see below) — this collection is no longer "drafted from file names,
  unverified."

- `testimonials` — visitor-submitted, via the form at `/testimonials` and
  the Cloudflare Pages Function `functions/api/testimonial.js`, which opens
  a review PR (no email address in it — see `functions/README.md`).
  `reviewed: false` by default, same gate as `news`/`research`.

Both automated pipelines write `reviewed: false` drafts only; a human (or
Claude, on explicit instruction) must flip that flag before anything
appears on a live index page. Never auto-approve. The same rule applies to
`testimonials` PRs — read every one before flipping the flag; this is
public-facing user content, and PECA's advertising-risk guard applies to it
too (no product brand names, purchase links, or vendor mentions).

## What's built vs. what's genuinely still open

Built and building clean (last verified via `npx astro build` — this repo has
no Node/npm available in some working environments; if you can't run the
build, verify by inspecting `src/content.config.ts` schemas against the
frontmatter of any files you add, not by guessing): Home, About, Contribute,
India (index + law + litigation index/detail), Litigation (index + detail,
9 entries — see below), Press (index, split into Media Coverage / Press
Releases & Statements, ~55 entries), Testimonials (index + submission form
+ Cloudflare Pages Function, 0 published entries pending real submissions),
Science (index + 1 entry), News (index, empty pending real pipeline run),
Blog (index, empty).

**CHRA / HRPR:** the site now refers exclusively to **Harm Reduction Policy
& Research (HRPR)** — never "Council for Harm Reduced Alternatives" or
"CHRA" — per explicit site-owner instruction (2026-09-07). This was applied
as a name substitution across all press entries and the Karnataka
litigation entry that referenced Samrat Chowdhery's allied organisation.
If you're asked to add older archive material that still says "CHRA",
rename it to HRPR rather than reproducing the old name verbatim.

**Litigation page** now covers all matters the site owner named AVI as
having supported: Karnataka, Delhi (two matters — the 2017 regulation
challenge and the ongoing BCAS flight-ban case), J&K, Chennai, Kolkata and
Mumbai (the latter two explicitly framed as seller/manufacturer cases at
arm's length from AVI, per site-owner instruction). No case numbers are
published anywhere on this page — a deliberate, explicit instruction.

**Testimonials** (`/testimonials`, `functions/api/testimonial.js`,
`src/content.config.ts` → `testimonials` collection): visitors submit a
name, location, email and testimonial. The email is used only to send a
thank-you note (via Resend) and is **never** committed to the repo or
rendered on the site — see `functions/README.md` for the full design and
the Cloudflare secrets (`GITHUB_TOKEN`, `GITHUB_REPO`, `RESEND_API_KEY`,
etc.) that must be set before submissions actually open a review PR and
send mail. **This is not yet configured — nothing will happen on a live
submission until those secrets are set.**

**Media coverage research (2026-09-07):** a web search pass found ~10
genuine third-party articles/interviews mentioning AVI or Samrat Chowdhery
by name (Deccan Chronicle, Outlook India, Ecigclick, The Week/PTI, Filter,
ThePrint, PR Newswire, 2Firsts, a 2018 Medium post) not previously on the
site — now added to `press/` with `type: coverage|interview|op-ed`. No
articles specifically naming HRPR (as opposed to Chowdhery/AVI) were found
in that pass. This was a search-engine-based pass, not an exhaustive
archive trawl — treat it as a floor, not a ceiling, on what's out there.

**Litigation entries verified against source PDFs (2026-09-07):** all 8
entries in `src/content/litigation/` were checked against the actual Drive
"CASE" folder documents (court orders, PILs, board resolutions, affidavits)
rather than trusting file names or the old site's text. Six checked out
cleanly with no changes needed: Karnataka (WP 36696/2017 PIL + objections +
July 2018 board resolution — matches "PIL organised and pursued by HRPR"),
Delhi/Seema Sehgal (WP(C) 10624/2017 — Aug 2018 order confirms AVI's own
board-resolution advocates appearing "for proposed intervenor"), Delhi ENDS
trade stay (judgment + LPA 342/2019 — interim stay and its appeal both
confirmed, matches entry almost verbatim), Delhi BCAS flight ban (internal
case synopses/email trail confirm both named petitioners — Dr. Kiran Harsha
Melkote, WP(C) 2786/2023, and Sutirtha Dutta, WP(C) 5485/2022 — were
personally identified and briefed by Samrat Chowdhery, matching "AVI
identified and briefed two consumer petitioners"), Kolkata (WP 26950(W)/2014,
petitioner Joybuddy Fun Products — "no legal provision" language in the
entry is near-verbatim from the actual judgment), Bombay/Godfrey Philips
(FDA seizure + interim relief confirmed). J&K also checked out (Divisional
Commissioner Kashmir order + a vendor's, Mushtaq Ahmad Shah's, impleadment
application arguing COTPA-style regulation — both match the entry precisely)
though the archive didn't include the underlying PIL filing itself, so AVI's
exact role there rests on a March 2018 board resolution retaining counsel,
one inference short of the Delhi/Karnataka level of proof.

Two items flagged, not yet acted on — need the site owner's call, not a
unilateral edit:
1. **Flight ban hearing date** — the entry states a hearing "scheduled for
   15 September 2026." Nothing in the archive (which stops in July 2023)
   can confirm this; it must rest on more recent information the site owner
   has directly. Worth a final double-check before go-live, since a wrong
   date on a live legal-status page is a credibility risk.
2. **Chennai/Madras and the second Mumbai matter have no locatable court
   order in the archive.** Chennai is corroborated only by an AVI press
   release already in `src/content/press/2018-madras-hc-first-hearing.md`
   (names petitioner Cary Edwards, advocate Vivek Menon — matches the
   entry). The "group of Mumbai vape retailers" half of the Bombay HC entry
   (distinct from the verified Godfrey Philips matter) has no supporting
   document in the CASE folder at all — its text rests entirely on the old
   site's account, unverified either way.

Also noted, not urgent: on the Delhi ENDS trade stay matter, the sellers'
counsel of record (Vivek Raja, Ankur Kashyap) is the same firm AVI/CHRA
retained under its own Delhi board resolution for the Seema Sehgal
intervention. Doesn't contradict the entry's "clearly distinct from AVI"
framing (that's about funding/filing, not counsel identity) but the site
owner should know the overlap exists in case it's ever raised.

**Social accounts checked (2026-09-07):** YouTube (`youtube.com/vapeindia`)
and X (`x.com/vapeindia`) could not be crawled — both require a JS-rendered
session or paid API access that this environment doesn't have; treat their
content as unreviewed. Instagram (`@avi_vapeindia`) was partially readable:
~1,021 followers, bio "AVI is a citizen action group that defends the right
of people who use tobacco to access life-saving safer [alternatives]", and
a `linktr.ee/vapeindia` in bio worth checking for anything not otherwise
linked from this site. Facebook (`facebook.com/avindia`) returned no usable
content. None of this blocks anything currently built; flagging in case a
future session is asked to pull content from these accounts.

Still needed, roughly in priority order:
1. Configure the Cloudflare secrets in `functions/README.md` so the
   testimonials pipeline actually works, then do a real end-to-end test
   submission before pointing anyone at `/testimonials`
2. Fill remaining `PLACEHOLDER` HTML comments in `about/index.astro` and
   `contribute/index.astro` — HRPR's CIN, registered address, UPI QR image
   (`public/contribute-qr.png`), bank details
3. ~~Populate `scripts/config/feeds.json` with real Google Alerts RSS URLs~~
   — **done 2026-09-08.** All 6 topics (the original 5 plus smokeless
   tobacco India, added after the site owner noticed it was missing) now
   have real feed URLs. Note: Google Alerts RSS feeds don't backfill
   history — only new items going forward will show up.
4. Build out `public/_redirects` with every surviving old-site URL before
   DNS cutover — currently only has section-level mappings
5. ~~Get the two GitHub Actions their `ANTHROPIC_API_KEY` repo secret and
   confirm at least one successful scheduled/manual run of each~~ — **done
   2026-09-08.** Secret added, and a manual `workflow_dispatch` run of
   `fetch-news.yml` completed green. One extra fix needed along the way:
   the `vapeindia` org had "Allow GitHub Actions to create and approve
   pull requests" switched off by default (Settings → Actions → General →
   Workflow permissions, at the org level since repos under this org can't
   override it) — that had to be enabled before `create-pull-request`
   would work; if `fetch-research.yml` is ever run for the first time and
   mysteriously fails at the same step, this is already fixed, so look
   elsewhere. **Not yet run even once:** `fetch-research.yml` (weekly
   cron) — same secret, should work, but hasn't actually been triggered
   to confirm. Remaining cosmetic-only warning: both workflows pin
   `node-version: 20`, which GitHub now force-runs on Node 24 with a
   deprecation warning — harmless, but a one-line bump to `24` in both
   files would silence it.

## Repo status (as of 2026-09-08)

The site is now pushed to `https://github.com/vapeindia/AVI-website`
(`main` branch, GitHub org `vapeindia`) — this CLAUDE.md file, and
everything else in this repo, now lives there too, not just locally.
Git identity for commits in this repo is set locally (not globally) to
`Association of Vapers India <contact@vapeindia.org>`. Two fine-grained
PATs were used to push (Contents + Workflows: Read and write) and the
site owner was advised to revoke/regenerate both since they were shared
in plaintext through the conversation that set this up — worth confirming
that happened, since a live token sitting unused is a needless risk.

## Social handles (linked in footer, not actively pulled from)

YouTube: youtube.com/vapeindia · X: @vapeindia · Instagram:
@avi_vapeindia · Facebook: facebook.com/avindia · LinkedIn (handle TBD).
X's embedded timeline is effectively broken for logged-out visitors
(platform-wide issue, not this site's problem) — do not attempt to embed
an X timeline. YouTube's RSS/oEmbed is reliable if a "latest video" embed
is ever wanted.

## Deadline context

Site owner is targeting go-live by Sunday (from whenever this file is
being read — check actual dates, don't assume). DNS cutover is the
highest-risk step (do it with a buffer day, not last-minute). If you're
being asked to help hit that date, prioritise the "still open" list above
in the order given — items 1-2 are bulk content work well suited to a
long Claude Code session; items 3-4 need the site owner's input first,
so ask for those early rather than blocking on them at the end.

---



When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
