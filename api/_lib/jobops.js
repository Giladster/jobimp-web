// Job changes shared by the app (api/jobs.js) and the Agent (api/agent.js).
const { q, err } = require('./db');
const { labelDate } = require('./sync');

// Join two jobs that are really one: timelines and dates go into "into", "from" is removed.
async function merge(user, fromId, intoId) {
  const { rows } = await q('select * from jobs where user_id=$1 and id = any($2::int[]) and not removed', [user.id, [+fromId, +intoId]]);
  const from = rows.find(r => r.id === +fromId), into = rows.find(r => r.id === +intoId);
  if (!from || !into || from.id === into.id) throw err(404, 'Job not found.');
  const now = new Date(), seen = new Set(), tl = [];
  for (const e of [...(into.tl || []), ...(from.tl || [])]) { const k = e[0] + '|' + String(e[1]).toLowerCase(); if (!seen.has(k)) { seen.add(k); tl.push(e); } }
  tl.sort((a, c) => labelDate(c[0], now) - labelDate(a[0], now));
  const RANK = { saved: 0, applied: 1, interview: 2, offer: 3 };
  const open = [into, from].filter(j => j.status !== 'closed');
  const status = open.length ? open.sort((a, c) => RANK[c.status] - RANK[a.status])[0].status : 'closed';
  const min = (a, c) => (a && c ? (String(a) < String(c) ? a : c) : a || c || null);
  await q(`update jobs set tl=$2, status=$3, applied=$4, first_reply=$5, next_raw=$6, role=$7, steps_at=null, updated_at=now() where id=$1`,
    [into.id, JSON.stringify(tl.slice(0, 60)), status, min(into.applied, from.applied), min(into.first_reply, from.first_reply), into.next_raw || from.next_raw, into.role && into.role !== 'Role not named' ? into.role : from.role]);
  await q('update jobs set removed=true, updated_at=now() where id=$1', [from.id]);
  return { from, into };
}

module.exports = { merge };
