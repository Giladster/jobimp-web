// Find the Gmail message (or Calendar event) behind older email-log rows and timeline steps,
// so the Agent and the app can link to them. Read only: only Gmail/Calendar GET calls.
const { q } = require('./db');
const G = require('./google');
const S = require('./sync');

const APP_STEP = /^(Moved to |Closed|Saved for later|Added |Interview \(coming up\)|Role changed|Company changed)/;
const emailOf = s => (/<([^>]+)>/.exec(String(s || '')) || [, String(s || '').trim()])[1];
const qs = s => String(s || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);

async function pickClosest(user, query, target) {
  const list = await G.gapi(user, `${G.GM}/messages?${new URLSearchParams({ q: query, maxResults: '6' })}`);
  const ids = (list.messages || []).map(m => m.id);
  if (!ids.length) return null;
  if (ids.length === 1) return ids[0];
  const metas = await Promise.all(ids.slice(0, 5).map(id => G.gapi(user, `${G.GM}/messages/${id}?format=minimal`)));
  metas.sort((a, c) => Math.abs(+a.internalDate - target) - Math.abs(+c.internalDate - target));
  return metas[0].id;
}

async function findLogItem(user, r) {
  const at = r.item_at ? new Date(r.item_at) : null;
  if (r.src === 'calendar') {
    if (!at) return '';
    const p = new URLSearchParams({ timeMin: new Date(+at - 3600e3).toISOString(), timeMax: new Date(+at + 3600e3).toISOString(), singleEvents: 'true', maxResults: '10' });
    if (r.subject) p.set('q', qs(r.subject).slice(0, 60));
    const list = await G.gapi(user, `${G.CAL}/calendars/primary/events?${p}`);
    return list.items?.[0]?.id || '';
  }
  const from = emailOf(r.sender), when = at ? +at : Date.now();
  const win = at ? ` after:${Math.floor((when - 864e5) / 1000)} before:${Math.floor((when + 864e5) / 1000)}` : '';
  const subj = qs(r.subject);
  return (subj && await pickClosest(user, `${from ? `from:${from} ` : ''}subject:"${subj}"${win} -in:chats`, when))
    || (from && await pickClosest(user, `from:${from}${win} -in:chats`, when))
    || (from && await pickClosest(user, `to:${from}${win} in:sent`, when)) || '';
}

async function findStep(user, j, e, now) {
  const day = S.labelDate(e[0], now); if (!day) return null;
  const co = String(j.co || '').replace(/["\\]/g, '').replace(/\.(com|io|ai|co)$/i, '');
  if (S.norm(co).length < 3) return null;
  const after = Math.floor((day - 864e5) / 1000), before = Math.floor((day + 2 * 864e5) / 1000);
  const id = await pickClosest(user, `"${co}" after:${after} before:${before} -in:chats -in:spam`, day + 10 * 3600e3);
  return id ? { s: 'gmail', id } : null;
}

// One small batch per call. Returns how many are still left.
async function linkOld(user) {
  if (!user.refresh_enc) return { left: 0 };
  const { rows: logs } = await q(`select id, src, item_at, sender, subject from ai_log where user_id=$1 and src in ('gmail','calendar')
    and coalesce(result->>'id','') = '' and coalesce(result->>'kind','none') <> 'none' order by id desc limit 8`, [user.id]);
  await Promise.all(logs.map(async r => {
    const id = await findLogItem(user, r).catch(() => '');
    await q(`update ai_log set result = coalesce(result,'{}'::jsonb) || jsonb_build_object('id', $2::text) where id=$1`, [r.id, id || '-']);
  }));
  const { rows: jobs } = await q('select id, co, tl from jobs where user_id=$1 and not removed order by updated_at desc', [user.id]);
  const now = new Date(); let steps = 0, stepsLeft = 0;
  for (const j of jobs) {
    const tl = Array.isArray(j.tl) ? j.tl : [];
    const todo = tl.map((e, k) => k).filter(k => !tl[k][2] && !APP_STEP.test(String(tl[k][1])));
    if (!todo.length) continue;
    if (steps >= 6) { stepsLeft += todo.length; continue; }
    const mine = todo.slice(0, 6 - steps); steps += mine.length; stepsLeft += todo.length - mine.length;
    const found = await Promise.all(mine.map(k => findStep(user, j, tl[k], now).catch(() => null)));
    // Re-read before writing, so a change made meanwhile is not lost.
    const { rows } = await q('select tl from jobs where id=$1', [j.id]);
    const cur = Array.isArray(rows[0]?.tl) ? rows[0].tl : [];
    mine.forEach((k, i) => { const x = cur.findIndex(e => e[0] === tl[k][0] && e[1] === tl[k][1] && !e[2]); if (x >= 0) cur[x] = [cur[x][0], cur[x][1], found[i] || { s: 'none', id: '' }]; });
    await q('update jobs set tl=$2, updated_at=now() where id=$1', [j.id, JSON.stringify(cur)]);
  }
  const { rows: c } = await q(`select count(*)::int as n from ai_log where user_id=$1 and src in ('gmail','calendar') and coalesce(result->>'id','') = '' and coalesce(result->>'kind','none') <> 'none'`, [user.id]);
  return { left: c[0].n + stepsLeft };
}

module.exports = { linkOld };
