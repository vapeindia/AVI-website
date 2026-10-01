/**
 * Cloudflare Pages Function — GET/POST /api/unsubscribe
 *
 * Real one-click unsubscribe (docs/tasks/07-mobilisation.md item 1,
 * RFC 8058). The link itself is a signed token (same HMAC scheme as
 * subscribe.js/confirm-subscription.js) carrying only the subscriber's
 * email — it doesn't expire, since it has to keep working from however
 * old an email it ends up sitting in.
 *
 * Two entry points, both unsubscribing on a single action (no further
 * confirmation step, unlike confirm-subscription.js's GET/POST split —
 * accidentally unsubscribing is low-stakes and reversible by signing up
 * again, whereas a GET-triggered mail-scanner false *subscribe* is the
 * thing worth guarding against, not a false unsubscribe):
 *   - GET  — a person clicking an "unsubscribe" link in an email or on the
 *            site. Unsubscribes immediately and shows a confirmation page.
 *   - POST — RFC 8058 one-click unsubscribe, triggered by a mail client
 *            itself (via the List-Unsubscribe-Post header on an email) with
 *            no human in the loop at all. Must respond fast with a blank
 *            2xx body and no redirect/page — see RFC 8058 §3.1. Resend's own
 *            Broadcast sends handle this automatically for contacts in a
 *            Segment (resend.com/docs — see functions/README.md); this
 *            endpoint exists for the confirmation email's own unsubscribe
 *            link and any other email this function sends directly.
 *
 * Required Cloudflare Pages environment variables/secrets:
 *   SUBSCRIBE_TOKEN_SECRET — same secret the other two subscribe functions use
 *   RESEND_API_KEY         — same key already used elsewhere
 */

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

async function verifyToken(secret, token, purpose) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = await hmacSign(secret, payloadB64);
  if (expectedSig !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (payload.p !== purpose) return null;
    return payload;
  } catch {
    return null;
  }
}

async function unsubscribeContact(env, email) {
  const res = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ unsubscribed: true }),
  });
  if (!res.ok) throw new Error(`Resend unsubscribe failed: ${res.status} ${await res.text()}`);
}

// The email in the signed token originated from the subscriber's own form
// input (no character-set restriction beyond basic shape) and ends up
// interpolated into this file's HTML pages — must be escaped.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, bodyHtml, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} · AVI</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#faf6ec;color:#1a211d;margin:0;padding:3rem 1.5rem;line-height:1.6;}
  .card{max-width:28rem;margin:0 auto;background:#fff;border:1px solid #e2dcc7;border-radius:10px;padding:2rem 1.75rem;text-align:center;}
  h1{font-size:1.3rem;margin:0 0 0.85rem;}
  p{margin:0 0 1rem;font-size:0.95rem;color:#5c6660;}
  .btn{display:inline-block;background:#1f6f5c;color:#fff;font-weight:600;font-size:0.92rem;text-decoration:none;padding:0.65rem 1.4rem;border:none;border-radius:999px;}
  a{color:#1f6f5c;}
</style></head><body><div class="card">${bodyHtml}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

async function handle(env, token) {
  const payload = await verifyToken(env.SUBSCRIBE_TOKEN_SECRET, token, 'unsub');
  if (!payload || !payload.e) return { ok: false, reason: 'invalid' };
  if (!env.RESEND_API_KEY) {
    console.error('Unsubscribe failed: RESEND_API_KEY not configured.');
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await unsubscribeContact(env, payload.e);
    return { ok: true, email: payload.e };
  } catch (err) {
    console.error('Unsubscribe failed:', err);
    return { ok: false, reason: 'error' };
  }
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const result = await handle(env, token);
  if (!result.ok) {
    return page("Couldn't unsubscribe", `
      <h1>This link isn't valid</h1>
      <p>We couldn't process that unsubscribe link. Email <a href="mailto:contact@vapeindia.org">contact@vapeindia.org</a> and we'll remove you directly.</p>
    `, 400);
  }
  return page("You're unsubscribed", `
    <h1>You're off the list</h1>
    <p><strong>${escapeHtml(result.email)}</strong> won't receive any more updates from AVI. Sorry to see you go — you're welcome to sign up again any time.</p>
    <a class="btn" href="/">Back to vapeindia.org</a>
  `);
}

// RFC 8058 one-click unsubscribe: a mail client POSTs here directly (via the
// List-Unsubscribe-Post header) with no human interaction — must respond
// fast with a blank 2xx body, no page, no redirect.
export async function onRequestPost({ request, env }) {
  let token = '';
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    token = String(form.get('token') || new URL(request.url).searchParams.get('token') || '');
  } else {
    token = new URL(request.url).searchParams.get('token') || '';
  }
  await handle(env, token);
  // Per RFC 8058 §3.1: respond 200/202 regardless of outcome, blank body,
  // no redirect — the mail client isn't going to render anything anyway.
  return new Response(null, { status: 200 });
}
