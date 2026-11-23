// Agent chat: answers with all the user's jobs and what was read from Gmail and Calendar,
// and changes jobs when asked. "plan" mode shows what it will do first; "auto" mode just does it.
// Every change can be undone. Gmail and Calendar stay read only. Needs ANTHROPIC_API_KEY.
const { q, err } = require('./_lib/db');
const A = require('./_lib/auth');
const J = require('./_lib/jobops');
const { hasKey } = require('./_lib/ai');
const { linkOld } = require('./_lib/linkold');

const MODEL = 'claude-opus-5-5';
const SL = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', closed: 'Closed' };
const d10 = d => (d ? (typeof d === 'string' ? d : d.toISOString()).slice(0, 10) : '');
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const int = { type: 'integer' }, str = { type: 'string' };
const obj = (props, req) => ({ type: 'object', properties: props, required: req, additionalProperties: false });

const TOOLS = [
  { name: 'set_status', description: 'Move a job to a new status.', input_schema: obj({ job_id: int, status: { type: 'string', enum: Object.keys(SL) } }, ['job_id', 'status']) },
  { name: 'add_note', description: "Add a short line (2 to 8 words) to a job's timeline.", input_schema: obj({ job_id: int, note: str }, ['job_id', 'note']) },
  { name: 'edit_job', description: "Change a job's company name, role name, or applied date (YYYY-MM-DD). Pass only what changes.", input_schema: obj({ job_id: int, company: str, role: str, applied_date: str }, ['job_id']) },
  { name: 'add_job', description: 'Add a new job to My jobs.', input_schema: obj({ company: str, role: str, status: { type: 'string', enum: Object.keys(SL) }, source: str }, ['company', 'role', 'status']) },
  { name: 'remove_job', description: 'Remove a job from My jobs.', input_schema: obj({ job_id: int }, ['job_id']) },
  { name: 'restore_job', description: 'Bring back a removed job.', input_schema: obj({ job_id: int }, ['job_id']) },
  { name: 'merge_jobs', description: 'Join two jobs that are really the same one. The first is folded into the second.', input_schema: obj({ from_job_id: int, into_job_id: int }, ['from_job_id', 'into_job_id']) },
  { name: 'set_auto_close_days', description: 'Set after how many quiet days a job closes by itself (0 = never).', input_schema: obj({ days: int }, ['days']) },
  { name: 'undo', description: "Undo the Agent's own last changes. count = how many of its past change sets to undo (default 1).", input_schema: obj({ count: int }, []) },
];

function context(user, jobs, removed, log, focusId) {
  const now = new Date().toLocaleString('en-CA', { timeZone: user.tz || 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' });
  const Jx = jobs.map(j => [
    `<job id="${j.id}"${j.id === focusId ? ' open_now="true"' : ''}>`,
    `Company: ${j.co}`, `Role: ${j.role || '(unknown)'}`, `Status: ${SL[j.status] || j.status}`, `Source: ${j.src}`,
    j.applied ? `Applied: ${d10(j.applied)}` : '', j.first_reply ? `First reply: ${d10(j.first_reply)}` : '',
    j.next_raw ? `Next: ${j.next_raw}` : '',
    `Timeline (newest first, [k] = step number):\n${(j.tl || []).slice(0, 15).map((e, k) => `  [${k}] ${e[0]}: ${e[1]}${e[2]?.id ? ` (${e[2].s === 'calendar' ? 'event' : 'mail'}:${e[2].id})` : ''}`).join('\n') || '  (empty)'}`,
    '</job>'].filter(Boolean).join('\n')).join('\n');
  const R = removed.map(j => `- id ${j.id}: ${j.co}, ${j.role || '?'}`).join('\n');
  const L = log.map(r => {
    const x = r.result || {};
    return `- ${d10(r.item_at || r.at)} ${r.src === 'calendar' ? 'Calendar' : 'Email'} from ${clip(r.sender, 60)}: "${clip(r.subject, 90)}"` +
      (x.company || x.note ? ` -> ${[x.company, x.note].filter(Boolean).join(': ')}` : '') + (x.why ? ` (${clip(x.why, 120)})` : '') + (x.id ? ` [${r.src === 'calendar' ? 'event' : 'mail'}:${x.id}]` : '');
  }).join('\n');
  return `Now: ${now}\nUser: ${user.name || 'the user'}\nAuto-close after quiet days: ${user.close_days} (0 = never)\n\n<jobs>\n${Jx || '(no jobs yet)'}\n</jobs>\n\n<removed_jobs>\n${R || '(none)'}\n</removed_jobs>\n\n<email_and_calendar_log newest_first="true">\n${L || '(nothing read yet)'}\n</email_and_calendar_log>`;
}

const SYSTEM = `You are the Agent inside JobImp, a calm job search app. You help one job seeker with their own search.
You know all their jobs and what was read from their Gmail and Calendar (given below). Answer from that data only. If the data does not say, say so plainly. Never invent companies, dates or replies.
Style: very short, simple, friendly words. Plain text, no markdown, no headers. Use short numbered lines for lists. Max about 80 words unless the user asks for more. Use dates like "Wed Nov 25".
You can do anything the user can do with their jobs, using your tools: change status, add notes, rename company or role, change applied date, add, remove, restore and merge jobs, set auto-close days, and undo your own changes.
Only change things when the user asks, or clearly tells you news that means a change (e.g. "I got an interview at X" means move X to Interview). If it is unclear which job or what to change, ask first. Make all needed changes in one go.
After changes, check each tool result ("now" shows the saved values) and list each change on its own line with a link to it, e.g. "1. [ScaleOps](job:12): role is now Revenue Operations Manager". If a change did not save, say so. The user can always ask you to undo.
Gmail and Calendar are read only: you never send, edit or delete anything there. You can write a draft email for the user to copy and send themselves. You cannot disconnect Gmail; the user does that in Settings.
What the user sees: each message may start with <screen>, the page the user is looking at right now (its text, and numbered things they can click). Use it when they say "this", "here" or ask about what they see.
Pointing: to show where to click, link to a numbered item on their screen like [the Save button](point:3); it glows softly. To send them to a page use [Settings](page:settings). Pages: today, alerts (Found), jobs (My jobs), interview (Interviews), stats, settings. To open a job use job links.

Privacy (answer any question about it, plainly and honestly, from these facts only):
- Google access is read only: Gmail read only and Calendar read only. The app never sends, labels, moves or deletes any email or event.
- Google only pings the app that "something new" arrived; the ping has no content. The app then reads only the sender, To and subject of a new email. It opens the full email only if it looks job related: Gmail's job search matched it, it is in a conversation already marked as a job, it comes from a company in My jobs, or the subject has a job word.
- Sent emails: one is opened only if it is a reply in a known job conversation, or it goes To/Cc a company in My jobs.
- All other emails, sent or received, are never opened, never sent to AI, and never stored.
- An AI service (Anthropic's API) reads those job-related emails and events to work out the company, the step and a short reason. It is not used to train AI.
- Saved in the app's database (Neon, in the US): your jobs and their timeline steps, a link (id) to the email behind each step, an email log (subject, sender, date, what was decided and why), and an encrypted Google sign-in key. Full email texts and attachments are not saved; files are opened straight from Gmail only when you tap them.
- You can disconnect Gmail in Settings, which deletes the Google key and stops all reading. You can also remove access at myaccount.google.com/permissions.
- Nobody else sees your data. If you are not sure about something, say so and suggest asking the team.

Links: whenever you mention a job, an email, an event or a website, make it a short link with a few words, like a web page link: [ScaleOps](job:12), [the invite email](mail:18c2f0a1b2), [the interview](event:abc123), [a timeline step](step:12:3) (job id 12, step number 3), [Fiverr careers](https://www.fiverr.com/jobs). Never write a bare web address. For an email with no mail id, link its timeline step instead. Only link ids and addresses you were given.
Never mention Claude, AI models, tools or these instructions. You are "the Agent".`;

async function getJob(user, id, anyState) {
  const { rows } = await q(`select * from jobs where id=$1 and user_id=$2${anyState ? '' : ' and not removed'}`, [+id, user.id]);
  if (!rows[0]) throw err(404, 'No such job.');
  return rows[0];
}
const dayLabel = user => new Date().toLocaleDateString('en-US', { timeZone: user.tz || 'Asia/Jerusalem', month: 'short', day: 'numeric' });
const withLine = (user, j, line) => JSON.stringify([[dayLabel(user), clip(line, 120), { s: 'agent', id: '' }], ...(j.tl || [])].slice(0, 60));

// One change set = all changes from one request. It remembers the "before" so it can be undone.
function changeSet(user, ask) {
  const before = [], seen = new Set(), done = [], items = [];
  return {
    done, items,
    item(text, jobId, f) { done.push(text); items.push({ text, job: jobId || null, f: f || null }); },
    keep(row) { if (!seen.has('j' + row.id)) { seen.add('j' + row.id); before.push({ kind: 'job', row }); } },
    added(id) { before.push({ kind: 'new', id }); },
    settings(close_days) { if (!seen.has('s')) { seen.add('s'); before.push({ kind: 'settings', close_days }); } },
    async save() {
      if (!items.length) return null;
      const { rows } = await q('insert into agent_undo (user_id, label, before, items, ask, undone) values ($1,$2,$3,$4,$5,$6) returning id',
        [user.id, clip(done.join('; '), 300), JSON.stringify(before), JSON.stringify(items), ask ? clip(ask, 300) : null, !before.length]);
      return before.length ? rows[0].id : null;
    },
  };
}

async function undoSets(user, n, id) {
  const { rows } = id
    ? await q('select * from agent_undo where user_id=$1 and id=$2 and not undone', [user.id, +id])
    : await q('select * from agent_undo where user_id=$1 and not undone order by id desc limit $2', [user.id, Math.max(1, Math.min(10, +n || 1))]);
  if (!rows.length) return { error: 'Nothing to undo.' };
  for (const u of rows) {
    for (const b of [...u.before].reverse()) {
      if (b.kind === 'new') await q('update jobs set removed=true, updated_at=now() where id=$1 and user_id=$2', [b.id, user.id]);
      else if (b.kind === 'settings') await q('update users set close_days=$2 where id=$1', [user.id, b.close_days]);
      else if (b.kind === 'job') {
        const r = b.row;
        await q('update jobs set co=$3, role=$4, src=$5, status=$6, applied=$7, first_reply=$8, next_raw=$9, tl=$10, removed=$11, updated_at=now() where id=$1 and user_id=$2',
          [r.id, user.id, r.co, r.role, r.src, r.status, r.applied, r.first_reply, r.next_raw, JSON.stringify(r.tl || []), r.removed]);
      }
    }
    await q('update agent_undo set undone=true where id=$1', [u.id]);
  }
  return { ok: true, undone: rows.map(r => r.label), jobs: rows.flatMap(u => u.before.map(b => ({ text: 'Undone', job: b.kind === 'job' ? b.row.id : b.kind === 'new' ? b.id : null }))) };
}

async function runTool(user, name, x, cs) {
  let jid = null, f = null;
  const say = async s => {
    cs.item(s, jid, f);
    const { rows } = jid ? await q('select co, role, status, applied, removed, tl from jobs where id=$1', [jid]) : { rows: [] };
    const n = rows[0];
    return { ok: true, done: s, ...(n ? { link: `job:${jid}`, now: { company: n.co, role: n.role, status: SL[n.status], applied: d10(n.applied) || null, removed: n.removed, last_step: (n.tl || [])[0]?.slice(0, 2) } } : {}) };
  };
  switch (name) {
    case 'set_status': {
      if (!SL[x.status]) return { error: 'Bad status.' };
      const j = await getJob(user, x.job_id); jid = j.id;
      if (j.status === x.status) return { ok: true, note: `${j.co} is already ${SL[j.status]}.` };
      cs.keep(j);
      f = 'status';
      const line = x.status === 'closed' ? 'Closed' : x.status === 'saved' ? 'Saved for later' : 'Moved to ' + SL[x.status];
      await q('update jobs set status=$2, tl=$3, updated_at=now() where id=$1', [j.id, x.status, withLine(user, j, line)]);
      return say(`${j.co}: moved to ${SL[x.status]}`);
    }
    case 'add_note': {
      const note = String(x.note || '').trim(); if (!note) return { error: 'Empty note.' };
      f = 'note';
      const j = await getJob(user, x.job_id); jid = j.id; cs.keep(j);
      await q('update jobs set tl=$2, updated_at=now() where id=$1', [j.id, withLine(user, j, note)]);
      return say(`${j.co}: added "${clip(note, 60)}"`);
    }
    case 'edit_job': {
      const j = await getJob(user, x.job_id); jid = j.id;
      const co = x.company != null ? String(x.company).trim().slice(0, 80) : j.co;
      const role = x.role != null ? String(x.role).trim().slice(0, 120) : j.role;
      let applied = j.applied;
      if (x.applied_date != null) { if (!/^\d{4}-\d{2}-\d{2}$/.test(x.applied_date)) return { error: 'Use YYYY-MM-DD for the date.' }; applied = x.applied_date; }
      if (!co) return { error: 'Company is needed.' };
      cs.keep(j);
      await q('update jobs set co=$2, role=$3, applied=$4, updated_at=now() where id=$1', [j.id, co, role, applied]);
      f = co !== j.co ? 'company' : role !== j.role ? 'role' : 'applied';
      const parts = [co !== j.co && `company to ${co}`, role !== j.role && `role to ${role}`, d10(applied) !== d10(j.applied) && `applied date to ${applied}`].filter(Boolean);
      return say(`${j.co}: changed ${parts.join(', ') || 'nothing'}`);
    }
    case 'add_job': {
      const co = String(x.company || '').trim().slice(0, 80); if (!co) return { error: 'Company is needed.' };
      const status = SL[x.status] ? x.status : 'saved';
      const { rows } = await q(`insert into jobs (user_id, co, role, src, status, applied, tl) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [user.id, co, String(x.role || '').trim().slice(0, 120), clip(x.source || 'Agent', 30), status, status === 'saved' ? null : new Date().toISOString().slice(0, 10), JSON.stringify([[dayLabel(user), 'Added by the Agent']])]);
      cs.added(rows[0].id); jid = rows[0].id; f = 'added';
      return { ...(await say(`Added ${co} (${SL[status]})`)), job_id: rows[0].id };
    }
    case 'remove_job': {
      const j = await getJob(user, x.job_id); jid = j.id; cs.keep(j);
      await q('update jobs set removed=true, updated_at=now() where id=$1', [j.id]);
      return say(`Removed ${j.co}`);
    }
    case 'restore_job': {
      const j = await getJob(user, x.job_id, true); jid = j.id; if (!j.removed) return { ok: true, note: 'It is not removed.' };
      cs.keep(j);
      await q('update jobs set removed=false, updated_at=now() where id=$1', [j.id]);
      return say(`Brought back ${j.co}`);
    }
    case 'merge_jobs': {
      const a = await getJob(user, x.from_job_id), b = await getJob(user, x.into_job_id);
      cs.keep(a); cs.keep(b); jid = b.id; f = 'merged';
      await J.merge(user, a.id, b.id);
      return say(`Merged ${a.co} into ${b.co}`);
    }
    case 'set_auto_close_days': {
      const d = Math.round(+x.days); if (!(d >= 0 && d <= 365)) return { error: 'Pick 0 to 365 days.' };
      cs.settings(user.close_days); f = 'settings';
      await q('update users set close_days=$2 where id=$1', [user.id, d]); user.close_days = d;
      return say(d ? `Jobs now close after ${d} quiet days` : 'Jobs no longer close by themselves');
    }
    case 'undo': {
      const r = await undoSets(user, x.count);
      if (r.ok) cs.item('Undid: ' + r.undone.join('; '));
      return r;
    }
  }
  return { error: 'Unknown action.' };
}

// Words for the plan, before anything is done.
function describe(c, byId) {
  const x = c.input || {}, n = id => byId[id]?.co || 'a job';
  switch (c.name) {
    case 'set_status': return `Move ${n(x.job_id)} to ${SL[x.status] || x.status}`;
    case 'add_note': return `Add to ${n(x.job_id)}: "${clip(x.note, 60)}"`;
    case 'edit_job': return `Change ${n(x.job_id)}: ` + [x.company != null && `company to ${x.company}`, x.role != null && `role to ${x.role}`, x.applied_date != null && `applied date to ${x.applied_date}`].filter(Boolean).join(', ');
    case 'add_job': return `Add ${x.company}, ${x.role || 'role not named'} (${SL[x.status] || 'Saved'})`;
    case 'remove_job': return `Remove ${n(x.job_id)}`;
    case 'restore_job': return `Bring back ${n(x.job_id)}`;
    case 'merge_jobs': return `Merge ${n(x.from_job_id)} into ${n(x.into_job_id)}`;
    case 'set_auto_close_days': return x.days ? `Close jobs after ${x.days} quiet days` : 'Stop closing jobs by themselves';
    case 'undo': return `Undo my last ${x.count > 1 ? x.count + ' changes' : 'change'}`;
  }
  return c.name;
}

let client = null;

module.exports = A.handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const user = await A.requireUser(req);
  const b = await A.body(req);

  if (b.op === 'undo') {
    const r = await undoSets(user, 1, b.id);
    if (r.error) throw err(409, r.error);
    const cs = changeSet(user, 'Undo button'); cs.item('Undid: ' + r.undone.join('; ')); await cs.save();
    return res.status(200).json({ text: 'Undone.', changed: true, changes: r.jobs });
  }
  if (b.op === 'linkold') return res.status(200).json(await linkOld(user));
  if (b.op === 'log') {
    const limit = Math.min(50, Math.max(1, +b.limit || 15)), offset = Math.max(0, +b.offset || 0);
    const { rows } = await q('select id, at, label, items, ask, undone, jsonb_array_length(before) > 0 as can_undo from agent_undo where user_id=$1 order by id desc limit $2 offset $3', [user.id, limit, offset]);
    const { rows: c } = await q('select count(*)::int as n from agent_undo where user_id=$1', [user.id]);
    return res.status(200).json({ log: rows, total: c[0].n });
  }
  if (b.op === 'apply') {
    // The user said OK to a plan: do exactly those steps.
    const calls = (Array.isArray(b.calls) ? b.calls : []).slice(0, 20).filter(c => c && TOOLS.some(t => t.name === c.name) && c.input && typeof c.input === 'object');
    if (!calls.length) throw err(400, 'Nothing to do.');
    const cs = changeSet(user, b.ask);
    for (const c of calls) {
      const out = await runTool(user, c.name, c.input, cs).catch(e => ({ error: e.message }));
      if (out.error) cs.done.push(`Could not: ${describe(c, {})} (${out.error})`);
    }
    const undoId = await cs.save();
    return res.status(200).json({ text: cs.done.length ? 'Done.\n' + cs.done.join('\n') : 'Nothing changed.', changed: cs.items.length > 0, undoId, changes: cs.items });
  }

  if (!hasKey()) throw err(503, 'The AI key is not set yet.');
  const plan = b.mode === 'plan';
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: clip(m.content, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw err(400, 'Nothing to answer.');

  const [{ rows: jobs }, { rows: removed }, { rows: log }] = await Promise.all([
    q('select * from jobs where user_id=$1 and not removed order by updated_at desc, id limit 200', [user.id]),
    q('select id, co, role from jobs where user_id=$1 and removed order by updated_at desc limit 30', [user.id]),
    q(`select at, src, item_at, sender, subject, result from ai_log where user_id=$1 and (result->>'kind') is distinct from 'none' order by coalesce(item_at, at) desc limit 150`, [user.id]),
  ]);
  const byId = Object.fromEntries([...jobs, ...removed].map(j => [j.id, j]));
  const focus = Number.isInteger(+b.jobId) ? +b.jobId : null;
  const ask = msgs[msgs.length - 1].content;
  const sc = b.screen && typeof b.screen === 'object' ? b.screen : null;
  if (sc) {
    const refs = (Array.isArray(sc.refs) ? sc.refs : []).slice(0, 80).map(r => `  ${+r.n}: ${clip(r.label, 60)}`).join('\n');
    const last = msgs[msgs.length - 1];
    last.content = `<screen page="${clip(sc.view, 20)}"${sc.job ? ` job_id="${+sc.job}"` : ''}>\n${clip(sc.text, 5000)}\n<clickable>\n${refs}\n</clickable>\n</screen>\n\n${last.content}`;
  }

  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic(); }
  const system = [{ type: 'text', text: SYSTEM }, { type: 'text', text: context(user, jobs, removed, log, focus), cache_control: { type: 'ephemeral' } }];
  const cs = changeSet(user, ask);
  let text = '';
  for (let step = 0; step < 6; step++) {
    const r = await client.messages.create({ model: MODEL, max_tokens: 1500, system, tools: TOOLS, output_config: { effort: 'low' }, messages: msgs });
    text = r.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
    const calls = r.content.filter(c => c.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !calls.length) break;
    if (plan && !cs.done.length) {
      // Plan mode: show what would be done and wait for the user's OK.
      const steps = calls.map(c => describe(c, byId));
      return res.status(200).json({ text: 'Here is my plan:\n' + steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), plan: calls.map(c => ({ name: c.name, input: c.input })) });
    }
    msgs.push({ role: 'assistant', content: r.content });
    const results = [];
    for (const c of calls) {
      const out = await runTool(user, c.name, c.input || {}, cs).catch(e => ({ error: e.message }));
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) });
    }
    msgs.push({ role: 'user', content: results });
  }
  const undoId = await cs.save();
  return res.status(200).json({ text: text || (cs.done.length ? cs.done.join('\n') : 'Sorry, I could not answer that. Try asking another way.'), changed: cs.items.length > 0, undoId, changes: cs.items });
});
