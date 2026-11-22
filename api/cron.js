// Daily: renew the Gmail and Calendar "watch" (they expire after 7 days) and catch up on anything missed.
const { q } = require('./_lib/db');
const A = require('./_lib/auth');
const S = require('./_lib/sync');

module.exports = A.handle(async (req, res) => {
  const auth = String(req.headers.authorization || '');
  if (!A.checkSecret(auth.replace(/^Bearer\s+/i, ''))) return res.status(403).json({ error: 'Not allowed' });
  const { rows } = await q('select * from users where refresh_enc is not null and import_state is null');
  const soon = Date.now() + 2 * 864e5, report = [];
  for (const u of rows) {
    try {
      let w = null;
      if ((u.gmail_watch_exp || 0) < soon || (u.push_base && (u.cal_exp || 0) < soon)) w = await S.startWatches(u, u.push_base);
      const n = await S.catchUp(u);
      report.push({ user: u.id, renewed: w, updates: n });
    } catch (e) { report.push({ user: u.id, error: e.message }); }
  }
  return res.status(200).json({ ok: true, report });
});
