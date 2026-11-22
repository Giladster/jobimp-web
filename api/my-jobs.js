// Returns the real "Gilad" account data. The data and the password live only in
// Vercel env vars (JOBIMP_GILAD_DATA, JOBIMP_GILAD_PASSWORD), never in this public repo.
// "Remember me": after a correct password we return a login key (HMAC signed with a key
// derived from the password). It never expires; it stops working when the password changes.
const crypto = require('crypto');

const sha = s => crypto.createHash('sha256').update(s).digest();
const same = (a, b) => { const x = sha(a), y = sha(b); return crypto.timingSafeEqual(x, y); };
const sign = pw => crypto.createHmac('sha256', sha('jobimp-remember:' + pw)).update('gilad.v1').digest('base64url');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const want = process.env.JOBIMP_GILAD_PASSWORD;
  const data = process.env.JOBIMP_GILAD_DATA;
  if (!want || !data) return res.status(503).json({ error: 'This account is not set up yet.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const token = typeof body.token === 'string' ? body.token : '';
  const ok = token ? same(token, sign(want)) : same(String(body.password || ''), want);
  if (!ok) return res.status(401).json({ error: token ? 'Please sign in again.' : 'Wrong password.' });
  let parsed;
  try { parsed = JSON.parse(data); } catch { return res.status(500).json({ error: 'Saved data is broken.' }); }
  if (body.remember && !token) parsed.token = sign(want);
  return res.status(200).json(parsed);
};
