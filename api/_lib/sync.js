// Turns new emails and calendar events into job updates.
const crypto = require('crypto');
const { q } = require('./db');
const { gapi, getMessage, GM, CAL } = require('./google');
const { classify, hasKey } = require('./ai');
const { signValue } = require('./auth');

/* ---------- dates in the user's time zone ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function parts(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}
const isoDay = (date, tz) => { const p = parts(date, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
const label = (date, tz) => { const p = parts(date, tz); return `${MON[p.m - 1]} ${p.d}`; };
// "2026-11-25T11:30" in tz -> real moment
function fromLocal(s, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || ''); if (!m) return null;
  const guess = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const p = parts(new Date(guess), tz), off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
  return new Date(guess - off);
}
function nextRaw(at, tz) {
  const p = parts(at, tz), wd = WD[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${wd} ${MON[p.m - 1]} ${p.d}, ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}
// "Nov 22" -> time. Labels have no year: pick the year that puts it within ~5 months ahead or ~7 months back.
function labelDate(l, now) {
  const m = /^([A-Z][a-z]{2})\s+(\d{1,2})$/.exec(String(l).trim()); const mi = m ? MON.indexOf(m[1]) : -1;
  if (mi < 0) return 0;
  const y = now.getUTCFullYear(); let d = Date.UTC(y, mi, +m[2]);
  if (d - now > 150 * 864e5) d = Date.UTC(y - 1, mi, +m[2]); else if (now - d > 215 * 864e5) d = Date.UTC(y + 1, mi, +m[2]);
  return d;
}

/* ---------- matching ---------- */
const norm = s => String(s || '').toLowerCase().replace(/\.(com|io|ai|co)\b/g, '').replace(/\b(ltd|inc|llc|group|technologies|israel)\b/g, '').replace(/[^a-z0-9֐-׿]+/g, '');
function findJob(jobs, co, role) {
  // Jobs you still have come first; a removed (or merged) job only matches when nothing else does.
  const live = jobs.filter(j => !j.removed);
  return pickJob(live, co, role) || pickJob(jobs.filter(j => j.removed), co, role);
}
function pickJob(jobs, co, role) {
  const n = norm(co); if (!n) return null;
  const same = jobs.filter(j => { const m = norm(j.co); return m === n || (m.length > 3 && n.length > 3 && (m.startsWith(n) || n.startsWith(m))); });
  if (same.length <= 1) return same[0] || null;
  const r = norm(role);
  return (r && same.find(j => norm(j.role) === r || norm(j.role).includes(r) || r.includes(norm(j.role)))) || same.find(j => j.status !== 'closed') || same[0];
}
const SENT_KINDS = ['submitted', 'followup', 'replied'];
const SLABEL = { saved: 'Saved', applied: 'Awaiting reply', interview: 'Interview', offer: 'Offer', closed: 'Closed' };
const STATUS_OF = { applied: 'applied', invited: 'interview', scheduled: 'interview', assignment: 'interview', update: 'interview', rejected: 'closed', offer: 'offer' };

/* ---------- apply one event to the jobs table ---------- */
async function applyEvent(user, ev, jobs) {
  const tz = user.tz || 'Asia/Jerusalem', now = new Date();
  const at = ev.kind === 'scheduled' || ev.kind === 'invited' ? fromLocal(ev.interview_at, tz) : null;
  const day = isoDay(ev.date, tz), lab = label(ev.date, tz);
  const note = (ev.note || '').trim().slice(0, 60) || 'Update';
  const meta = { s: ev.src, id: ev.extId }; if (ev.nfiles) meta.f = ev.nfiles;
  let j = findJob(jobs, ev.company, ev.role);
  const mine = ev.sent || SENT_KINDS.includes(ev.kind);
  if (!j) {
    if (ev.kind === 'none' || ev.kind === 'update' || (mine && ev.kind !== 'applied')) return null;
    const { rows } = await q(`insert into jobs (user_id, co, role, src, status, applied, first_reply, tl) values ($1,$2,$3,'Email',$4,$5,$6,'[]') returning *`,
      [user.id, ev.company.slice(0, 80), (ev.role || '').slice(0, 120) || 'Role not named', STATUS_OF[ev.kind], ev.kind === 'applied' ? day : null, ev.kind === 'applied' ? null : day]);
    j = rows[0]; jobs.push(j);
  }
  if (j.removed) return null;
  let tl = Array.isArray(j.tl) ? j.tl.slice() : [];
  // Drop planned interviews that are still ahead (past ones stay, the app shows them as done).
  const today = Date.UTC(...isoDay(now, tz).split('-').map((v, k) => k === 1 ? v - 1 : +v));
  const notUpcoming = e => !/\(coming up\)/.test(e[1]) || labelDate(e[0], now) < today;
  const has = (l, t) => tl.some(e => e[0] === l && String(e[1]).toLowerCase() === t.toLowerCase());
  if (!has(lab, note)) tl.unshift([lab, note, meta]);
  let status = j.status, applied = j.applied, firstReply = j.first_reply, next = j.next_raw;
  if (ev.kind === 'rejected') { status = 'closed'; next = null; tl = tl.filter(notUpcoming); }
  else if (ev.kind === 'offer') status = 'offer';
  else if (ev.kind === 'applied') { if (status === 'saved') status = 'applied'; if (!applied) applied = day; }
  else if (STATUS_OF[ev.kind] === 'interview' && status !== 'offer') status = 'interview';
  if (!mine && ev.kind !== 'applied' && ev.kind !== 'none' && ev.kind !== 'canceled' && !firstReply) firstReply = day;
  if (at && at > now) {
    next = nextRaw(at, tz);
    tl = tl.filter(notUpcoming);
    tl.unshift([label(at, tz), 'Interview (coming up)', meta]);
  }
  if (ev.kind === 'canceled') { tl = tl.filter(notUpcoming); next = null; }
  tl.sort((a, b) => labelDate(b[0], now) - labelDate(a[0], now));
  const { rows } = await q(`update jobs set status=$2, applied=$3, first_reply=$4, next_raw=$5, tl=$6, updated_at=now() where id=$1 returning *`,
    [j.id, status, applied, firstReply, next, JSON.stringify(tl.slice(0, 40))]);
  Object.assign(j, rows[0]);
  return j;
}

/* ---------- auto-close: no news for X days (user setting) -> Closed ---------- */
async function autoClose(user) {
  const days = +user.close_days; if (!(days > 0)) return 0;
  const tz = user.tz || 'Asia/Jerusalem', now = new Date();
  const today = Date.UTC(...isoDay(now, tz).split('-').map((v, k) => k === 1 ? v - 1 : +v));
  const { rows } = await q(`select * from jobs where user_id=$1 and not removed and status in ('applied','interview')`, [user.id]);
  let n = 0;
  for (const j of rows) {
    const tl = Array.isArray(j.tl) ? j.tl : [];
    const dates = tl.map(e => labelDate(e[0], now)).filter(Boolean);
    if (dates.some(d => d > today)) continue; // an interview is still ahead
    if (j.next_raw) { const m = /^\w{3} ([A-Z][a-z]{2} \d{1,2})/.exec(j.next_raw); if (m && labelDate(m[1], now) >= today) continue; }
    [j.applied, j.first_reply].forEach(d => { if (d) dates.push(Date.UTC(...String(d).slice(0, 10).split('-').map((v, k) => k === 1 ? v - 1 : +v))); });
    if (!dates.length) continue;
    const last = Math.max(...dates);
    if ((today - last) / 864e5 <= days) continue;
    const at = new Date(last + days * 864e5);
    const note = [`${MON[at.getUTCMonth()]} ${at.getUTCDate()}`, `Closed: no news for ${days} days`];
    await q(`update jobs set status='closed', next_raw=null, tl=$2, updated_at=now() where id=$1`, [j.id, JSON.stringify([note, ...tl].slice(0, 40))]);
    n++;
  }
  return n;
}

/* ---------- Gmail ---------- */
const JOBBY = /(application|applying|applied|interview|candidate|candidacy|position|role|recruit|hiring|talent|career|opportunit|assignment|home task|offer|thank you for your interest|unfortunately|next steps|move forward|ראיון|מועמד|משרה|תפקיד|קורות חיים|גיוס)/i;
const SKIP_LABELS = ['SPAM', 'TRASH', 'DRAFT', 'CHAT', 'CATEGORY_PROMOTIONS'];
const SENT_SEARCH = 'in:sent -in:chats';
const SKIP_FROM = /jobalerts-noreply@linkedin|jobs-listings@|newsletter|digest@/i;
const SEARCH = '-in:sent -in:chats -category:promotions -category:social (application OR applying OR applied OR interview OR candidate OR position OR recruiter OR recruiting OR "thank you for your interest" OR unfortunately OR "next steps" OR assignment OR offer OR ראיון OR מועמדות OR משרה)';

async function claim(user, src, ids) {
  if (!ids.length) return [];
  const { rows } = await q(`insert into seen (user_id, src, ext_id) select $1, $2, unnest($3::text[]) on conflict do nothing returning ext_id`, [user.id, src, ids]);
  return rows.map(r => r.ext_id);
}
async function unclaim(user, src, ids) { if (ids.length) await q('delete from seen where user_id=$1 and src=$2 and ext_id = any($3::text[])', [user.id, src, ids]); }

async function pool(list, n, fn) {
  const out = new Array(list.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (k < list.length) { const i = k++; out[i] = await fn(list[i], i); } }));
  return out;
}

async function loadJobs(user) { return (await q('select * from jobs where user_id=$1', [user.id])).rows; }

async function classifyAndApply(user, items) {
  if (!items.length) return 0;
  const jobs = await loadJobs(user);
  const known = [...new Set(jobs.filter(j => !j.removed).map(j => j.co))];
  const batches = []; for (let i = 0; i < items.length; i += 8) batches.push(items.slice(i, i + 8).map((x, k) => ({ ...x, i: k })));
  const results = (await pool(batches, 3, b => classify(b, known))).flat();
  results.sort((a, b) => a.date - b.date);
  let n = 0; const logs = [];
  for (const r of results) {
    if (r.sent && !['applied', ...SENT_KINDS, 'none'].includes(r.kind)) r.kind = 'none';
    // Plain words for the email log in Settings.
    let did = 'Skipped: not about a job application';
    if (r.job_related && !r.company) did = "Skipped: couldn't tell which company";
    else if (r.job_related && r.kind !== 'none') {
      const before = findJob(jobs, r.company, r.role), prev = before && { status: before.status, n: (before.tl || []).length };
      const j = await applyEvent(user, { ...r, extId: r.extId, src: r.src }, jobs);
      if (!j) did = before?.removed ? `Skipped: you removed ${before.co}` : `Skipped: no ${r.company} job to update`;
      else {
        n++;
        if (!prev) did = `${j.co}: new job added (${SLABEL[j.status] || j.status})`;
        else if (prev.status !== j.status) did = `${j.co}: moved to ${SLABEL[j.status] || j.status}`;
        else if ((j.tl || []).length > prev.n) did = `${j.co}: added "${r.note || 'Update'}" to timeline`;
        else did = `${j.co}: already up to date`;
      }
    }
    logs.push([r.src, r.date, String(r.from || '').slice(0, 200), String(r.subject || '').slice(0, 300),
      JSON.stringify({ did, company: r.company || '', role: r.role || '', kind: r.kind || 'none', note: r.note || '', why: r.why || '' })]);
  }
  await writeLog(user, logs);
  return n;
}
async function writeLog(user, rows) {
  if (!rows.length) return;
  const cols = ['src', 'item_at', 'sender', 'subject', 'result'];
  await q(`insert into ai_log (user_id, ${cols.join(', ')}) select $1, * from unnest($2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::jsonb[])`,
    [user.id, ...cols.map((_, k) => rows.map(r => r[k]))]);
}

async function processMessages(user, ids) {
  const mine = await claim(user, 'gmail', [...new Set(ids)]);
  if (!mine.length) return 0;
  try {
    const msgs = (await pool(mine, 5, id => getMessage(user, id).catch(e => (e.status === 404 ? null : Promise.reject(e))))).filter(Boolean);
    // Emails you sent count when they look job related or go to a company in My jobs.
    const known = (await loadJobs(user)).filter(j => !j.removed).map(j => norm(j.co)).filter(n => n.length > 2);
    const toKnown = m => { const t = norm((m.to + ' ' + m.cc).replace(/@/g, ' ')); return known.some(n => t.includes(n)); };
    const isSent = m => m.labels.includes('SENT');
    const items = msgs.filter(m => !m.labels.some(l => SKIP_LABELS.includes(l)) && (isSent(m)
        ? JOBBY.test(m.subject + ' ' + m.text.slice(0, 3000)) || toKnown(m)
        : !SKIP_FROM.test(m.from) && JOBBY.test(m.subject + ' ' + m.snippet + ' ' + m.text.slice(0, 3000))))
      .map(m => ({ type: 'email', src: 'gmail', sent: isSent(m), extId: m.id, date: m.at, from: m.from, to: m.to, subject: m.subject, text: m.text,
        files: m.files.map(f => f.name).join(', '), nfiles: m.files.length }));
    return await classifyAndApply(user, items);
  } catch (e) { await unclaim(user, 'gmail', mine); throw e; }
}

/* ---------- Calendar ---------- */
const CAL_JOBBY = /(interview|ראיון|screen|recruit|hr call|hiring|technical call|assignment review|onsite|on-site)/i;
function calItems(user, events) {
  const tz = user.tz || 'Asia/Jerusalem', out = [];
  for (const e of events) {
    const text = (e.summary || '') + ' ' + (e.description || '');
    if (!CAL_JOBBY.test(text)) continue;
    const start = e.start?.dateTime ? new Date(e.start.dateTime) : null;
    if (!start) continue;
    const p = parts(start, tz), local = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}T${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
    out.push({ type: 'calendar', src: 'calendar', extId: e.status === 'cancelled' ? `${e.id}@cancel` : `${e.id}@${e.start.dateTime}`, cancelled: e.status === 'cancelled',
      date: e.created ? new Date(e.created) : new Date(), start: local, from: e.organizer?.email || '', subject: e.summary || '', text: (e.description || '').replace(/<[^>]+>/g, ' ') });
  }
  return out;
}
async function processEvents(user, events) {
  const items = calItems(user, events);
  const mine = new Set(await claim(user, 'calendar', items.map(x => x.extId)));
  const todo = items.filter(x => mine.has(x.extId));
  try {
    const live = todo.filter(x => !x.cancelled);
    let n = await classifyAndApply(user, live);
    // Canceled meetings: mark the matching job.
    const canceled = todo.filter(x => x.cancelled);
    if (canceled.length) {
      const res = await classify(canceled.map((x, i) => ({ ...x, i })), []);
      const jobs = await loadJobs(user);
      for (const r of res) if (r.company) { if (await applyEvent(user, { ...r, kind: 'canceled', note: 'An interview was canceled', date: new Date(), interview_at: null }, jobs)) n++; }
    }
    return n;
  } catch (e) { await unclaim(user, 'calendar', todo.map(x => x.extId)); throw e; }
}

/* ---------- first import, step by step (called again and again by the app until done) ---------- */
async function importStep(user) {
  if (!hasKey()) return { done: false, waiting: 'ai', read: 0, updates: 0 };
  const st = user.import_state || { phase: 'gmail', n: 0, jobs: 0 };
  const from = user.synced_from ? new Date(user.synced_from) : new Date(Date.now() - 180 * 864e5);
  if (!user.gmail_history) {
    const prof = await gapi(user, `${GM}/profile`);
    await q('update users set gmail_history=$2 where id=$1', [user.id, String(prof.historyId)]); user.gmail_history = String(prof.historyId);
  }
  if (st.phase === 'gmail') {
    const after = Math.floor(from.getTime() / 1000);
    const p = new URLSearchParams({ q: `after:${after} ${SEARCH}`, maxResults: '20' }); if (st.page) p.set('pageToken', st.page);
    const list = await gapi(user, `${GM}/messages?${p}`);
    const ids = (list.messages || []).map(m => m.id);
    st.jobs += await processMessages(user, ids); st.n += ids.length;
    st.page = list.nextPageToken || null; if (!st.page) st.phase = 'sent';
  } else if (st.phase === 'sent') {
    const after = Math.floor(from.getTime() / 1000);
    const p = new URLSearchParams({ q: `after:${after} ${SENT_SEARCH}`, maxResults: '25' }); if (st.page) p.set('pageToken', st.page);
    const list = await gapi(user, `${GM}/messages?${p}`);
    const ids = (list.messages || []).map(m => m.id);
    st.jobs += await processMessages(user, ids); st.n += ids.length;
    st.page = list.nextPageToken || null; if (!st.page) st.phase = 'cal';
  } else if (st.phase === 'cal') {
    const p = new URLSearchParams({ timeMin: from.toISOString(), timeMax: new Date(Date.now() + 120 * 864e5).toISOString(), singleEvents: 'true', maxResults: '250' });
    if (st.page) p.set('pageToken', st.page);
    const list = await gapi(user, `${CAL}/calendars/primary/events?${p}`);
    st.jobs += await processEvents(user, list.items || []); st.n += (list.items || []).length;
    st.page = list.nextPageToken || null; if (!st.page) st.phase = 'done';
  }
  const done = st.phase === 'done';
  await q(`update users set import_state=$2, last_sync=case when $3 then now() else last_sync end, cal_checked=case when $3 then now() else cal_checked end where id=$1`,
    [user.id, done ? null : JSON.stringify(st), done]);
  return { done, phase: st.phase, read: st.n, updates: st.jobs };
}

/* ---------- catch up: new mail since the last history id, calendar changes since last check ---------- */
async function catchUp(user, historyHint) {
  // No AI key yet: read nothing. Gmail keeps the place, so mail from now on is read once the key is set.
  if (!hasKey()) return 0;
  let n = 0;
  if (user.gmail_history) {
    const ids = []; let page = null, latest = user.gmail_history, gone = false;
    for (let k = 0; k < 5; k++) {
      const p = new URLSearchParams({ startHistoryId: user.gmail_history, historyTypes: 'messageAdded', maxResults: '100' }); if (page) p.set('pageToken', page);
      let h; try { h = await gapi(user, `${GM}/history?${p}`); } catch (e) { if (e.status === 404) { gone = true; break; } throw e; }
      (h.history || []).forEach(x => (x.messagesAdded || []).forEach(m => ids.push(m.message.id)));
      if (h.historyId) latest = String(h.historyId);
      page = h.nextPageToken; if (!page) break;
    }
    if (gone) {
      // History too old: search recent mail instead.
      const since = Math.floor((user.last_sync ? new Date(user.last_sync).getTime() - 864e5 : Date.now() - 7 * 864e5) / 1000);
      for (const qq of [SEARCH, SENT_SEARCH]) {
        const list = await gapi(user, `${GM}/messages?${new URLSearchParams({ q: `after:${since} ${qq}`, maxResults: '50' })}`);
        (list.messages || []).forEach(m => ids.push(m.id));
      }
      latest = String(historyHint || (await gapi(user, `${GM}/profile`)).historyId);
    }
    n += await processMessages(user, ids);
    await q(`update users set gmail_history=$2 where id=$1 and (gmail_history is null or gmail_history::numeric < $2::numeric)`, [user.id, latest]);
  }
  const since = user.cal_checked ? new Date(new Date(user.cal_checked).getTime() - 2 * 60e3) : new Date(Date.now() - 864e5);
  await q('update users set cal_checked=now() where id=$1', [user.id]);
  const p = new URLSearchParams({ updatedMin: since.toISOString(), singleEvents: 'true', showDeleted: 'true', maxResults: '250' });
  const list = await gapi(user, `${CAL}/calendars/primary/events?${p}`);
  n += await processEvents(user, list.items || []);
  await q('update users set last_sync=now() where id=$1', [user.id]);
  return n;
}

/* ---------- watches: Google pings us when new mail or calendar changes arrive ---------- */
function pushBase(base) {
  const by = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return { base, qs: by ? `?x-vercel-protection-bypass=${encodeURIComponent(by)}` : '' };
}
async function startWatches(user, base) {
  const out = { gmail: false, calendar: false };
  if (process.env.GOOGLE_PUBSUB_TOPIC) {
    try {
      const w = await gapi(user, `${GM}/watch`, { method: 'POST', json: { topicName: process.env.GOOGLE_PUBSUB_TOPIC, labelIds: ['INBOX', 'SENT'], labelFilterBehavior: 'include' } });
      await q(`update users set gmail_watch_exp=$2, gmail_history=coalesce(gmail_history,$3), watch_v=2 where id=$1`, [user.id, +w.expiration, String(w.historyId)]);
      out.gmail = true;
    } catch (e) { console.error('gmail watch failed', e.message); }
  }
  if (base) {
    try {
      if (user.cal_channel && user.cal_resource) await gapi(user, `${CAL}/channels/stop`, { method: 'POST', json: { id: user.cal_channel, resourceId: user.cal_resource } }).catch(() => {});
      const { qs } = pushBase(base), id = crypto.randomUUID();
      const w = await gapi(user, `${CAL}/calendars/primary/events/watch`, { method: 'POST', json: { id, type: 'web_hook', address: `${base}/api/calendar-push${qs}`, token: signValue({ u: user.id }), params: { ttl: '604800' } } });
      await q(`update users set cal_channel=$2, cal_resource=$3, cal_exp=$4, push_base=$5 where id=$1`, [user.id, id, w.resourceId, +w.expiration, base]);
      out.calendar = true;
    } catch (e) { console.error('calendar watch failed', e.message); }
  }
  return out;
}

/* ---------- re-read everything: back up the list, empty it, read Gmail + Calendar again ---------- */
async function rebuild(user, days = 180) {
  const { rows } = await q('select * from jobs where user_id=$1 order by id', [user.id]);
  await q('insert into jobs_backup (user_id, data) values ($1, $2)', [user.id, JSON.stringify(rows)]);
  await q('delete from jobs where user_id=$1', [user.id]);
  await q('delete from seen where user_id=$1', [user.id]);
  await q('delete from ai_log where user_id=$1', [user.id]);
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  await q(`update users set synced_from=$2, import_state='{"phase":"gmail","n":0,"jobs":0}'::jsonb where id=$1`, [user.id, from]);
  return rows.length;
}
async function restore(user) {
  const { rows } = await q('select * from jobs_backup where user_id=$1 order by id desc limit 1', [user.id]);
  if (!rows[0]) return 0;
  await q('delete from jobs where user_id=$1', [user.id]);
  for (const j of rows[0].data) {
    await q(`insert into jobs (user_id, co, role, src, status, applied, first_reply, next_raw, tl, removed) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [user.id, j.co, j.role, j.src, j.status, j.applied, j.first_reply, j.next_raw, JSON.stringify(j.tl || []), !!j.removed]);
  }
  await q('delete from jobs_backup where id=$1', [rows[0].id]);
  await q('update users set import_state=null where id=$1', [user.id]);
  return rows[0].data.length;
}

module.exports = { rebuild, restore, norm, labelDate, autoClose, importStep, catchUp, startWatches, processEvents, applyEvent, nextRaw, fromLocal, label };
