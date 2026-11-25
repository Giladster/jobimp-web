// Google Pub/Sub calls this the moment a new email arrives. URL: /api/gmail-push?token=CRON_SECRET
const { q } = require('./_lib/db');
const A = require('./_lib/auth');
const S = require('./_lib/sync');

module.exports = A.handle(async (req, res) => {
  if (req.method !== 'POST' || !A.checkSecret(req.query?.token)) return res.status(403).json({ error: 'Not allowed' });
  const b = await A.body(req);
  let note = {};
  try { note = JSON.parse(Buffer.from(b.message?.data || '', 'base64').toString('utf8')); } catch {}
  if (!note.emailAddress) return res.status(200).json({ ok: true });
  const { rows } = await q('select * from users where lower(google_email)=lower($1) and refresh_enc is not null', [note.emailAddress]);
  const user = rows[0];
  if (!user || user.import_state) return res.status(200).json({ ok: true });
  const n = await S.catchUp(user, note.historyId);
  return res.status(200).json({ ok: true, updates: n });
});
