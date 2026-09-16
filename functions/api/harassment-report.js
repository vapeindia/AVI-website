/**
 * Cloudflare Pages Function — POST /api/harassment-report
 *
 * Handles submissions from the form at /report-harassment. Structured,
 * non-identifying fields (city, date, what happened, amount, deviceReturned,
 * officerIdentified, suspectedFakeCop, willingToHelp) are committed directly
 * to a new file under src/content/harassment-reports/ on the main branch —
 * no PR, no review gate. That's safe here because nothing personally
 * identifying is ever written to the repo; it mirrors the `news`/`videos`
 * direct-commit pattern already used elsewhere on this site (see
 * CLAUDE.md), and it's what lets the public counters on /report-harassment
 * and /india/law update on every genuine submission without moderation lag.
 *
 * The submitter's email and any free-text details are NEVER committed to
 * the repo. They exist only in a best-effort internal notification email to
 * the AVI team — sent only when the submitter left an email, opted into
 * being contacted (willingToHelp), or wrote something in the details field,
 * so routine stat-only submissions don't generate email noise.
 *
 * Required Cloudflare Pages environment variables — same secrets already
 * used by functions/api/testimonial.js, see functions/README.md:
 *   GITHUB_TOKEN   — fine-grained PAT scoped to this repo, "Contents: read
 *                    and write" is enough (no PR permission needed here)
 *   GITHUB_REPO    — "owner/repo"
 *   GITHUB_BRANCH  — defaults to "main"
 *   RESEND_API_KEY, RESEND_FROM, NOTIFY_EMAIL — same as testimonial.js
 *
 * If GITHUB_TOKEN or RESEND_API_KEY are not set, this function degrades
 * gracefully: it skips the step it can't perform rather than failing the
 * whole request.
 */

const WHAT_HAPPENED = new Set(['device_confiscated', 'cash_demanded', 'detained', 'threatened_only', 'other']);
const DEVICE_RETURNED = new Set(['yes', 'no', 'partial', 'na']);
const OFFICER_IDENTIFIED = new Set(['yes', 'no', 'refused']);
const FAKE_COP = new Set(['yes', 'no', 'unsure']);
const MAX_LEN = { city: 60, details: 1000, email: 200 };
const MAX_AMOUNT = 1000000; // ₹10 lakh sanity ceiling
const EARLIEST_DATE = new Date('2016-01-01T00:00:00.000Z'); // predates every state-level ENDS ban

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

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function toFrontmatter(fields) {
  const submittedAt = new Date().toISOString();
  return `---
date: ${fields.date}
city: ${JSON.stringify(fields.city)}
whatHappened: ${JSON.stringify(fields.whatHappened)}
amount: ${fields.amount}
deviceReturned: ${JSON.stringify(fields.deviceReturned)}
officerIdentified: ${JSON.stringify(fields.officerIdentified)}
suspectedFakeCop: ${JSON.stringify(fields.suspectedFakeCop)}
willingToHelp: ${fields.willingToHelp}
submittedAt: ${JSON.stringify(submittedAt)}
---
`;
}

async function commitReport(env, fields) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log('Skipping GitHub commit: GITHUB_TOKEN or GITHUB_REPO not configured.');
    return { skipped: true };
  }

  const branch = env.GITHUB_BRANCH || 'main';
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'avi-site-harassment-report-function',
  };

  const id = crypto.randomUUID().slice(0, 8);
  const path = `src/content/harassment-reports/${fields.date}-${slugify(fields.city)}-${id}.md`;
  const content = toFrontmatter(fields);

  const putRes = await fetch(`${api}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Harassment report: ${fields.city}, ${fields.date}`,
      content: utf8ToBase64(content),
      branch,
    }),
  });
  if (!putRes.ok) throw new Error(`file create failed: ${putRes.status} ${await putRes.text()}`);
  return { skipped: false };
}

/**
 * Internal-only notification so a human can follow up (e.g. offer legal
 * support to someone who opted in) without the email address or any
 * free-text account ever being written to the repo. Skipped entirely for
 * routine stat-only submissions with no email, no details, and no opt-in —
 * those need no human follow-up, so no email is sent.
 */
async function notifyTeam(env, fields, { email, details }) {
  if (!fields.willingToHelp && !details && !email) return { skipped: true, reason: 'nothing to follow up on' };
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
      subject: `New harassment report — ${fields.city}, ${fields.date}${fields.willingToHelp ? ' (willing to help)' : ''}`,
      text: `New police harassment report submitted via vapeindia.org/report-harassment.

City: ${fields.city}
Date of incident: ${fields.date}
What happened: ${fields.whatHappened.join(', ')}
Amount demanded/paid: ${fields.amount ? `₹${fields.amount}` : 'none reported'}
Device returned: ${fields.deviceReturned}
Officer identified themselves: ${fields.officerIdentified}
Suspected fake cop: ${fields.suspectedFakeCop}
Willing to be contacted re: legal support: ${fields.willingToHelp ? 'YES' : 'no'}

Email (private — reply here to reach them, not published anywhere): ${email || '(not given)'}

Details the submitter added:
${details || '(none)'}

This report has already been committed to the site as an anonymous,
aggregate-only entry — this email is the only place any contact info or
free text from it exists.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
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

  const date = String(body.date || '').trim().slice(0, 10);
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (!date || Number.isNaN(parsedDate.valueOf()) || parsedDate < EARLIEST_DATE || parsedDate > today) {
    return jsonResponse({ error: 'Invalid date' }, 400);
  }

  let city = String(body.city || '').trim().slice(0, MAX_LEN.city);
  if (!city) return jsonResponse({ error: 'City is required' }, 400);

  const whatHappened = Array.isArray(body.whatHappened)
    ? [...new Set(body.whatHappened.map(String).filter((v) => WHAT_HAPPENED.has(v)))]
    : [];
  if (whatHappened.length === 0) return jsonResponse({ error: 'Select at least one option for what happened' }, 400);

  const amount = Number(body.amount) || 0;
  if (amount < 0 || amount > MAX_AMOUNT) return jsonResponse({ error: 'Invalid amount' }, 400);

  const deviceReturned = String(body.deviceReturned || '');
  if (!DEVICE_RETURNED.has(deviceReturned)) return jsonResponse({ error: 'Invalid deviceReturned value' }, 400);

  const officerIdentified = String(body.officerIdentified || '');
  if (!OFFICER_IDENTIFIED.has(officerIdentified)) return jsonResponse({ error: 'Invalid officerIdentified value' }, 400);

  const suspectedFakeCop = String(body.suspectedFakeCop || '');
  if (!FAKE_COP.has(suspectedFakeCop)) return jsonResponse({ error: 'Invalid suspectedFakeCop value' }, 400);

  const willingToHelp = Boolean(body.willingToHelp);

  const email = String(body.email || '').trim().slice(0, MAX_LEN.email);
  if (email && !isValidEmail(email)) return jsonResponse({ error: 'Invalid email' }, 400);

  const details = String(body.details || '').trim().slice(0, MAX_LEN.details);

  const fields = { date, city, whatHappened, amount, deviceReturned, officerIdentified, suspectedFakeCop, willingToHelp };

  let commitError = null;
  let notifyError = null;

  try {
    await commitReport(env, fields);
  } catch (err) {
    commitError = err;
    console.error('Harassment report commit failed:', err);
  }

  try {
    await notifyTeam(env, fields, { email, details });
  } catch (err) {
    notifyError = err;
    console.error('Harassment report team notification failed:', err);
  }

  if (commitError && (willingToHelp || details || email) && notifyError) {
    // Both the public record and the only copy of the follow-up info failed.
    return jsonResponse({ error: 'Submission could not be processed. Please try again later.' }, 502);
  }
  if (commitError) {
    return jsonResponse({ error: 'Submission could not be processed. Please try again later.' }, 502);
  }

  return jsonResponse({ ok: true });
}

export async function onRequestGet() {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
