// Sign in / out. GET tells the app who is signed in and whether Google sign-in is available.
const { q } = require('./_lib/db');
const A = require('./_lib/auth');
const G = require('./_lib/google');

module.exports = A.handle(async (req, res) => {
  if (req.method === 'GET') {
    const uid = A.sessionUser(req);
    let user = null;
    if (uid) { const { rows } = await q('select id, name from users where id=$1', [uid]); user = rows[0] || null; }
    return res.status(200).json({ user, google: G.configured() });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const b = await A.body(req);
  if (b.logout) { A.clearSession(res); return res.status(200).json({ ok: true }); }
  const want = process.env.JOBIMP_GILAD_PASSWORD;
  if (!want) return res.status(503).json({ error: 'This account is not set up yet.' });
  const token = typeof b.token === 'string' ? b.token : '';
  const ok = token ? A.same(token, A.legacyToken(want)) : A.same(String(b.password || ''), want);
  if (!ok) return res.status(401).json({ error: token ? 'Please sign in again.' : 'Wrong password.' });
  await A.ensureGilad();
  const remember = token ? true : !!b.remember;
  A.setSession(res, 'gilad', remember);
  // Backup "remember me" key kept in the browser, so a server key change never signs you out.
  return res.status(200).json({ ok: true, token: remember ? A.legacyToken(want) : undefined });
});
