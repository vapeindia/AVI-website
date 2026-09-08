# Cloudflare Pages Functions

`api/testimonial.js` handles POST submissions from the form at
`/testimonials`. It is picked up automatically by Cloudflare Pages — no
build config needed — as long as this `functions/` directory sits at the
repo root, next to `src/`.

## Required setup before this works live

Cloudflare Pages → your project → **Settings → Environment variables**, add
these as **secrets** (encrypted, not plain text) for the **Production**
environment (and Preview, if you want the form testable on preview deploys):

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | A **fine-grained personal access token**, scoped to this one repo only, with repository permissions **Contents: Read and write** and **Pull requests: Read and write**. Create at github.com/settings/personal-access-tokens/new, signed in as the account that owns this repo. |
| `GITHUB_REPO` | `owner/repo-name`, e.g. `avi-org/avi-site` |
| `GITHUB_BRANCH` | Your default branch name, usually `main` (optional — defaults to `main`) |
| `RESEND_API_KEY` | An API key from [resend.com](https://resend.com) (free tier: 3,000 emails/month). Requires verifying `vapeindia.org` as a sending domain there first — Resend gives you 3 DNS records (SPF/DKIM/DMARC-related) to add. Since DNS already lives at Cloudflare per the migration plan, add them there as regular DNS records; this does not affect existing Gmail MX records for `contact@vapeindia.org`. |
| `RESEND_FROM` | Optional, defaults to `AVI <contact@vapeindia.org>` |
| `NOTIFY_EMAIL` | Optional, defaults to `contact@vapeindia.org`. Every submission also sends **one internal email here with the submitter's address included** — this is the only place that address is ever recorded, so a team member can reply to follow up before a testimonial is approved. |

**Until these are set**, the function still works, but degrades gracefully:
- No `GITHUB_TOKEN`/`GITHUB_REPO` → no PR is opened; submissions are only
  emailed (nowhere for you to actually see them — set this up first).
- No `RESEND_API_KEY` → no thank-you email is sent; the PR still opens.

Both are logged to the Cloudflare Pages Functions log (visible in the
Cloudflare dashboard) when skipped, so you can tell which secret is missing.

## Why this design

- **Privacy by construction**: the submitter's email address only ever
  touches this one function, in memory, for exactly as long as it takes to
  call Resend. It is never written into the GitHub PR, the git history, or
  any file this site's build reads. The `testimonials` content collection
  schema (`src/content.config.ts`) has no email field at all.
- **Nothing publishes unmoderated**: this mirrors the existing pattern for
  `news` and `research` — a human reviews every draft PR and flips
  `reviewed: true` before it can appear on `/testimonials`.
- **No new hosting dependency**: Cloudflare Pages Functions run on the same
  Cloudflare account already hosting the site; Resend is the one new
  account this needs, and it's free at this volume.

## Known limitation

The honeypot field (`website`) is the only spam defense. If this form
attracts bot traffic once live, the next step up is Cloudflare Turnstile
(free, same account, no new vendor) — ask for that build if it becomes a
problem rather than adding it pre-emptively.
