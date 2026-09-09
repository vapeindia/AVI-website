/**
 * Cloudflare Pages Function — POST /api/testimonial
 *
 * (Trivial comment-only edit, 2026-09-09: forces a fresh commit-triggered
 * deploy to rule out stale env vars from a "Retry deployment" replay.)
 *
 * Handles submissions from the form at /testimonials. Two things happen on a
 * valid submission, best-effort and independently of each other:
 *
 *   1. A markdown draft (name, location, date, testimonial — NOT the email
 *      address) is committed to a new branch and opened as a pull request
 *      against src/content/testimonials/, with `reviewed: false`, mirroring
 *      the review-gate pattern already used by scripts/fetch-news.mjs and
 *      scripts/fetch-research.mjs. A human must flip that flag before the
 *      testimonial appears on the site — nothing here auto-publishes.
 *   2. A thank-you email is sent to the submitter via the Resend API, from
 *      contact@vapeindia.org.
 *
 * The submitter's email address is used only for step 2. It is never written
 * to a content file, never committed to the repo, and never rendered on the
 * site.
 *
 * Required Cloudflare Pages environment variables/secrets — see
 * functions/README.md for how to set these up:
 *   GITHUB_TOKEN      — fine-grained PAT scoped to this repo only, with
 *                       "Contents: read/write" and "Pull requests: read/write"
 *   GITHUB_REPO       — "owner/repo", e.g. "avi-org/avi-site"
 *   GITHUB_BRANCH     — base branch to open PRs against (default "main")
 *   RESEND_API_KEY    — API key from resend.com, once vapeindia.org is a
 *                       verified sending domain there
 *   RESEND_FROM       — optional, defaults to
 *                       "AVI <contact@vapeindia.org>"
 *   NOTIFY_EMAIL      — optional, defaults to "contact@vapeindia.org". The
 *                       submitter's email is included ONLY in this internal
 *                       notification (so a human can follow up if needed) —
 *                       never in the GitHub PR/content file.
 *
 * If GITHUB_TOKEN or RESEND_API_KEY are not set, this function degrades
 * gracefully: it skips the step it can't perform and logs why, rather than
 * failing the whole request, so the other step can still succeed.
 */

const MAX_LEN = { testimonial: 2000, name: 100, location: 100, email: 200 };

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function toFrontmatter({ name, location, testimonial }) {
  const date = new Date().toISOString().slice(0, 10);
  return `---
name: ${JSON.stringify(name)}
location: ${JSON.stringify(location)}
date: ${date}
testimonial: ${JSON.stringify(testimonial)}
reviewed: false
featured: false
---
`;
}

async function openTestimonialPR(env, { name, location, testimonial }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log('Skipping GitHub PR: GITHUB_TOKEN or GITHUB_REPO not configured.');
    return { skipped: true };
  }

  const baseBranch = env.GITHUB_BRANCH || 'main';
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'avi-site-testimonial-function',
  };

  // 1. Get the SHA the new branch should start from.
  const refRes = await fetch(`${api}/git/ref/heads/${baseBranch}`, { headers });
  if (!refRes.ok) throw new Error(`git ref lookup failed: ${refRes.status} ${await refRes.text()}`);
  const refJson = await refRes.json();
  const baseSha = refJson.object.sha;

  // 2. Create a new branch.
  const branch = `auto/testimonial-${Date.now()}-${slugify(name)}`;
  const createRefRes = await fetch(`${api}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createRefRes.ok) {
    throw new Error(`branch create failed: ${createRefRes.status} ${await createRefRes.text()}`);
  }

  // 3. Create the content file on that branch.
  const date = new Date().toISOString().slice(0, 10);
  const path = `src/content/testimonials/_inbox/${date}-${slugify(name)}.md`;
  const content = toFrontmatter({ name, location, testimonial });
  const putRes = await fetch(`${api}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Testimonial: add submission from ${name} (${location})`,
      content: utf8ToBase64(content),
      branch,
    }),
  });
  if (!putRes.ok) throw new Error(`file create failed: ${putRes.status} ${await putRes.text()}`);

  // 4. Open the PR.
  const prRes = await fetch(`${api}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `New testimonial — ${name}, ${location}`,
      head: branch,
      base: baseBranch,
      body: [
        'A visitor submitted a testimonial through /testimonials.',
        '',
        '**Review checklist before approving:**',
        '- [ ] Reads as a genuine, specific account (not spam or promotional)',
        '- [ ] No product brand names, purchase links, or vendor mentions (PECA advertising risk)',
        '- [ ] Name and location are plausible and not obviously fake',
        '',
        'Flip `reviewed: true` (and optionally move the file out of `_inbox/`) to publish.',
      ].join('\n'),
    }),
  });
  if (!prRes.ok) throw new Error(`PR create failed: ${prRes.status} ${await prRes.text()}`);
  const prJson = await prRes.json();
  return { skipped: false, url: prJson.html_url };
}

async function sendThankYouEmail(env, { name, email }) {
  if (!env.RESEND_API_KEY) {
    console.log('Skipping thank-you email: RESEND_API_KEY not configured.');
    return { skipped: true };
  }

  const from = env.RESEND_FROM || 'AVI <contact@vapeindia.org>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Thank you for sharing your story with AVI',
      text: `Hi ${name},

Thank you for sharing your testimonial with the Association of Vapers India.

Stories like yours are one of the most powerful tools we have to show
policymakers and the public what safer nicotine products actually mean for
Indians who smoke. A member of our team reads every submission, and yours
will appear on vapeindia.org/testimonials once it's been reviewed.

If you have any questions in the meantime, just reply to this email or
write to us at contact@vapeindia.org.

With thanks,
Association of Vapers India
vapeindia.org`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  return { skipped: false };
}

/**
 * Internal-only notification to the AVI team, so a human has a way to reach
 * the submitter (e.g. to ask a question before publishing) without the email
 * address ever being written to the repo. Best-effort — a failure here
 * should never block the submitter's own thank-you email or the review PR.
 */
async function notifyTeam(env, { name, location, testimonial, email, prUrl }) {
  if (!env.RESEND_API_KEY) {
    console.log('Skipping team notification: RESEND_API_KEY not configured.');
    return { skipped: true };
  }

  const from = env.RESEND_FROM || 'AVI <contact@vapeindia.org>';
  const to = env.NOTIFY_EMAIL || 'contact@vapeindia.org';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New testimonial submission — ${name}, ${location}`,
      text: `New testimonial submitted via vapeindia.org/testimonials.

Name: ${name}
Location: ${location}
Email (private — reply here to reach them, not published anywhere): ${email}

Testimonial:
${testimonial}

Review PR: ${prUrl || '(not opened — see function logs for why)'}`,
    }),
  });
  if (!res.ok) throw new Error(`Team notify failed: ${res.status} ${await res.text()}`);
  return { skipped: false };
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Honeypot — real visitors never fill this in.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return jsonResponse({ ok: true });
  }

  const name = String(body.name || '').trim().slice(0, MAX_LEN.name);
  const location = String(body.location || '').trim().slice(0, MAX_LEN.location);
  const testimonial = String(body.testimonial || '').trim().slice(0, MAX_LEN.testimonial);
  const email = String(body.email || '').trim().slice(0, MAX_LEN.email);

  if (!name || !location || !testimonial || !email) {
    return jsonResponse({ error: 'Missing required field' }, 400);
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Invalid email' }, 400);
  }

  const results = { pr: null, email: null };
  let prError = null;
  let emailError = null;

  try {
    results.pr = await openTestimonialPR(env, { name, location, testimonial });
  } catch (err) {
    prError = err;
    console.error('Testimonial PR failed:', err);
  }

  try {
    results.email = await sendThankYouEmail(env, { name, email });
  } catch (err) {
    emailError = err;
    console.error('Thank-you email failed:', err);
  }

  try {
    await notifyTeam(env, { name, location, testimonial, email, prUrl: results.pr?.url });
  } catch (err) {
    console.error('Team notification failed:', err);
  }

  // Succeed if at least one side effect worked — the submission itself
  // should never feel lost to the visitor just because, say, Resend is
  // temporarily down.
  if (prError && emailError) {
    return jsonResponse({ error: 'Submission could not be processed. Please try again later.' }, 502);
  }

  return jsonResponse({ ok: true });
}

export async function onRequestGet() {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
