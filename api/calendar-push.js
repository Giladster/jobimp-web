// Google Calendar calls this when an event is added or changed.
const { q } = require('./_lib/db');
const A = require('./_lib/auth');
const S = require('./_lib/sync');

module.exports = A.handle(async (req, res) => {
  const tok = A.readValue(req.headers['x-goog-channel-token']);
  const ch = req.headers['x-goog-channel-id'];
  if (!tok || !tok.u) return res.status(403).json({ error: 'Not allowed' });
  const { rows } = await q('select * from users where id=$1 and cal_channel=$2 and refresh_enc is not null', [tok.u, ch]);
  const user = rows[0];
  if (!user || req.headers['x-goog-resource-state'] === 'sync' || user.import_state) return res.status(200).json({ ok: true });
  const n = await S.catchUp(user);
  return res.status(200).json({ ok: true, updates: n });
});
