// Google: sign-in and READ-ONLY Gmail + Calendar.
// Rule: JobImp never sends, edits, labels, moves or deletes anything. Only read calls,
// plus "watch", which asks Google to ping us when something new arrives (changes nothing).
const { q, err } = require('./db');
const { encrypt, decrypt } = require('./auth');

const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function configured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.CRON_SECRET); }

function baseUrl(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https';
  return `${proto}://${host}`;
}

function authUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

async function tokenCall(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw err(r.status === 400 ? 401 : 502, d.error === 'invalid_grant' ? 'Google sign-in expired. Please connect Gmail again.' : 'Google did not accept the sign-in.');
  return d;
}

async function exchangeCode(code, redirectUri) {
  const d = await tokenCall({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  const payload = JSON.parse(Buffer.from(String(d.id_token).split('.')[1], 'base64url').toString('utf8'));
  return { refresh: d.refresh_token || null, access: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000, sub: payload.sub, email: payload.email, verified: payload.email_verified === true || payload.email_verified === 'true', name: payload.given_name || payload.name || '' };
}

const cache = new Map(); // userId -> {access, exp}
async function accessToken(user) {
  const c = cache.get(user.id);
  if (c && c.exp > Date.now()) return c.access;
  if (!user.refresh_enc) throw err(409, 'Gmail is not connected.');
  const d = await tokenCall({ refresh_token: decrypt(user.refresh_enc), grant_type: 'refresh_token' });
  const v = { access: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  cache.set(user.id, v); return v.access;
}
function remember(user, access, exp) { cache.set(user.id, { access, exp }); }

// Only GET requests plus the two "watch" calls are allowed here.
const ALLOWED_POST = [/\/gmail\/v1\/users\/me\/watch$/, /\/calendar\/v3\/calendars\/primary\/events\/watch$/, /\/calendar\/v3\/channels\/stop$/];
async function gapi(user, url, { method = 'GET', json } = {}) {
  if (method !== 'GET' && !ALLOWED_POST.some(r => r.test(url.split('?')[0]))) throw new Error('Blocked: JobImp only reads from Google.');
  const tok = await accessToken(user);
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + tok, ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = err(r.status, d.error?.message || 'Google request failed'); e.google = true; throw e; }
  return d;
}

const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CAL = 'https://www.googleapis.com/calendar/v3';

function decodePart(data) { return Buffer.from(String(data || ''), 'base64url').toString('utf8'); }
function stripHtml(h) {
  return h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}
function bodyText(payload) {
  let plain = '', html = '';
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plain += decodePart(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body?.data) html += decodePart(p.body.data) + '\n';
    (p.parts || []).forEach(walk);
  })(payload);
  return (plain || stripHtml(html)).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Files attached to an email (name, type, size, and the id to fetch it with).
function attachmentsOf(payload) {
  const out = [];
  (function walk(p) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) out.push({ id: p.body.attachmentId, name: p.filename, type: p.mimeType || 'application/octet-stream', size: p.body.size || 0 });
    (p.parts || []).forEach(walk);
  })(payload);
  return out;
}

async function getMessage(user, id) {
  const m = await gapi(user, `${GM}/messages/${encodeURIComponent(id)}?format=full`);
  const h = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
  return { id: m.id, threadId: m.threadId, labels: m.labelIds || [], at: new Date(+m.internalDate), from: h.from || '', to: h.to || '', cc: h.cc || '', subject: h.subject || '', snippet: m.snippet || '', text: bodyText(m.payload), files: attachmentsOf(m.payload) };
}

// Only the envelope: sender, To, Cc, subject and labels. No body, no attachments.
async function getMeta(user, id) {
  const p = ['From', 'To', 'Cc', 'Subject'].map(x => `metadataHeaders=${x}`).join('&');
  const m = await gapi(user, `${GM}/messages/${encodeURIComponent(id)}?format=metadata&${p}`);
  const h = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
  return { id: m.id, threadId: m.threadId, labels: m.labelIds || [], from: h.from || '', to: h.to || '', cc: h.cc || '', subject: h.subject || '' };
}

module.exports = { configured, baseUrl, authUrl, exchangeCode, accessToken, remember, gapi, getMessage, getMeta, GM, CAL, encrypt };
