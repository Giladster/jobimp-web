// Sessions (signed cookie), Gilad's password account, and token encryption.
const crypto = require('crypto');
const { q, err } = require('./db');

const COOKIE = 'jobimp_s';
const sha = s => crypto.createHash('sha256').update(s).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(String(a)), sha(String(b)));

// One app secret. CRON_SECRET is the name Vercel uses for cron calls, so we reuse it.
// Before it is set, Gilad's password is the key, so sign-in works from day one.
function secret() {
  const s = process.env.CRON_SECRET || process.env.JOBIMP_GILAD_PASSWORD;
  if (!s) throw err(503, 'The app secret is not set yet.');
  return s;
}
const hmac = (purpose, data) => crypto.createHmac('sha256', sha(purpose + ':' + secret())).update(data).digest('base64url');

function readCookie(req, name) {
  const all = String(req.headers.cookie || '').split(/;\s*/);
  for (const c of all) { const i = c.indexOf('='); if (i > 0 && c.slice(0, i) === name) return decodeURIComponent(c.slice(i + 1)); }
  return '';
}

function sessionUser(req) {
  const v = readCookie(req, COOKIE); const i = v.lastIndexOf('.');
  if (i < 1) return null;
  const uid = v.slice(0, i);
  return same(v.slice(i + 1), hmac('session', uid)) ? uid : null;
}

function setSession(res, uid, remember) {
  const val = uid + '.' + hmac('session', uid);
  // "Remember me" = stays signed in until sign out (10 years). Otherwise ends when the browser closes.
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(val)}; Path=/; HttpOnly; Secure; SameSite=Lax${remember ? '; Max-Age=315360000' : ''}`);
}
function clearSession(res) { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); }

async function requireUser(req) {
  const uid = sessionUser(req);
  if (!uid) throw err(401, 'Please sign in.');
  const { rows } = await q('select * from users where id=$1', [uid]);
  if (!rows[0]) throw err(401, 'Please sign in.');
  return rows[0];
}

// Old "remember me" token from before the database (kept so Gilad stays signed in).
const legacyToken = pw => crypto.createHmac('sha256', sha('jobimp-remember:' + pw)).update('gilad.v1').digest('base64url');

// Gilad's account: first sign-in copies his jobs from the Vercel setting into the database.
async function ensureGilad() {
  const { rows } = await q('select id from users where id=$1', ['gilad']);
  if (rows[0]) return;
  let data;
  try { data = JSON.parse(process.env.JOBIMP_GILAD_DATA || ''); } catch { throw err(503, 'This account is not set up yet.'); }
  await q(`insert into users (id, name, synced_from) values ('gilad', 'Gilad', $1) on conflict do nothing`, [data.asOf || null]);
  for (const j of data.jobs || []) {
    await q(`insert into jobs (user_id, co, role, src, status, applied, first_reply, next_raw, tl) values ('gilad',$1,$2,$3,$4,$5,$6,$7,$8)`,
      [j.co, j.role || '', j.src || 'Email', j.status, j.applied || null, j.firstReply || null, j.next || null, JSON.stringify(j.tl || [])]);
  }
}

// Google refresh tokens are stored encrypted (AES-256-GCM).
function encKey() {
  if (!process.env.CRON_SECRET) throw err(503, 'CRON_SECRET is not set yet.');
  return sha('jobimp-enc:' + process.env.CRON_SECRET);
}
function encrypt(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const out = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), out].map(b => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// Signed short-lived values (OAuth state, calendar channel token).
function signValue(obj) { const b = Buffer.from(JSON.stringify(obj)).toString('base64url'); return b + '.' + hmac('value', b); }
function readValue(s) {
  const [b, sig] = String(s || '').split('.');
  if (!b || !sig || !same(sig, hmac('value', b))) return null;
  try { return JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); } catch { return null; }
}

function checkSecret(given) { return !!process.env.CRON_SECRET && same(given || '', process.env.CRON_SECRET); }

async function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function handle(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await fn(req, res); }
    catch (e) {
      if (!e.status) console.error(e);
      if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on the server.' });
    }
  };
}

module.exports = { sessionUser, setSession, clearSession, requireUser, legacyToken, ensureGilad, encrypt, decrypt, signValue, readValue, checkSecret, same, body, handle };
