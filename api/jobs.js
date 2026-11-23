// The signed-in user's jobs. GET lists them, POST saves a change or runs a sync step.
const { q, err } = require('./_lib/db');
const A = require('./_lib/auth');
const G = require('./_lib/google');
const S = require('./_lib/sync');
const J = require('./_lib/jobops');
const { hasKey } = require('./_lib/ai');

const STATUSES = ['saved', 'applied', 'interview', 'offer', 'closed'];
const out = j => ({ id: j.id, co: j.co, role: j.role, src: j.src, status: j.status, applied: j.applied ? iso(j.applied) : null, firstReply: j.first_reply ? iso(j.first_reply) : null, next: j.next_raw, tl: j.tl });
function iso(d) { if (typeof d === 'string') return d.slice(0, 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const cleanTl = tl => Array.isArray(tl) ? tl.slice(0, 60).filter(e => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string')
  .map(e => { const x = [e[0].slice(0, 20), e[1].slice(0, 120)]; if (e[2] && typeof e[2] === 'object') { const m = { s: String(e[2].s || '').slice(0, 20), id: String(e[2].id || '').slice(0, 200) }; if (+e[2].f > 0) m.f = Math.min(99, +e[2].f); x.push(m); } return x; }) : null;

async function hasBackup(uid) { const { rows } = await q('select 1 from jobs_backup where user_id=$1 limit 1', [uid]); return !!rows[0]; }

// Streams one attachment straight from Gmail. Nothing is stored.
async function sendFile(res, user, msgId, attId, name, type) {
  if (!/^[\w-]{10,2000}$/.test(attId)) throw err(400, 'Bad file id.');
  const a = await G.gapi(user, `${G.GM}/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attId)}`);
  const buf = Buffer.from(String(a.data || ''), 'base64url');
  if (buf.length > 4.3e6) throw err(413, 'This file is too big to open here. Open it in Gmail.');
  const safeType = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream';
  const inline = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i.test(safeType);
  const fname = name.replace(/[\r\n"\\]/g, '').slice(0, 150) || 'file';
  res.setHeader('Content-Type', safeType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fname.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.statusCode = 200; res.end(buf);
}

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
    // One email (read only), shown when you tap a timeline step.
    if (req.query?.mail) {
      const id = String(req.query.mail);
      if (!/^[\w-]{1,64}$/.test(id)) throw err(400, 'Bad email id.');
      if (req.query.att) return sendFile(res, user, id, String(req.query.att), String(req.query.name || 'file'), String(req.query.type || ''));
      const m = await G.getMessage(user, id);
      return res.status(200).json({ mail: { id: m.id, thread: m.threadId, at: m.at, from: m.from, to: m.to, cc: m.cc, subject: m.subject, text: m.text.slice(0, 30000), files: m.files, sent: m.labels.includes('SENT') }, account: user.google_email });
    }
    // One calendar event (read only).
    if (req.query?.event) {
      const id = String(req.query.event).split('@')[0];
      if (!/^[\w-]{1,200}$/.test(id)) throw err(400, 'Bad event id.');
      const e = await G.gapi(user, `${G.CAL}/calendars/primary/events/${encodeURIComponent(id)}`);
      return res.status(200).json({ event: { title: e.summary || '', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, status: e.status,
        organizer: e.organizer?.email || '', text: String(e.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').slice(0, 20000),
        link: e.htmlLink || '', meet: e.hangoutLink || e.conferenceData?.entryPoints?.find(x => x.entryPointType === 'video')?.uri || '',
        files: (e.attachments || []).map(a => ({ name: a.title, url: a.fileUrl, type: a.mimeType })) } });
    }
    if (req.query?.log) {
      const limit = Math.min(50, Math.max(1, +req.query.limit || 15)), offset = Math.max(0, +req.query.offset || 0);
      const { rows } = await q('select at, src, item_at, sender, subject, result from ai_log where user_id=$1 order by id desc limit $2 offset $3', [user.id, limit, offset]);
      const { rows: c } = await q('select count(*)::int as n from ai_log where user_id=$1', [user.id]);
      return res.status(200).json({ log: rows, total: c[0].n });
    }
    try { await S.autoClose(user); } catch (e) { console.error('auto close failed', e.message); }
    const v = await version(user.id);
    if (req.query?.v && req.query.v === v) return res.status(200).json({ same: true, v });
    const { rows } = await q('select * from jobs where user_id=$1 and not removed order by updated_at desc, id', [user.id]);
    return res.status(200).json({
      v, name: user.name, jobs: rows.map(out), settings: { closeDays: user.close_days, backup: await hasBackup(user.id) },
      google: { available: G.configured(), connected: !!user.refresh_enc, email: user.google_email, lastSync: user.last_sync, importing: !!user.import_state, ai: hasKey() },
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
  if (b.op === 'edit') {
    const co = String(b.co || '').trim().slice(0, 80), role = String(b.role || '').trim().slice(0, 120);
    if (!co) throw err(400, 'Company is needed.');
    const { rowCount } = await q('update jobs set co=$3, role=$4, updated_at=now() where id=$1 and user_id=$2', [+b.id, user.id, co, role]);
    if (!rowCount) throw err(404, 'Job not found.');
    return res.status(200).json({ ok: true, v: await version(user.id) });
  }
  if (b.op === 'merge') {
    await J.merge(user, b.from, b.into);
    return res.status(200).json({ ok: true, v: await version(user.id) });
  }
  if (b.op === 'findmail') {
    // An older step without a saved email: look for that company's email on that day, then remember it.
    const { rows } = await q('select * from jobs where id=$1 and user_id=$2', [+b.id, user.id]);
    const j = rows[0]; if (!j) throw err(404, 'Job not found.');
    const tl = Array.isArray(j.tl) ? j.tl : [];
    const k = tl.findIndex(e => e[0] === b.label && e[1] === b.text);
    if (k < 0) throw err(404, 'Step not found.');
    if (tl[k][2]?.id) return res.status(200).json({ meta: tl[k][2] });
    const day = S.labelDate(b.label, new Date()); if (!day) return res.status(200).json({ meta: null });
    const words = S.norm(j.co).length > 2 ? `"${j.co.replace(/["\\]/g, '').replace(/\.(com|io|ai|co)$/i, '')}"` : '';
    if (!words) return res.status(200).json({ meta: null });
    const after = Math.floor((day - 864e5) / 1000), before = Math.floor((day + 2 * 864e5) / 1000);
    const list = await G.gapi(user, `${G.GM}/messages?${new URLSearchParams({ q: `${words} after:${after} before:${before} -in:chats -in:spam`, maxResults: '10' })}`);
    const ids = (list.messages || []).map(m => m.id);
    if (!ids.length) return res.status(200).json({ meta: null });
    // Pick the one closest to that day (Israel time noon).
    const metas = await Promise.all(ids.slice(0, 6).map(id => G.gapi(user, `${G.GM}/messages/${id}?format=minimal`)));
    const target = day + 10 * 3600e3;
    metas.sort((a, c) => Math.abs(+a.internalDate - target) - Math.abs(+c.internalDate - target));
    const best = metas[0];
    const full = await G.getMessage(user, best.id);
    const meta = { s: 'gmail', id: best.id }; if (full.files.length) meta.f = full.files.length;
    tl[k] = [tl[k][0], tl[k][1], meta];
    await q('update jobs set tl=$2 where id=$1', [j.id, JSON.stringify(tl)]);
    return res.status(200).json({ meta });
  }
  if (b.op === 'rebuild') {
    if (!user.refresh_enc) throw err(409, 'Connect Gmail first.');
    const n = await S.rebuild(user);
    // Renew the Gmail ping so it covers Inbox + Sent from now on.
    try { await S.startWatches(user, user.push_base || G.baseUrl(req)); } catch (e) { console.error('watch renew failed', e.message); }
    return res.status(200).json({ ok: true, backedUp: n });
  }
  if (b.op === 'restore') {
    const n = await S.restore(user);
    if (!n) throw err(404, 'No saved list to bring back.');
    return res.status(200).json({ ok: true, restored: n });
  }
  if (b.op === 'tz') {
    if (typeof b.tz === 'string' && b.tz.length < 60) { try { new Intl.DateTimeFormat('en', { timeZone: b.tz }); await q('update users set tz=$2 where id=$1', [user.id, b.tz]); } catch {} }
    return res.status(200).json({ ok: true });
  }
  if (b.op === 'settings') {
    const d = Math.round(+b.closeDays);
    if (!(d >= 0 && d <= 365)) throw err(400, 'Pick 0 to 365 days.');
    await q('update users set close_days=$2 where id=$1', [user.id, d]);
    await S.autoClose({ ...user, close_days: d });
    return res.status(200).json({ ok: true, v: await version(user.id) });
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
