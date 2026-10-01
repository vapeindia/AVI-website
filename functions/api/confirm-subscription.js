/**
 * Cloudflare Pages Function — GET/POST /api/confirm-subscription
 *
 * Second half of the double opt-in flow started by functions/api/subscribe.js
 * (docs/tasks/07-mobilisation.md item 1). The confirmation email links here
 * with a signed token in the query string.
 *
 * GET only verifies and displays the token — it deliberately does NOT add
 * the contact to Resend on GET. Mail clients and security scanners
 * routinely prefetch links in emails, which would silently "confirm" a
 * signup nobody actually clicked if GET did the real work. Instead GET
 * renders a page with a real button whose form POSTs back to this same
 * endpoint; only that POST (a genuine click) creates the Resend contact.
 *
 * On successful confirmation, the contact is created via Resend's Contacts
 * API (POST /contacts) and, if RESEND_SEGMENT_ID is configured, added to
 * that Segment (POST /contacts/{email}/segments/{segment_id}) so it's
 * reachable from a Resend Broadcast — see functions/README.md for the
 * one-time Resend dashboard setup this needs (creating that Segment).
 * Endpoints confirmed against Resend's current API docs (resend.com/docs)
 * while building this, not assumed from memory.
 *
 * Required Cloudflare Pages environment variables/secrets:
 *   SUBSCRIBE_TOKEN_SECRET — same secret functions/api/subscribe.js signs with
 *   RESEND_API_KEY         — same key already used elsewhere
 *   RESEND_SEGMENT_ID      — optional but needed for the contact to be
 *                            reachable from a Broadcast; without it the
 *                            contact is still created, just not segmented
 *                            (logged, not a hard failure)
 */

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

/** Returns the decoded payload if `token` is validly signed, well-formed,
 * has the expected `purpose`, and (if it carries an `exp`) isn't expired —
 * otherwise null. */
async function verifyToken(secret, token, purpose) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = await hmacSign(secret, payloadB64);
  if (expectedSig !== sig) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }
  if (payload.p !== purpose) return null;
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
  return payload;
}

async function signToken(secret, payload) {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

// isValidEmail (subscribe.js) only checks shape, not character set, and
// `city` is free text — both end up interpolated into this file's HTML
// pages, so they must be escaped. A submitted "email" like
// `x"><script>...` would otherwise execute on this confirmation page.
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
  .btn{display:inline-block;background:#1f6f5c;color:#fff;font-weight:600;font-size:0.92rem;text-decoration:none;padding:0.65rem 1.4rem;border:none;border-radius:999px;cursor:pointer;}
  a{color:#1f6f5c;}
  .unsub{margin-top:1.5rem;font-size:0.8rem;color:#5c6660;}
</style></head><body><div class="card">${bodyHtml}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const payload = await verifyToken(env.SUBSCRIBE_TOKEN_SECRET, token, 'confirm');
  if (!payload) {
    return page('Link expired', `
      <h1>This link has expired or isn't valid</h1>
      <p>Confirmation links are only good for 48 hours. Head back to vapeindia.org and sign up again — it only takes a moment.</p>
      <a class="btn" href="/">Back to vapeindia.org</a>
    `, 400);
  }
  return page('Confirm your email', `
    <h1>Confirm you want AVI's updates</h1>
    <p>Confirming <strong>${escapeHtml(payload.e)}</strong>${payload.c ? ` (${escapeHtml(payload.c)})` : ''} for AVI's update list.</p>
    <form method="POST" action="/api/confirm-subscription">
      <input type="hidden" name="token" value="${token}" />
      <button class="btn" type="submit">Confirm subscription</button>
    </form>
  `);
}

async function upsertResendContact(env, { email, city }) {
  const properties = city ? { city } : undefined;
  const createRes = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false, ...(properties ? { properties } : {}) }),
  });
  if (!createRes.ok) {
    // Most likely cause: this email is already a Resend contact (e.g.
    // re-subscribing after a previous unsubscribe). Fall back to updating
    // it rather than treating every non-2xx as fatal.
    const updateRes = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ unsubscribed: false, ...(properties ? { properties } : {}) }),
    });
    if (!updateRes.ok) {
      throw new Error(`Resend contact create+update both failed: ${createRes.status}, ${updateRes.status} ${await updateRes.text()}`);
    }
  }

  if (env.RESEND_SEGMENT_ID) {
    const segRes = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(env.RESEND_SEGMENT_ID)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } },
    );
    if (!segRes.ok) {
      // Non-fatal: the contact exists and is subscribed either way — just
      // not grouped into the Segment used for Broadcasts yet.
      console.error(`Add-to-segment failed: ${segRes.status} ${await segRes.text()}`);
    }
  } else {
    console.log('RESEND_SEGMENT_ID not configured — contact created but not added to a Segment.');
  }
}

export async function onRequestPost({ request, env }) {
  let token = '';
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } else {
    try {
      const body = await request.json();
      token = String(body.token || '');
    } catch {
      // fall through — token stays ''
    }
  }

  const payload = await verifyToken(env.SUBSCRIBE_TOKEN_SECRET, token, 'confirm');
  if (!payload) {
    return page('Link expired', `
      <h1>This link has expired or isn't valid</h1>
      <p>Confirmation links are only good for 48 hours. Head back to vapeindia.org and sign up again.</p>
      <a class="btn" href="/">Back to vapeindia.org</a>
    `, 400);
  }

  if (!env.RESEND_API_KEY) {
    console.error('Confirm-subscription failed: RESEND_API_KEY not configured.');
    return page('Signup unavailable', `
      <h1>Something went wrong on our end</h1>
      <p>We couldn't complete your signup right now. Please email <a href="mailto:contact@vapeindia.org">contact@vapeindia.org</a> and we'll add you directly.</p>
    `, 502);
  }

  try {
    await upsertResendContact(env, { email: payload.e, city: payload.c });
  } catch (err) {
    console.error('Resend contact upsert failed:', err);
    return page('Signup unavailable', `
      <h1>Something went wrong on our end</h1>
      <p>We couldn't complete your signup right now. Please email <a href="mailto:contact@vapeindia.org">contact@vapeindia.org</a> and we'll add you directly.</p>
    `, 502);
  }

  const unsubToken = env.SUBSCRIBE_TOKEN_SECRET
    ? await signToken(env.SUBSCRIBE_TOKEN_SECRET, { p: 'unsub', e: payload.e, t: Date.now() })
    : null;
  const unsubUrl = unsubToken ? `/api/unsubscribe?token=${encodeURIComponent(unsubToken)}` : null;

  return page("You're subscribed", `
    <h1>You're on the list</h1>
    <p>Thanks — <strong>${escapeHtml(payload.e)}</strong> will now get AVI's updates.</p>
    ${unsubUrl ? `<p class="unsub">Changed your mind? <a href="${unsubUrl}">Unsubscribe any time</a>.</p>` : ''}
    <a class="btn" href="/">Back to vapeindia.org</a>
  `);
}
