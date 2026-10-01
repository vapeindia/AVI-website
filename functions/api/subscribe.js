/**
 * Cloudflare Pages Function — POST /api/subscribe
 *
 * Handles the email-signup form (docs/tasks/07-mobilisation.md item 1),
 * embedded via src/components/NewsletterSignup.astro on the homepage,
 * /press/, /india/law/ and in the site footer.
 *
 * Double opt-in, built by hand: Resend's Contacts API has no built-in
 * double-opt-in step (checked resend.com/docs before writing this — their
 * "Audiences" concept is now "Segments" + "Contacts" + "Topics", and
 * unsubscribe/preference handling for Broadcasts is automatic once a
 * contact is in a Segment, but nothing confirms a NEW signup actually
 * came from the address owner). So this function never calls Resend's
 * contacts API directly — it only ever sends a confirmation email. The
 * contact is only actually created in Resend once the recipient clicks
 * through to GET/POST /api/confirm-subscription (see that file).
 *
 * Collects email + optional city, nothing else, and never touches any
 * existing contact list — every signup is a brand new Resend contact
 * created only after confirmation.
 *
 * Required Cloudflare Pages environment variables/secrets — see
 * functions/README.md:
 *   SUBSCRIBE_TOKEN_SECRET — a long random string used to HMAC-sign the
 *                            confirm/unsubscribe links below. Required —
 *                            without it this function can't safely issue
 *                            a confirmation link, so it fails closed.
 *   RESEND_API_KEY         — same key already used by testimonial.js
 *   RESEND_FROM            — optional, defaults to "AVI <contact@vapeindia.org>"
 *
 * If RESEND_API_KEY is not set, the confirmation email can't be sent —
 * this is logged and the function still returns a generic success
 * response (same graceful-degradation pattern as testimonial.js) rather
 * than revealing configuration state to a visitor.
 */

const MAX_LEN = { email: 200, city: 60 };
const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sigBuf));
}

/** Signed token: base64url(JSON payload) + "." + HMAC-SHA256 of that string. */
async function signToken(secret, payload) {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

async function sendConfirmationEmail(env, { email, confirmUrl }) {
  if (!env.RESEND_API_KEY) {
    console.log('Skipping confirmation email: RESEND_API_KEY not configured.');
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
      subject: 'Confirm your email — AVI updates',
      text: `Someone (hopefully you) asked to join AVI's update list on vapeindia.org.

Click below to confirm — this link expires in 48 hours:
${confirmUrl}

If you didn't request this, just ignore this email and you won't be added to anything.

Association of Vapers India
vapeindia.org`,
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

  const email = String(body.email || '').trim().slice(0, MAX_LEN.email);
  const city = String(body.city || '').trim().slice(0, MAX_LEN.city);

  if (!email) return jsonResponse({ error: 'Email is required' }, 400);
  if (!isValidEmail(email)) return jsonResponse({ error: 'Invalid email' }, 400);

  if (!env.SUBSCRIBE_TOKEN_SECRET) {
    // Can't safely issue a confirm link without this — fail closed rather
    // than silently pretending the signup worked, and log clearly so a
    // missing secret is obvious in the Cloudflare Functions log.
    console.error('Subscribe failed: SUBSCRIBE_TOKEN_SECRET not configured.');
    return jsonResponse({ error: 'Signup is temporarily unavailable. Please try again later or email contact@vapeindia.org.' }, 503);
  }

  const token = await signToken(env.SUBSCRIBE_TOKEN_SECRET, {
    p: 'confirm',
    e: email,
    c: city,
    t: Date.now(),
    exp: Date.now() + CONFIRM_TOKEN_TTL_MS,
  });
  const confirmUrl = `${new URL(request.url).origin}/api/confirm-subscription?token=${encodeURIComponent(token)}`;

  try {
    await sendConfirmationEmail(env, { email, confirmUrl });
  } catch (err) {
    console.error('Confirmation email failed:', err);
    return jsonResponse({ error: 'Could not send the confirmation email. Please try again later.' }, 502);
  }

  return jsonResponse({ ok: true });
}

export async function onRequestGet() {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
