// The signed-in user's jobs. GET lists them, POST saves a change or runs a sync step.
const { q, err } = require('./_lib/db');
const A = require('./_lib/auth');
const G = require('./_lib/google');
const S = require('./_lib/sync');

const STATUSES = ['saved', 'applied', 'interview', 'offer', 'closed'];
const out = j => ({ id: j.id, co: j.co, role: j.role, src: j.src, status: j.status, applied: j.applied ? iso(j.applied) : null, firstReply: j.first_reply ? iso(j.first_reply) : null, next: j.next_raw, tl: j.tl });
function iso(d) { if (typeof d === 'string') return d.slice(0, 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const cleanTl = tl => Array.isArray(tl) ? tl.slice(0, 60).filter(e => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string')
  .map(e => { const x = [e[0].slice(0, 20), e[1].slice(0, 120)]; if (e[2] && typeof e[2] === 'object') x.push({ s: String(e[2].s || '').slice(0, 20), id: String(e[2].id || '').slice(0, 200) }); return x; }) : null;

async function version(uid) {
  const { rows } = await q(`select coalesce(max(updated_at), 'epoch')::text as v, count(*)::int as n from jobs where user_id=$1`, [uid]);
  return rows[0].v + '|' + rows[0].n;
}

module.exports = A.handle(async (req, res) => {
  const user = await A.requireUser(req);
  if (req.method === 'GET') {
    // Catch up with Gmail and Calendar when the app asks (at most every 2 minutes).
    if (req.query?.fresh && user.refresh_enc && !user.import_state && (!user.last_sync || Date.now() - new Date(user.last_sync) > 120e3)) {
      try { await S.catchUp(user); } catch (e) { console.error('catch up failed', e.message); }
    }
    const v = await version(user.id);
    if (req.query?.v && req.query.v === v) return res.status(200).json({ same: true, v });
    const { rows } = await q('select * from jobs where user_id=$1 and not removed order by updated_at desc, id', [user.id]);
    return res.status(200).json({
      v, name: user.name, jobs: rows.map(out),
      google: { available: G.configured(), connected: !!user.refresh_enc, email: user.google_email, lastSync: user.last_sync, importing: !!user.import_state },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const b = await A.body(req);
  if (b.op === 'save') {
    const tl = cleanTl(b.tl);
    if (!STATUSES.includes(b.status) || !tl) throw err(400, 'Bad job data.');
    const { rowCount } = await q('update jobs set status=$3, tl=$4, removed=$5, updated_at=now() where id=$1 and user_id=$2', [+b.id, user.id, b.status, JSON.stringify(tl), !!b.removed]);
    if (!rowCount) throw err(404, 'Job not found.');
    return res.status(200).json({ ok: true, v: await version(user.id) });
  }
  if (b.op === 'tz') {
    if (typeof b.tz === 'string' && b.tz.length < 60) { try { new Intl.DateTimeFormat('en', { timeZone: b.tz }); await q('update users set tz=$2 where id=$1', [user.id, b.tz]); } catch {} }
    return res.status(200).json({ ok: true });
  }
  if (b.op === 'sync') {
    if (!user.refresh_enc) throw err(409, 'Gmail is not connected.');
    if (!user.import_state) return res.status(200).json({ done: true });
    return res.status(200).json(await S.importStep(user));
  }
  if (b.op === 'disconnect') {
    await q(`update users set refresh_enc=null, import_state=null, gmail_watch_exp=null, cal_channel=null, cal_resource=null, cal_exp=null where id=$1`, [user.id]);
    return res.status(200).json({ ok: true });
  }
  throw err(400, 'Unknown request.');
});
