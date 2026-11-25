// Orders a job's steps: Claude reads all of one job's emails and invites together (read only)
// and says which step each item is part of, and the day that step really happened
// (the meeting day, not the day the invite was sent). Steps you added or edited yourself are never changed.
const { z } = require('zod');
const { q } = require('./db');
const { getMessage, gapi, CAL } = require('./google');
const { hasKey, STEPS, MODEL } = require('./ai');
const { labelDate } = require('./sync');

const Out = z.object({ items: z.array(z.object({ i: z.number().int(), step: z.enum(STEPS), day: z.string() })) });

const SYSTEM = `You get everything known about one person's hiring process with one company: emails, calendar invites and notes, oldest first.
Work out the real story of the process, then for each item return:
- step: which stage this item is part of. applied (the application) | hr (a call or interview with a recruiter, HR or talent person, or a first intro call with them) | test (home assignment, technical or coding test, exercise, case study, including the user sending it back) | manager (an interview with the hiring manager, team lead, team members, peers, founders or executives, a meeting to present the user's assignment, or any later interview round) | references (reference checks) | offer (an offer or salary talk) | none (reminders, plain confirmations, follow-ups, rejections, notes, and anything else that is not a stage itself).
  The same meeting often shows up several times (invite, calendar event, confirmation, reschedule). Give all of them the same step. A reschedule or a "set" notice belongs to the step of its meeting.
- day: "YYYY-MM-DD", the day this step really happened. For a meeting, the day the meeting took place (after any reschedule), not the day the email was sent. For anything else, the item's own date.
Return one entry per item, with the same i.`;

let client = null;
async function askClaude(text) {
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic(); }
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const r = await client.messages.parse({
    model: MODEL, max_tokens: 4000, system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Out) },
    messages: [{ role: 'user', content: text }],
  });
  return r.stop_reason === 'refusal' || !r.parsed_output ? null : r.parsed_output.items;
}

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + ' …' : s; };
const iso = t => new Date(t).toISOString().slice(0, 10);
// Lines the app writes itself ("Closed: no news…", "Moved to … by you"): context only.
const APP_LINE = /^(Moved to |Closed|Saved for later|Added |Role changed|Company changed)/;
const fixed = m => !!m && (m.s === 'you' || m.s === 'agent' || !!m.u);

async function readItem(user, m) {
  try {
    if (m.s === 'gmail' && m.id) {
      const e = await getMessage(user, m.id);
      return `From: ${e.from}\nTo: ${e.to}\nSubject: ${e.subject}\nSent: ${e.at.toISOString()}\nBody: ${clip(e.text, 1200)}`;
    }
    if (m.s === 'calendar' && m.id) {
      const eid = String(m.id).split('@')[0];
      const e = await gapi(user, `${CAL}/calendars/primary/events/${encodeURIComponent(eid)}`);
      return `Calendar event: ${e.summary || ''}\nStarts: ${e.start?.dateTime || e.start?.date || ''}\nStatus: ${e.status || ''}\nOrganizer: ${e.organizer?.email || ''}\nDescription: ${clip(String(e.description || '').replace(/<[^>]+>/g, ' '), 600)}`;
    }
  } catch (e) { if (e.status === 429) throw e; }
  return '';
}

async function orderJob(user, j) {
  const now = new Date(), tl = Array.isArray(j.tl) ? j.tl : [];
  const list = tl.map((t, k) => ({ t, k, d: labelDate(t[0], now) })).filter(x => x.d).sort((a, b) => a.d - b.d || b.k - a.k);
  const todo = list.filter(x => !fixed(x.t[2]) && !APP_LINE.test(String(x.t[1])));
  if (todo.length) {
    const seen = new Map();
    const blocks = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i], m = x.t[2] || {};
      let body = '';
      if (!fixed(m) && m.id) { if (!seen.has(m.id)) seen.set(m.id, await readItem(user, m)); body = seen.get(m.id); }
      const who = m.s === 'you' ? ' (added by the user, step ' + (m.t || '?') + ')' : m.s === 'agent' ? ' (a note)' : '';
      blocks.push(`<item i="${i}" date="${iso(x.d)}">\nTimeline line: ${x.t[1]}${who}${body ? '\n' + body : ''}\n</item>`);
    }
    const out = await askClaude(`Company: ${j.co}\nRole: ${j.role}\n\n${blocks.join('\n\n')}`);
    if (!out) return false;
    const byI = new Map(out.map(o => [o.i, o]));
    list.forEach((x, i) => {
      const o = byI.get(i);
      if (!o || fixed(x.t[2]) || APP_LINE.test(String(x.t[1]))) return;
      const m = x.t[2] || (x.t[2] = { s: '', id: '' });
      m.t = o.step === 'none' ? '-' : o.step;
      if (/^\d{4}-\d{2}-\d{2}$/.test(o.day)) m.d = o.day; else delete m.d;
    });
  }
  // Only save if nothing changed the job meanwhile; otherwise it is done again later.
  const { rowCount } = await q(`update jobs set tl=$3, steps_at=now(), updated_at=now() where id=$1 and user_id=$2 and updated_at::text=$4`, [j.id, user.id, JSON.stringify(tl), j.uat]);
  return rowCount > 0;
}

// One job per call (each takes a few seconds). Returns how many are left.
async function orderNext(user) {
  if (!hasKey() || !user.refresh_enc) return { left: 0 };
  const { rows } = await q(`select *, updated_at::text as uat from jobs where user_id=$1 and not removed and steps_at is null order by updated_at desc limit 1`, [user.id]);
  if (rows[0]) await orderJob(user, rows[0]);
  return { left: await stepsLeft(user), job: rows[0]?.id };
}
async function stepsLeft(user) {
  if (!hasKey() || !user.refresh_enc) return 0;
  const { rows } = await q(`select count(*)::int as n from jobs where user_id=$1 and not removed and steps_at is null`, [user.id]);
  return rows[0].n;
}

module.exports = { orderNext, orderJob, stepsLeft };
