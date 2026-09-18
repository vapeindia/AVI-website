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
  Europe PMC), AI brief. GitHub Action `fetch-research.yml` runs weekly.
  **Fully automated as of 2026-09-16** (explicit site-owner instruction,
  matching `news`) — commits straight to `main`, `reviewed: true`, no PR,
  no human gate. Safe only because the script validates/clamps every
  AI-classified field (`studyType`, `substance`, `brief` length) against
  the exact `content.config.ts` schema before writing — see that script's
  header comment. This collection is what caused the real full-site build
  outage documented below ("Design pass and a chain of build failures"),
  via an unvalidated AI enum value; don't remove the validation step.
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

- `videos` — AVI's YouTube uploads, auto-pulled weekly from the channel's
  public RSS feed by `scripts/fetch-youtube.mjs` (`.github/workflows/fetch-youtube.yml`),
  direct commit, no PR/review gate — same reasoning as `news`, this is just
  metadata about AVI's own already-published videos. As of 2026-09-17 the
  script also refreshes `viewCount` on every known video (not just the 15
  the RSS feed returns) via the YouTube Data API v3, so `/media`'s "Most
  watched" ranking stays live rather than a one-time snapshot. Requires the
  GitHub Actions secret `YOUTUBE_API_KEY` (a free key from
  console.cloud.google.com — enable the "YouTube Data API v3", no billing
  needed at this volume); without it the script still fetches new videos as
  before, it just skips the view-count refresh and logs why. `viewCount` is
  optional in the schema for exactly that degrade case.
- `testimonials` — visitor-submitted, via the form at `/testimonials` and
  the Cloudflare Pages Function `functions/api/testimonial.js`, which opens
  a review PR (no email address in it — see `functions/README.md`).
  `reviewed: false` by default, same gate as `news`/`research`.
- `harassmentReports` — added 2026-09-16, visitor-submitted via the form at
  `/report-harassment` and `functions/api/harassment-report.js`. Deliberate
  exception to the review-gate pattern above: this function commits
  straight to `main`, no PR, because the schema only holds categorical/
  numeric fields (city, date, what happened, amount, deviceReturned,
  officerIdentified, willingToHelp) — nothing
  identifying or free-text ever reaches the repo. Any email address or
  free-text "anything else" the submitter adds goes only to an internal
  notification email (same Resend setup as testimonials), never committed.
  `src/lib/harassment-stats.ts` aggregates the collection at build time;
  both `/report-harassment` and the "Know your rights" section of
  `/india/law` read from it, so they can't drift out of sync. Built after
  the site owner asked to turn the harassment-reporting idea (people
  losing devices/paying bribes over a possession ban that doesn't exist)
  into the same kind of crowdsourced evidence base as the 2020 airport
  confiscation-report form — see `2020-2023-airport-confiscation-reports`
  in `campaigns` for that precedent, which directly produced the
  petitioners in the ongoing flight-ban litigation. If a future session is
  asked to extend this (e.g. a real map instead of the ranked city list,
  or surfacing individual moderated reports), re-read this note first —
  the "no PR gate" design only holds as long as nothing identifying is
  ever added to the schema.

`testimonials` writes `reviewed: false` drafts only; a human (or Claude, on
explicit instruction) must flip that flag before anything appears on a
live index page. Never auto-approve this one — read every PR before
flipping the flag; this is public-facing user content (a name, a location,
free text), and PECA's advertising-risk guard applies to it too (no
product brand names, purchase links, or vendor mentions). `research` used
to follow the same rule but no longer does — see below.

**`news` and `research` are both fully automated, as of 2026-09 (explicit
site-owner instruction): no human review gate.**
`scripts/fetch-news.mjs` writes `reviewed: true` directly and the GitHub
Action (`fetch-news.yml`) commits straight to `main` — no PR. `reviewed`
on a `news` entry now means "passed the automated filters" (commercial/
vendor domains via `blocklist.json`, industry press releases via
`press-wire-domains.json` + launch-language title patterns, and a feed's
own `keywordFilter`), not "a person checked it." The compensating control
the site owner asked for is a standing disclaimer on the News index page
itself: these are auto-generated from a wide pool of Indian and
international sources and don't reflect AVI's views. Two more layers were
added the same day, both similarly automated (no PR): `newsDigests` now
has daily → weekly → monthly digest tiers (`scripts/generate-weekly-
digest.mjs` / `generate-monthly-digest.mjs`, run by their own GitHub
Actions on Mondays / the 3rd of each month) that collapse elapsed weeks
and months into single roundup cards on `/news`, each expandable down to
the underlying daily digests and article cards. If asked to touch this
pipeline again: don't reflexively add a review gate back — that would
contradict the explicit instruction — but do flag it if you spot the
automated filters letting something through they shouldn't (a product
promotion, a mis-tagged item), since nothing else is checking anymore.

**`research` went the same way on 2026-09-16** — `scripts/fetch-research.mjs`
now writes `reviewed: true` and `fetch-research.yml` commits straight to
`main`, no PR (previously opened a weekly PR of `reviewed: false` drafts).
Unlike `news`, this collection has AI-classified *enum* fields
(`studyType`, `substance`) as well as free text, and this is the exact
collection that caused a real full-site build outage once already (see
"Design pass and a chain of build failures" below) when those enums came
back malformed — `getCollection()` fails the whole site's build on one bad
entry, not just that page. So going hands-off here required an actual
guardrail, not just the instruction: the script now validates `studyType`
against the schema's 7 allowed values and filters `substance` down to the
5 allowed tags (falling back to `other`/`[general]` if the AI's response
doesn't match), and clamps `brief` to the schema's 500-char max, all
*before* the file is written — see `sanitizeBrief()` in that script. If
asked to touch this pipeline, keep that validation step; it's the only
thing standing between a bad AI response and a broken production site.

**News sources (2026-09):** beyond the 6 original Google Alerts
(`contact@vapeindia.org`) and Filter/Clive Bates, `feeds.json` now also
pulls Vapers Digest (vapers.org.uk), Vaping Post, Clearing the Air and
Quit Like Sweden — all real outlet RSS feeds, all tagged `advocacy: true`.
`vaping360.com`'s `/feed/` was tried and rejected: Cloudflare bot
protection blocks it even with `-L`, returning a 403 after redirecting to
the homepage — don't re-add it without checking that's changed.

**Three Google Alerts removed (2026-09-13):** `feeds.json` had a second,
separate Google Alerts account (a different account ID from the 6 above,
never itself documented in this file) supplying three broad alerts —
"e-cigarettes", "Tobacco", "Vaping" — with no India/THR-specific scoping
at all. Site owner reported this was surfacing a lot of irrelevant news on
the homepage and asked for it to be dropped; removed all three from
`feeds.json`. These were also the exact feeds behind most of the junk
found and cleaned up earlier the same day (the Altria stock page, the
pannellum/unkk.top spam links, the vendor product page, the forum posts —
see the notes below) — broad, unscoped alert terms on a second account
were the real problem, not a filtering gap alone. Existing news entries
already published from these feeds were left as-is (each was already
vetted during that same cleanup pass); only the feed source itself was
removed, so no new items from it will be fetched going forward.

**Deleting a bad entry doesn't blocklist its URL (2026-09-13):** the
Filter/GFN prison re-entry article deleted earlier the same day (see the
full-corpus-sweep note above) reappeared verbatim on the very next
scheduled `fetch-news.yml` run — `existingUrls()` only checks files
currently in `src/content/news/`, so deleting a file makes its URL
fetchable again next time, and this one still passed the Filter feed's
`keywordFilter` (its RSS snippet apparently contains a stray tobacco-
adjacent word) even though the article itself is about criminal justice,
not THR. Its own AI summary said so plainly both times ("not relevant to
tobacco harm reduction advocacy") — broadened
`NO_CONTENT_SUMMARY_PATTERNS` with a second pattern group,
`OFF_TOPIC_SELF_ADMISSION_PATTERNS`, for this "AI says it's off-topic"
phrasing family, distinct from the "AI says there's no content" family
already there. Also caught and deleted one more instance of the same
underlying gap that a full corpus re-sweep turned up: a Blackburn Rovers
football "what's on guide" that a broad "e-cigarettes" Google Alert
surfaced (its own AI summary: "not relevant to tobacco harm reduction
advocacy"). **If a deleted entry ever comes back, this is why** — the fix
is always to broaden what the content-based check catches, not to
special-case one URL, since the pipeline has no per-URL exclusion list
and re-fetches anything not currently on disk.

**Non-article filter added (2026-09-13):** a broad "e-cigarettes" Google
Alert surfaced an Altria stock-data "company hub" page
(proactiveinvestors.co.uk/companies/altria-group-inc/) — no real article,
just a ticker page — and it went live on the homepage with a summary that
literally said no content was found to summarize. Found and fixed the same
day: 3 more contentless entries already live (a LinkedIn post, a TikTok
video, a Tobacco Reporter tag-archive page), all deleted, plus a fix in
`fetch-news.mjs` so this class doesn't recur — `NON_ARTICLE_URL_PATTERNS`
skips direct social-media post URLs before spending an AI call on them,
`MARKET_DATA_TITLE_PATTERNS` catches "company news & analysis"-style
titles, and `looksLikeNoContentSummary()` is a last-resort net that skips
writing the entry whenever the AI's own summary admits the snippet had
nothing to summarize. Deliberately did **not** block by domain
(investing.com and MarketWatch also carry genuine on-topic reporting — an
FDA marketing-denial order, a contraband-cigarette seizure, both already
live and correctly kept) and deliberately dropped an initial attempt at
generic `/tag/`/`/category/`/`/companies/` URL-path matching after it
false-positived on two real articles (Free Malaysia Today's permalinks
all contain "/category/nation/...", SMH's contain
"/business/companies/..." — ordinary section taxonomy, not an index page).
If this class of junk shows up again, check whether it's actually a new
shape the content-based check should have caught rather than reaching for
another domain/path rule.

**Spam/open-redirect entries found and removed (2026-09-13) — more serious
than the non-article case above, read this one:** while checking the
Altria fix, found six *more* live news entries, all titled some variant of
"[Quit vaping] guide" (`Best Way To Stop Vaping: A Science Backed Ultimate
Guide...`, `Juul 0 Nicotine: The Ultimate Guide...`, etc.), whose
`sourceUrl` was not a real article at all — each pointed at
`pannellum.htm?config=...video.unkk.top/panvape2/<id>`, an open-redirect
abuse of the pannellum panorama-viewer's `config` parameter on a
**compromised third-party server** (one was a University of Tokyo
research-institute subdomain, `itatani.issp.u-tokyo.ac.jp`; another a
personal site, `masterov.us`) to launder search authority for what is very
likely a scam/malware landing page at `unkk.top`. This is not just
off-topic content — it's AVI's own site linking visitors to a probable
malicious redirect. Root cause: these were written by the automated bot
(commit `13cb2b0`) *before* `SEO_GUIDE_SPAM_PATTERN` existed in
`fetch-news.mjs` (that title filter was added later the same day, in a
separate fix, and only prevents new matching entries — it doesn't
retroactively clean up ones already committed). All six deleted. Added a
second, independent guard either way: `isSuspiciousRedirectUrl()` blocks
by URL shape (`pannellum.htm?config=`, `unkk.top`) rather than relying on
the title pattern alone, since a campaign varying its title wording
("Science Backed", "Proven", "Complete") to dodge a keyword filter is
exactly the kind of thing that will eventually produce a title the
existing regex doesn't anticipate — the URL shape is the harder signal to
fake. **If any live news entry ever looks like an SEO "guide" with a
strange-looking source domain, treat it as a possible instance of this
same campaign and check the sourceUrl closely before assuming it's just
low-quality content** — verify what `fetch-news.mjs` currently guards
against (`git log -p -- scripts/fetch-news.mjs` shows the history) before
assuming an existing filter already covers it.

**Same 2026-09-13 pass, one more sweep — a systematic pattern worth
remembering:** while fixing the two issues above, ran every current
`fetch-news.mjs` filter as a standalone Python simulation against the
*entire* live `news` collection (not just the newly-reported items) to
check for anything else already slipping through, and found 8 more: a
vendor's own product page (`whitecloudelectroniccigarettes.com` — added to
`blocklist.json`, plus a new `isVendorHostname()` hostname-substring
backstop since that list will always lag new vendor sites), two ProBoards
forum-thread posts and one XenForo-style forum post (not articles — added
forum-URL patterns to `NON_ARTICLE_URL_PATTERNS`), two genuine device
reviews from Vaping Post (`Review: Armour Octa`, `Review: Pixo Aura 2` —
already covered by the existing product-review title filter, just
predated it), one genuinely off-topic Filter/GFN article about prison
re-entry (its own AI summary said so — caught once
`NO_CONTENT_SUMMARY_PATTERNS` was broadened, see above), and three
individual social-media posts (an X repost, two Instagram posts) that
`NON_ARTICLE_URL_PATTERNS` already covered but had been overlooked when
first found. **Also tried and reverted** a `facebook.com/<page>/posts/`
URL pattern: unlike the other platforms, this feed's Facebook links are
often a real news org's own distribution of a substantive story (a
Houston TV station, a Philippine outlet), so blocking the URL shape would
have silently dropped good content — the one actual bad Facebook post was
already caught by the no-content-summary check on its own, no separate
rule needed. **The lesson for next time:** when you fix a reported
instance of a filter gap, re-simulate every filter function against the
whole collection before considering the pass done — the reported instance
is rarely the only one, and a new pattern is worth pressure-testing
against known-good entries before wiring it in, not just known-bad ones.

**2023-2025 historical backfill (2026-09):** a one-time manual research
pass (WebSearch/WebFetch, not RSS — Google Alerts and most outlet feeds
only return recent items, they don't backfill) added 16 real, dated,
verified stories spread across 2023-2025 (Australia's vaping reforms, the
UK Tobacco and Vapes Bill's progress through Parliament, Sweden crossing
the WHO's 5%-smoking "smoke-free" threshold, India e-cigarette seizure
figures, Philippines/Japan developments, FDA menthol-ban delays, a
Cochrane review update, WHO FCTC COP10) plus one 2026 item found along the
way (Adani's Mumbai airport duty-free nicotine-pouch court case, July
2026). This measurably improved density but is **not exhaustive** — most
months in that window still have only 1-3 items, well below 2026's
feed-driven density, because it was a bounded search pass, not a full
archive trawl of every outlet. A future session with more time could go
outlet-by-outlet through 2023-2025 archives/sitemaps for a denser pass;
the sources and search terms used are visible in this session's news
entries (check each entry's `sourceUrl`) as a starting point.

## What's built vs. what's genuinely still open

Built and building clean (last verified 2026-09-10 via the GitHub Checks
API against Cloudflare Pages' actual build, since this repo has no
Node/npm in every working environment — see the "Design pass and a chain
of build failures" note below for why that verification step matters and
how to do it without a local build): Home, About, Contribute, India
(index + law), Litigation (index + detail, 8 entries), Press (index, card
grid split into Media Coverage / Press Releases & Statements, 70 entries,
61 with a working source link (updated 2026-09-12 — "the drive-zip dig")
and 9 still showing an "archive, not yet linked" note — see the note
below), Testimonials (index + submission form +
Cloudflare Pages Function, 0 published entries pending real submissions),
Science (index + 46 entries, card grid), News (index + 21 entries, card
grid — no per-article pages, cards link out to the source), Blog (index,
empty). Press/News/Science/India/Litigation were redesigned from plain
prose/lists to the homepage's card-based visual system 2026-09-10 — see
that note below before changing any of their layouts again.

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
etc.) needed before submissions open a review PR and send mail. **Update
2026-09-09: this is now configured and confirmed working** (PR-opening
half verified end-to-end; email half still blocked on Resend domain
verification, in progress — see the Hosting/DNS section further down).

**Press coverage recheck (2026-09-09):** searching specifically on Samrat
Chowdhery's name (not just "AVI"/"vapeindia") surfaced 10 legitimate,
previously-uncaptured bylines — 9 at Filter magazine (2018-2024, where he's
a recurring contributor covering India and broader Global South THR
policy) and 1 at Tobacco Reporter — now added to `press/`. Most were added
from title + date only (found via Filter's author index page, not each
article's full text) — worth a follow-up pass to read each in full and
add a real one-line summary once someone has time, rather than treating
the current placeholder notes as final. **Note for future sessions:**
per an explicit 2026-09-09 site-owner instruction, Samrat Chowdhery's name
and photo should stay understated in AVI's *own* copy (About page, hero
sections, etc. — done, see below) — that instruction does NOT extend to
scrubbing his name from accurate third-party byline/press records, which
is what this section is for.

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

One item flagged, not yet acted on — need the site owner's call, not a
unilateral edit:
1. ~~**Flight ban hearing date** — the entry states a hearing "scheduled for
   15 September 2026." Nothing in the archive (which stops in July 2023)
   can confirm this~~ — **confirmed accurate by the site owner, 2026-09-09**
   (asked specifically since that date was then only 6 days out). No change
   needed to `delhi-bcas-flight-ban.md`.
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
1. ~~Configure the Cloudflare secrets in `functions/README.md` so the
   testimonials pipeline actually works, then do a real end-to-end test
   submission~~ — **done 2026-09-09.** `GITHUB_TOKEN`, `GITHUB_REPO`,
   `GITHUB_BRANCH`, `NOTIFY_EMAIL` all set on Production; a real submission
   opened PR #3 successfully. Root cause of a long debugging session: the
   stored `GITHUB_TOKEN` secret value was silently bad after an in-place
   name+type edit (TOKE→TOKEN, plain_text→secret_text) — editing a secret
   field in place is not reliable, **delete and re-add fresh rather than
   editing** if this happens again. `RESEND_API_KEY` is also set, but
   email sending is still blocked on Resend domain verification (see DNS
   section below — the records are now in Cloudflare's zone, just not
   authoritative yet). **Correction/caution:** PR #3 ("New testimonial —
   Test Submission 12...") is a test artifact from this session's
   debugging — safe to close without merging. ~~PRs #1 (news) and #2
   (research) are real content drafts from the actual automation
   pipelines — review them properly, don't just close them~~ — **reviewed
   and merged directly to `main` 2026-09-09** (no `gh`/API token available
   in that session; merged via authenticated `git` instead — PR #1/#2 on
   GitHub will likely still show as open/stale and should be closed
   manually, their content already landed). PR #2 (research, 43 entries):
   all on-topic, merged and `reviewed: true`; 3 borderline entries kept
   but flagged for the site owner (tobacco/cigarettes only a secondary
   variable — a cannabis-treatment trial, a cocaine-addiction drug repurposed
   for smoking, a general COPD-mechanism review). PR #1 (news, 30 candidate
   entries): found that `scripts/config/feeds.json`'s `filtermag.org/feed/`
   entry pulls Filter's **entire** output across all drugs, not just
   tobacco/nicotine — 9 of 30 candidate entries were general US drug-policy
   content with zero tobacco/vaping relevance (methadone reform, a fentanyl
   survey, prison re-entry, a workforce-grant bill, a hemp-ban campaign,
   drug-war-myths commentary, a meth piece, one on violence against women
   who use drugs) and were dropped rather than merged. Remaining 21 (20
   Clive Bates + 1 on-topic Filter piece) merged and `reviewed: true`.
   **Fixed the root cause too:** added a `keywordFilter` field to the
   Filter (GFN) feed entry in `feeds.json` and taught `fetch-news.mjs` to
   skip items whose title+snippet match none of those keywords, so future
   scheduled runs shouldn't need this manual pruning again. Also noted in
   passing: Filter published "The Unfolding Tragedy of India's Vape
   Prohibition" (filtermag.org/india-vape-prohibition/), India-specific and
   highly relevant, which postdates this PR's pipeline run — will show up
   next time `fetch-news.yml` runs.
2. ~~Fill remaining `PLACEHOLDER` HTML comments in `about/index.astro` and
   `contribute/index.astro`~~ — **done 2026-09-09.** Bank transfer details
   (A/C 034661900003311, IFSC YESB0000346, Yes Bank), CIN
   (U74999MH2020PTC336631), and the UPI QR code (`public/contribute-qr.jpg`
   — note `.jpg`, not the `.png` the old placeholder comment assumed;
   source file's actual format) with its UPI ID
   (`yespay.bizsbiz129416@yesbankltd`) are all live on `/contribute` and
   `/about`. **Registered office address deliberately omitted** — explicit
   site-owner decision, not an oversight; don't re-add a placeholder for it.
   **Correction:** a second `about/index.astro` placeholder (board/advisor
   names + a "few lakh" community-size claim) was missed in that earlier
   pass and only found/closed 2026-09-09. Resolved by pulling the Governing
   Board list from the old site's `contact-us` page (archived at
   `vapeindia-org-archive-2026-09-09/contact-us/index.html`) — Samrat
   Chowdhery (kept minimal, per the de-emphasis instruction elsewhere in
   this file), Dhaval Gogate, Maneesh Kasera, Olivier Vulliamy, Kanav Rishi
   Kumar, Shreyas Madhan — confirmed by the site owner (2026-09-09) as
   still the current board. Bios were condensed from the old site's full
   personal quit-story paragraphs to one line each in this site's more
   institutional tone; deliberately dropped the old bio's mention that
   Maneesh Kasera "established a vape business" — even unnamed, a board
   bio mentioning a member's vape business reads too close to the
   PECA advertising-risk line for AVI's own About page. Also deliberately
   did not carry over the old site's per-member WhatsApp/email/Twitter
   contact links — 8-year-old personal contact info, not something to
   republish without asking first. The "few lakh" community-size figure
   was dropped entirely rather than sourced — nothing in the old-site
   archive supports a specific number (searched the full archive for
   "lakh"; the only hits are about tobacco's economic cost, not AVI's
   community size), and the site owner confirmed dropping the claim
   rather than supplying one.
3. ~~Populate `scripts/config/feeds.json` with real Google Alerts RSS URLs~~
   — **done 2026-09-08.** All 6 topics (the original 5 plus smokeless
   tobacco India, added after the site owner noticed it was missing) now
   have real feed URLs. Note: Google Alerts RSS feeds don't backfill
   history — only new items going forward will show up.
4. ~~Build out `public/_redirects` with every surviving old-site URL before
   DNS cutover~~ — **done 2026-09-09.** All 66 URLs from the live
   `sitemap.xml` are now covered: specific matches where a confident
   mapping existed (e.g. `/pil-karnataka/` → the Karnataka litigation
   detail page, `/share-your-vaping-experience/` → `/testimonials`), a
   `/press` fallback for old individual posts (the press collection has no
   per-article pages on the new site, so this is the best available
   landing spot, not a deep link), `/` for WordPress account-system pages
   and pages with no new-site equivalent, and `/blocks/*` (5 URLs)
   deliberately left unredirected — those are Gutenberg reusable-block
   storage, never real public pages. Verified programmatically against the
   sitemap list — zero gaps.
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

## Design pass and a chain of build failures (2026-09-10) — read this if
## the live site ever looks stale again

The site owner asked for a visual design pass (Press/News/Science/India
were plain text/lists vs. the homepage's real design system). That
surfaced something much worse: **the live site had been stuck on a stale
Cloudflare Pages build since the 2026-09-09 news/research PR merge** —
every commit since then, including this session's own early fixes,
silently failed to deploy. Confirmed via the GitHub Checks API
(`/repos/vapeindia/AVI-website/commits/<sha>/check-runs` — no Cloudflare
API token was available this session to read the actual build log
directly, but the GitHub check-run's pass/fail state was enough).
**If the live site ever looks like it's not reflecting a recent commit,
check that API first**, before assuming the deploy just hasn't finished
— a build can fail silently with no other visible signal from this side.

Root cause: `getCollection()` validates every entry in a collection
against its Zod schema at build time, and **one bad entry fails the
entire site build**, not just that entry. Four research entries carried
invalid enum values from the original PubMed-pipeline AI classification
(`studyType: "systematic-review, meta-analysis"` — comma-joined, not a
real enum member; `substance: [...,"smokeless",...]` and `"nicotine"` —
neither is in the `substance` enum, which only has
e-cigarette/nicotine-pouch/snus/combustible/general). Fixed 2026-09-10.
**Any future automated content pipeline (fetch-news.mjs, fetch-research.mjs,
or a manual add) should validate its enum fields before writing a file** —
nothing currently does this, and the AI-classification step in
`fetch-news.mjs`/`fetch-research.mjs` has no guardrail stopping it from
writing an invalid `topic`/`studyType`/`substance` value again.

Also found and fixed on the way:
- **`/india/` redirect loop** — `public/_redirects` had a leftover
  `/india/ -> /india` rule from the old-site URL migration that
  self-referentially looped with Cloudflare Pages' own trailing-slash
  normalization. Took the whole India section down (`ERR_TOO_MANY_REDIRECTS`)
  — likely why it looked "empty" rather than just "broken."
- **Homepage's "Latest news" links 404'd** — pointed to `/news/{id}`,
  which doesn't exist (news has no per-article page). Now links to
  `sourceUrl` directly, matching how the News index itself links out.
- **Press page's links were broken for entries with neither `url` nor
  `archivePdf`** — 52 of 71 entries (pre-existing, not new) have neither.
  The old plain-list template rendered `href={undefined}` for these
  invisibly; the new card template now conditionally shows "Source: AVI
  press archive (not yet linked online)" instead. **Mostly closed
  2026-09-12** ("the drive-zip dig"): worked through the `AAA-Vaping-*.zip`
  Drive export (8-part Google Takeout, part 003 missing, extracted to
  sibling folders `AAA-Vaping-20260903T021013Z-1-00[1,2,4-9]` at the top
  level of the local working folder, outside this repo) — specifically
  `AAA-Vaping/AVI/AVI Board/AVI Outreach/Press releases/` and its nested
  `Press Releases/AVI Press releases/` subfolder, spread inconsistently
  across parts. Extracted plain text from each `.docx` candidate via a
  zero-dependency zip+XML reader (`.docx` is a zip of XML; write one if
  redoing this — read `word/document.xml`, iterate `<w:p>` joining
  `<w:t>` children) and confirmed 37 genuine matches by content (title,
  dateline, quotes, names — not filename similarity alone: one look-alike,
  a Deccan Chronicle piece that matched by headline but was actually
  about a different, earlier ban announcement, was correctly left
  unlinked). Each match is now hosted as a raw `.docx` at
  `public/archive/press/<slug>.docx` (no PDF-conversion tool was available
  in this environment — no soffice/libreoffice/pandoc on PATH — so these
  are linked as-is; the `archivePdf` field name is legacy and just holds
  a URL string, format-agnostic) and linked via that entry's `archivePdf`
  frontmatter field. This also resolved two entries previously written
  off: `2018-delhi-hc-hear-traders` (the matching file in the archive is a
  legacy `.doc` with no `.docx` twin — found a different, later `.docx`
  covering the same court hearing) and `2020-pedicon-doctor-debunks-myths`
  (no candidate had turned up in the original search pass — found under
  an unrelated-looking filename, "Press Release-Dr Vikas Jain.docx").
  **9 entries still have no confirmed source** (checked, no match found,
  or no candidate file exists in the archive at all): `2016-toi-bangalore-
  rti`, `2018-medical-policy-experts-conference`, `2019-haryana-ban-
  warning`, `2019-maharashtra-ban-opposition`, `2019-vapers-oppose-ban-
  bill` (this one should instead reuse the already-hosted "AVI Letter to
  MPs_Ecig Ban" PDF from the Submissions collection, if that ever gets
  hosted — see the Submissions note elsewhere in this file), `2020-
  airport-harassment-legal-action`, `2020-hrpr-one-year-ordinance-quote`,
  `2020-kasera-onlymyhealth-tobacco-pandemic`, `2020-slt-spitting-covid-
  pinkvilla`. Don't re-search filenames already ruled out in this pass
  (check git log on this file for the full candidate list checked) —
  focus a future pass on reading full file contents for anything with an
  ambiguous filename rather than re-grepping titles.
- 13 press entries (mostly the 10 Filter/Tobacco Reporter bylines added
  2026-09-09) had internal research notes as their body ("Found via
  Filter's author index... full text not read") rather than a real
  summary — harmless while nothing rendered that body, but about to go
  live verbatim once the press page started rendering it. Fetched and
  read the actual 8 Filter + 1 Tobacco Reporter articles and wrote real
  summaries; trimmed the other 4 (which already had real content mixed
  with dating/dedup working-notes) down to public-facing text.

What actually shipped, design-wise: extended the homepage's existing
system (Fraunces/Inter type, teal/gold/rust palette, DecorativeRings,
icon cards, color-band sections) to Press, News, Science, India (index +
`law.astro`), and Litigation — all converted from plain prose/lists to
card grids with type/topic/status badges, in the `wide` Base layout. Press
cards render each entry's own markdown body as the gist (via
`astro:content`'s `render()`), rather than adding a new schema field —
that content already existed in every file, it just was never rendered
anywhere before this. `india/law.astro` keeps every sentence of the
existing legal text verbatim; only added a three-card "status at a
glance" panel and section icons.

**No local build verification was possible this session** — no
Node/npm in this environment (checked common Windows install paths, none
found). All verification was: (1) a hand-written Python validator
checking all 146 content files against the exact Zod schemas in
`content.config.ts` before pushing, (2) polling the GitHub Checks API
after push to confirm Cloudflare's build actually succeeded, (3)
fetching the live rendered HTML with curl/Python (not a real browser —
the Chrome extension lost connection partway through this session and
wouldn't reconnect) to confirm card counts and content matched
expectations. Recommend an actual visual/browser check next session
before treating this as fully done.

## Research memo: consumer advocacy landscape, India context, evidence base
## (2026-09-09)

`research/consumer-advocacy-landscape-2026-09-09.md` in this repo — a deep
research pass across the global THR consumer advocacy movement (52 orgs
worldwide per Jerzyński et al. 2023, regional umbrella bodies CASA/ARDT
Iberoamérica/ETHRA/CAPHRA, design references from ~10 peer orgs), India's
tobacco use landscape (GATS-2 data, product-level SLT breakdown, a tribal-
community equity angle not yet used on the site), and an evidence-base
catalog (a 2020 India-specific 8-city vaper survey and the current
Cochrane e-cigarette-vs-NRT review, both added as draft `/science` entries
— `reviewed: false`, pending site-owner approval like everything else in
that pipeline). Read that file before doing further design or `/science`
content work — it has citations, caveats, and a couple of leads flagged
as unverified (a September 2025 NTCP nicotine-pouch licensing detail in
particular) rather than treated as confirmed fact.

## Peer THR org links on /about (2026-09-17)

Acted on the memo's "live link target" suggestion above: `/about`'s
existing "AVI is one of ~50 orgs worldwide" paragraph now links three
regional peers — **ETHRA** (Europe), **ARDT Iberoamérica** (Latin
America), **CASA** (Africa). **CAPHRA deliberately excluded** — explicit
site-owner instruction, consistent with the existing CAPHRA/INNCO
membership-departure policy elsewhere in this file (don't imply a current
relationship with either). INNCO itself also stays out of this link list
for the same reason; it's mentioned in the next sentence only in the
already-established historical/past-role framing (Samrat Chowdhery's INNCO
presidency), not as a live "we work with them" link.

Two link-target notes if this is ever revisited: CASA's site
(safer-alternatives.org) only resolves over **http**, not https — TLS
connection fails outright (verified, not transient); the http link is
intentional, not an oversight. ARDT Iberoamérica now has its own domain,
ardtiberoamerica.org — use that, not the innco.org/ardt-iberoamerica/
profile page the original research memo pointed at (innco.org was
unreachable when this was checked; using their own domain also avoids the
same INNCO-adjacency issue as above).

## /india hub: grounding-text section (2026-09-18)

Added a 4-block "A crisis being managed backwards" section to `/india`
(between the stat band and the "five ways in" nav grid) — scale of the
problem, bans removing the off-ramp, government's ITC stake as a conflict
of interest, and research/speech restrictions. Site-owner brief asked for
five things; two got merged into one block each since they're the same
underlying mechanism or read better together (landscape + "worsening"
framing → one "scale of it" block; ENDS research ban + physician-specific
restriction → one block, since both trace to the same Dec 2023 NMC
directive).

**One deliberate correction from the brief, worth knowing if this gets
revisited**: the brief described "the MeitY ban on promotion... loosely
applied to include even non-product discussions." Research found MeitY's
actual confirmed role is narrower — e-commerce takedown notices against
sites selling ENDS, a straightforward PECA Section 4 enforcement action,
not the non-product-discussion overreach. The incident that actually
matches "loosely applied to non-product discussion" is different: in May
2023 a Niti Aayog-linked THR policy panel (named no products, included
voices critical of the ban) was branded "promotion" by the **Health
Ministry**, not MeitY — found via two independent web searches, both
pointing to the same Filter Magazine piece ("India Doubles Down on Vape
Ban With Research and Media Censorship," filtermag.org). That article
404s on direct fetch (bot-blocked, not dead — confirmed via WebFetch),
so it's corroborated only by search-engine synopsis, not a page read
directly; treat as solid-but-not-primary-verified if it's ever cited more
prominently than the current one-clause mention. The site copy attributes
the incident to "the Health Ministry," not MeitY, accordingly — don't
"fix" this back to MeitY without re-verifying.

Other sourcing for that section: ITC government stake (~28% via LIC +
SUUTI + other public insurers) — The Print, "Govt has banned vapes, but
owns 28% of ITC," 2023, headline alone is directly citable. NMC physician
research directive — The Tribune, Dec 2023, corroborated independently by
a Careers360 report found via a separate search. SLT oral-cancer burden
stat (India ~70% of global 2022 cases) — Lancet Oncology, 2024, DOI-linked.
Did NOT cite GATS-3 for a "worsening trend" claim — it isn't published yet
despite fieldwork being underway; the "scale of it" block relies on
already-published GATS-2 figures plus the newer Lancet stat instead, and
avoids any explicit before/after prevalence comparison the data can't
support.

**Later revisions (still 2026-09-18):** the stat band was removed and its
numbers folded into the "scale of it" block's prose instead, which now
leads the section right after the hero (site owner wanted text-first, not
a big standalone number band). "ITC" was also dropped from the government-
stake block — it now says "India's largest cigarette maker," with the
name left to the cited Print article rather than stated in body copy. The
Lancet oral-cancer stat and the 350,000+ SLT-deaths stat were cut from
"scale of it" per a follow-up request and not relocated elsewhere; if
that data is wanted back on the page, it isn't preserved in a draft
anywhere, it was simply removed. All four blocks were then trimmed to a
tight, deliberate length band (roughly 300-330 plain-text characters
each) so they render as visually equal boxes in the 2x2 grid — if any
block's copy changes going forward, rebalance the others to keep that
parity rather than letting one drift long.

## Removing someone from a group photo without it looking edited (2026-09-18)

`2018-2020-state-ban-press-conferences.md` (earlier session) had the CHRA-
banner problem solved by dropping photos entirely. This one
(`2020-11-delhi-delegation-mos-health.md`) needed a person removed from a
photo the site owner otherwise wanted to keep — the MoS Health delegation
shot — and a straight blur read as obviously deliberate (see the earlier
attempt in git history: `delegation-mos-health.jpg`, replaced). Site owner
also explicitly didn't want a rectangular crop-based fix once one was
tried, since it either cut into the person's own reaching arm/the actual
handover moment, or required cutting through a distinctive architectural
line (a wall corner + ceiling molding + the wall clock all sit right
above the group), which would show as a visible stitch seam — worse than
a blur, not better.

**What actually worked**: an irregular, organic-looking cutout baked
into the image's alpha channel (PNG, not JPEG) — a gently wavy top edge
across the whole photo (so it reads as a deliberate "torn/deckle-edge"
photo treatment, not a targeted edit) with one deeper V-shaped dip
positioned exactly over the unwanted person's head, reaching down past
his chin/collar before the reaching-arm/flower-handover content starts
lower in frame. Since his head sits *higher* in the frame than the
handover gesture (which happens at desk height, lower and to the side),
a boundary that isn't a straight line can duck below his head while
staying clear of everything else — a straight vertical crop genuinely
can't do this (the arm and his torso overlap in x-position, just not in
y), which is why the earlier crop attempt failed.

Built with Python/PIL (`pip install pillow`): a sine-wave base for the
gentle overall waviness, a Gaussian-shaped dip added on top at the
target x-position for the deeper cut, `Image.putalpha()` with that mask,
saved as PNG. Deliberately **not** a CSS `clip-path` applied at render
time — this photo renders inside a `.photo-strip img` with
`object-fit: cover` at a fixed height and variable (grid-driven) width,
so the visible crop window shifts with viewport/container size; a
live clip-path risks the wrong region being visible at some width. Baking
the cutout into the file's actual pixels means the removed person's data
simply doesn't exist in the file at any crop/zoom/viewport — verified
this is safe across realistic container aspect ratios for this specific
usage (the math: the box would need to be something like 1400px wide at
only 128px tall — never happens in this layout — before object-fit:cover
could crop far enough into the top to re-expose the area under the notch).

The `<img>` sits directly on the campaign card's white background with no
other layer behind it, so the transparent notch reads as "the photo has
a white gap here" — matches the card seamlessly. If this card's
background color ever changes, this specific PNG's transparency will need
no adjustment (it's genuinely transparent, not a hand-matched fill
color) — but do re-check it still looks intentional against whatever the
new background is.

## Sitewide audit: end-of-page connectors (2026-09-17)

Site-owner ask: every page should end with links taking the reader further
into the site, not just stop. Four pages already had this (`.related-card`
grid pattern — `litigation/index.astro`, `science/index.astro`,
`submissions/index.astro`, `report-harassment/index.astro`); audited every
other page template and added the same pattern where the page actually
ended cold: `about`, `india/law`, `india/rti-replies`,
`litigation/[...slug]` (every case page), `science/[...slug]` (every study
page), `media`, `news`, `press`, `quit`, `policy`. Left unchanged:
`india/index` (the page's whole body already is a connector grid),
`index.astro`/homepage (already link-dense throughout, closes on a real
CTA), `search.astro` (a tool, not a content page).

The `.related-card` CSS is copy-pasted per-page (Astro styles are scoped,
not shared) — same declarations every time: `display:block;
text-decoration:none; color:inherit; background:var(--paper-alt);
border-radius:8px; padding:1.25rem 1.4rem; transition:transform 0.15s
ease` plus a `:hover{transform:translateY(-2px)}` and h3/p rules. If this
needs to change site-wide, it's currently N separate edits, not one — a
shared `<RelatedLinks>` component would be the fix if that becomes a
maintenance burden, not attempted here since scope was "add what's
missing," not "refactor what's duplicated."

## Campaigns page: shareable materials + "get involved" (2026-09-17)

`/campaigns` now has two new sections beyond the campaign record itself:

- **Campaign materials** (right after the hero): 5 downloadable posters
  (`public/images/campaigns/materials/`, sourced from `AVI Board/AVI
  Outreach/Melwood/Posters/For Insta/` in the Drive archive — Melwood was
  AVI's design agency, so this is AVI's own commissioned creative, not
  third-party content). Curated deliberately, not just "the first N found":
  the same archive folder (`World Vape Day/2021/...`) also contains (a)
  posters photographing actual vape hardware — skipped, since that reads
  closer to product depiction than advocacy under PECA's advertising ban;
  (b) third-party-branded infographics (Public Health England, a site
  called "VAEPworld.com") — skipped, no redistribution rights confirmed;
  (c) posters rebutting/attacking named politicians by name and photo
  ("PICS OF POLITICIANS", "Rebuttal [Name]") — skipped as unsuited to a
  generic public "grab and share" feature. The 5 published are text/stat-
  only, AVI-branded, and were already AVI's own public social content
  historically. Resized from 3240x3240 (up to 12MB) source PNGs to
  1080x1080 JPEGs (~100-180KB, Instagram-ready) via the same PowerShell
  System.Drawing resize pattern used elsewhere in this repo. Each card is
  an `<a download>` link straight to the image.
- **Get involved, beyond funds or a testimonial** (`#get-involved`, end of
  page): the site already had `/contribute` (funds) and `/testimonials`
  (stories) as asks, but nothing for expertise/time/ideas — the site owner
  had a form for this, `bit.ly/ConnectAVI` (a Google Form titled "Connect
  with AVI", asking for legal/medical/media/PR/admin skills, city/state,
  social handles, willingness to donate). Rather than just linking out,
  it's **embedded inline** via `<iframe src="...viewform?embedded=true">`
  — Google's own supported embed pattern — so visitors don't leave the
  site. Fixed iframe height (2500px) was tuned by actually loading the
  form and checking for the double-scrollbar problem (Google Forms doesn't
  post a resize message, so there's no way to auto-fit); if the form's
  question set changes significantly, re-check this height. A plain
  `bit.ly/ConnectAVI` link remains as a fallback ("Form not loading?") for
  anyone whose browser/ad-blocker blocks the iframe. Cross-linked from
  `/contribute` and `/testimonials`'s related-links so all three asks
  (funds, stories, other help) surface from wherever a visitor lands.

Also added a `download` icon to `src/components/Icon.astro`'s shared set
(a plain arrow-into-tray glyph, consistent with that component's existing
"symbolic, never a product depiction" rule).

**Bug caught and fixed while building this**: `.material-card img` had
`width="1080" height="1080"` HTML attributes (for CLS prevention) *and*
`aspect-ratio: 1` in CSS intending a responsive square thumbnail. The
`height` attribute becomes a low-priority presentational hint that still
sets a definite `height`, and CSS `aspect-ratio` only computes an *auto*
dimension — so with height already definite via the attribute, the
posters rendered as tall 1080px-high strips instead of squares. Fixed
with an explicit `height: auto` in the CSS rule, which overrides the
attribute and lets `aspect-ratio` do its job. Worth remembering any time
width/height attributes are combined with a CSS `aspect-ratio` on the same
element.

## Old-site archive (2026-09-09)

Before any DNS/hosting changes, the live `vapeindia.org` (still on WordPress
5.9.16 via Hostinger — see below) was fully archived to
`C:\Users\samra\OneDrive\Documents\AVI Website\vapeindia-org-archive-2026-09-09\`
(outside this repo — it's a local backup, not committed): 848 files, 311MB —
all 66 sitemap pages, 541/545 media files known to WordPress (including 298
orphaned uploads never linked from any public page, found only via the WXR
export), and a full WXR/XML content export
(`wordpress-export/...WordPress.2026-09-09.xml`) with every post, page,
comment, custom field, and nav menu. Only 4 files are missing, and all 4
404 directly from WordPress's own server too — genuinely gone, not an
archive gap. This exists so the site owner can safely change nameservers
without needing the (unresponsive) web designer's cooperation — see next
section.

## Hosting/DNS situation (as of 2026-09-09) — important context for any
## future session touching DNS or hosting

`vapeindia.org` is **registered at GoDaddy but its DNS is currently
managed at Hostinger**, apparently set up by the site owner's web
designer, who has gone unresponsive and is a soft blocker the owner wants
to route around rather than confront (worried about being charged for
any acknowledgment of a rebuild). Key finding: **DNS/hosting control and
registrar control are separate — the site owner already has full GoDaddy
access and does NOT need the designer's cooperation to cut over.**

Plan and progress (steps 1-3 done 2026-09-09; confirm current state before
assuming later steps are done too):
1. ~~Add `vapeindia.org` to Cloudflare as a site~~ — **done**, zone status
   is `pending` (added, not yet authoritative — nameservers still point
   at Hostinger). Zone ID `9c760428f876e7210fa37691ac168284`, account ID
   `87f97f5fd0a6fad0d648b9d28151a66e` ("Contact@vapeindia.org's Account").
2. ~~Review the imported zone~~ — **done.** Gmail's 5 MX records came
   through correctly. Two things found worth knowing: `autoconfig`/
   `autodiscover` CNAMEs still point at Hostinger's mail service (likely
   inert leftovers from before a mail migration, given MX is fully on
   Google — not confirmed either way, hasn't needed resolving yet); the
   root SPF TXT record only included `_spf.mail.hostinger.com`, not
   Google's — **fixed 2026-09-09** by merging in `include:_spf.google.com`
   alongside (not replacing) Hostinger's, so nothing already relying on it
   breaks. Record content on this zone is stored with literal wrapping
   quote characters (a Hostinger-import quirk) — preserve that convention
   if editing this record again.
3. ~~Add the Resend domain-verification DNS records~~ — **done**, all 4
   records (DKIM TXT, 2 CNAMEs, DMARC TXT) added to the Cloudflare zone
   with zero conflicts. Won't actually verify in Resend until nameservers
   switch (Hostinger is still authoritative), but nothing left to do here
   until then.
4. Add `vapeindia.org` as a custom domain on the Cloudflare Pages project
   (`avi-website`, currently at `avi-website-9f9.pages.dev`) — **not done
   yet.**
5. Only once 1-4 are verified working: change nameservers at GoDaddy from
   Hostinger's to Cloudflare's. This is the actual go-live moment — do it
   deliberately, with a buffer day, per the original deadline-context
   guidance below. Confirm email still works and the new site loads
   correctly afterward. **Not done yet.**

**API access set up 2026-09-09, for this and future sessions:** a
fine-grained GitHub PAT (Contents/Workflows/Pull requests/Actions/Secrets:
Read and write, scoped to `vapeindia/AVI-website` only, 90-day expiry) and
a Cloudflare API token (Account→Cloudflare Pages: Edit, Zone→Zone: Read,
Zone→DNS: Edit, scoped to the one zone/account above, 90-day expiry) were
both issued to reduce the friction of walking the site owner through
manual dashboard steps and screenshot/log-paste cycles. Neither token
value is stored anywhere in this repo or in this file — they exist only
within the session(s) they were shared in. A fresh session has neither and
will need to ask the site owner for new ones (same permission sets above)
to regain this capability; don't assume a past session's tokens are still
live.

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

YouTube: youtube.com/@vapeindia (channel ID UCEgd8dgEScqYKKUBHwD1DDQ,
titled "Association of Vapers India" — verified 2026-09, and now the
source for the automated /media page pipeline, see below) · X: @vapeindia
· Instagram: @avi_vapeindia · Facebook: facebook.com/avindia · LinkedIn:
linkedin.com/showcase/vapeindia.
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
