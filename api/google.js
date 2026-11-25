// Google sign-in. ?start=1 sends you to Google; Google sends you back here with ?code=...
const crypto = require('crypto');
const { q } = require('./_lib/db');
const A = require('./_lib/auth');
const G = require('./_lib/google');
const S = require('./_lib/sync');

const go = (res, to) => { res.statusCode = 302; res.setHeader('Location', to); res.end(); };

module.exports = A.handle(async (req, res) => {
  try { await connect(req, res); } catch (e) { console.error('google sign-in failed', e.message); if (!res.headersSent) go(res, '/?google=failed'); }
});

async function connect(req, res) {
  const to = url => go(res, url);
  if (!G.configured()) return to('/?google=off');
  const base = G.baseUrl(req), redirect = base + '/api/google', qy = req.query || {};

  if (qy.start) {
    const state = A.signValue({ u: A.sessionUser(req) || '', n: crypto.randomBytes(8).toString('hex'), t: Date.now() });
    return to(G.authUrl(redirect, state));
  }
  if (qy.error) return to('/?google=denied');
  const st = A.readValue(qy.state);
  if (!qy.code || !st || Date.now() - st.t > 15 * 60e3) return to('/?google=failed');

  const g = await G.exchangeCode(String(qy.code), redirect);
  // One account per email address, however you sign in. Which account?
  // The signed-in one (connecting Gmail), else the one with this Google login or email, else a new one.
  // Safety rule: match by email only when the email is confirmed (Google says so here; a future
  // email + password signup must confirm the email with a code before it can be matched).
  let uid = st.u || null;
  const email = g.verified ? (g.email || '') : '';
  const { rows: found } = await q('select id from users where google_sub=$1 or ($2 <> \'\' and lower(google_email)=lower($2)) order by (google_sub=$1) desc', [g.sub, email]);
  if (!uid) uid = found[0]?.id || null;
  for (const other of found.filter(r => r.id !== uid)) {
    // An account made by "Continue with Google" only holds jobs read from Gmail; they are read again into this account.
    if (!other.id.startsWith('g_')) return to('/?google=taken');
    await q('delete from users where id=$1', [other.id]);
  }
  if (!uid) {
    uid = 'g_' + g.sub;
    await q(`insert into users (id, name) values ($1, $2) on conflict do nothing`, [uid, g.name || (g.email || '').split('@')[0]]);
  }
  const { rows: cur } = await q('select * from users where id=$1', [uid]);
  const u = cur[0];
  const refresh = g.refresh ? A.encrypt(g.refresh) : u.refresh_enc;
  if (!refresh) return to('/?google=failed');
  const fresh = !u.refresh_enc || u.google_sub !== g.sub;
  await q(`update users set google_sub=$2, google_email=$3, refresh_enc=$4, import_state=case when $5 then '{"phase":"gmail","n":0,"jobs":0}'::jsonb else import_state end,
           gmail_history=case when $5 then null else gmail_history end, reread_v=case when $5 then 3 else reread_v end where id=$1`, [uid, g.sub, g.email, refresh, fresh]);
  const { rows } = await q('select * from users where id=$1', [uid]);
  G.remember(rows[0], g.access, g.exp);
  await S.startWatches(rows[0], base);
  A.setSession(res, uid, true);
  return to('/?google=connected');
}
