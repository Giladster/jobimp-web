// Returns the real "Gilad" account data. The data and the password live only in
// Vercel env vars (JOBIMP_GILAD_DATA, JOBIMP_GILAD_PASSWORD), never in this public repo.
const crypto = require('crypto');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const want = process.env.JOBIMP_GILAD_PASSWORD;
  const data = process.env.JOBIMP_GILAD_DATA;
  if (!want || !data) return res.status(503).json({ error: 'This account is not set up yet.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const got = String((body && body.password) || '');
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong password.' });
  try { return res.status(200).json(JSON.parse(data)); }
  catch { return res.status(500).json({ error: 'Saved data is broken.' }); }
};
