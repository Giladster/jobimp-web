// Today page: remembers the notifications and "needs attention" items the user saw,
// which ones they cleared, and the full history so they can bring one back.
const { q, err } = require('./_lib/db');
const A = require('./_lib/auth');

const clip = (s, n) => String(s || '').slice(0, n);

module.exports = A.handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const user = await A.requireUser(req);
  const b = await A.body(req);
  if (b.op === 'cleared') {
    const { rows } = await q('select key from today_items where user_id=$1 and cleared_at is not null', [user.id]);
    return res.status(200).json({ keys: rows.map(r => r.key) });
  }
  if (b.op === 'seen') {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).filter(i => i && i.key && i.text && ['note', 'att'].includes(i.kind));
    if (items.length) await q(`insert into today_items (user_id, key, kind, text, link) select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::text[]) on conflict do nothing`,
      [user.id, items.map(i => clip(i.key, 300)), items.map(i => i.kind), items.map(i => clip(i.text, 300)), items.map(i => clip(i.link, 100))]);
    return res.status(200).json({ ok: true });
  }
  if (b.op === 'clear') {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).filter(i => i && i.key && i.text && ['note', 'att'].includes(i.kind));
    if (items.length) await q(`insert into today_items (user_id, key, kind, text, link, cleared_at) select $1, k, kd, t, l, now() from unnest($2::text[], $3::text[], $4::text[], $5::text[]) as x(k, kd, t, l)
      on conflict (user_id, key) do update set cleared_at = now()`,
      [user.id, items.map(i => clip(i.key, 300)), items.map(i => i.kind), items.map(i => clip(i.text, 300)), items.map(i => clip(i.link, 100))]);
    return res.status(200).json({ ok: true });
  }
  if (b.op === 'restore') {
    await q('update today_items set cleared_at = null where user_id=$1 and key=$2', [user.id, clip(b.key, 300)]);
    return res.status(200).json({ ok: true });
  }
  if (b.op === 'history') {
    const limit = Math.min(100, Math.max(1, +b.limit || 50)), offset = Math.max(0, +b.offset || 0);
    const { rows } = await q('select key, kind, text, link, first_seen, cleared_at from today_items where user_id=$1 order by first_seen desc limit $2 offset $3', [user.id, limit, offset]);
    const { rows: c } = await q('select count(*)::int as n from today_items where user_id=$1', [user.id]);
    return res.status(200).json({ items: rows, total: c[0].n });
  }
  throw err(400, 'Unknown request.');
});
