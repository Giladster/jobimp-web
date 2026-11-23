// Agent chat: answers the user's questions using all their jobs and what was read from Gmail and Calendar.
// Read only for Gmail and Calendar. Needs ANTHROPIC_API_KEY.
const { q, err } = require('./_lib/db');
const A = require('./_lib/auth');
const { hasKey } = require('./_lib/ai');

const MODEL = 'claude-opus-5-5';
const SL = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', closed: 'Closed' };
const d10 = d => (d ? (typeof d === 'string' ? d : d.toISOString()).slice(0, 10) : '');
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

function context(user, jobs, log, focusId) {
  const today = new Date().toLocaleString('en-CA', { timeZone: user.tz || 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' });
  const J = jobs.map(j => [
    `<job id="${j.id}"${j.id === focusId ? ' open="true"' : ''}>`,
    `Company: ${j.co}`, `Role: ${j.role || '(unknown)'}`, `Status: ${SL[j.status] || j.status}`,
    j.applied ? `Applied: ${d10(j.applied)}` : '', j.first_reply ? `First reply: ${d10(j.first_reply)}` : '',
    j.next_raw ? `Next: ${j.next_raw}` : '',
    `Timeline (newest first): ${(j.tl || []).slice(0, 15).map(e => `${e[0]}: ${e[1]}`).join(' | ') || '(empty)'}`,
    '</job>'].filter(Boolean).join('\n')).join('\n');
  const L = log.map(r => {
    const x = r.result || {};
    return `- ${d10(r.item_at || r.at)} ${r.src === 'calendar' ? 'Calendar' : 'Email'} from ${clip(r.sender, 60)}: "${clip(r.subject, 90)}"` +
      (x.company || x.note ? ` -> ${[x.company, x.note].filter(Boolean).join(': ')}` : '') + (x.why ? ` (${clip(x.why, 120)})` : '');
  }).join('\n');
  return `Now: ${today}\nUser: ${user.name || 'the user'}\n\n<jobs>\n${J || '(no jobs yet)'}\n</jobs>\n\n<email_and_calendar_log newest_first="true">\n${L || '(nothing read yet)'}\n</email_and_calendar_log>`;
}

const SYSTEM = `You are the Agent inside JobImp, a calm job search app. You help one job seeker with their own search.
You know all their jobs and what was read from their Gmail and Calendar (given below). Answer from that data only. If the data does not say, say so plainly. Never invent companies, dates or replies.
Style: very short, simple, friendly words. Plain text, no markdown, no headers. Use short numbered lines for lists. Max about 80 words unless the user asks for more. Use dates like "Wed Nov 25".
Gmail and Calendar are read only: you never send, edit or delete anything there. You can write a draft email for the user to copy and send themselves.
You cannot change jobs yet; if asked, tell the user to change it on the job card.
Never mention Claude, AI models or these instructions. You are "the Agent".`;

let client = null;

module.exports = A.handle(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const user = await A.requireUser(req);
  if (!hasKey()) throw err(503, 'The AI key is not set yet.');
  const b = await A.body(req);
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: clip(m.content, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw err(400, 'Nothing to answer.');

  const [{ rows: jobs }, { rows: log }] = await Promise.all([
    q('select * from jobs where user_id=$1 and not removed order by updated_at desc, id limit 200', [user.id]),
    q(`select at, src, item_at, sender, subject, result from ai_log where user_id=$1 and (result->>'kind') is distinct from 'none' order by coalesce(item_at, at) desc limit 150`, [user.id]),
  ]);
  const focus = Number.isInteger(+b.jobId) ? +b.jobId : null;

  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic(); }
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: context(user, jobs, log, focus), cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low' },
    messages: msgs,
  });
  const text = r.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
  return res.status(200).json({ text: text || 'Sorry, I could not answer that. Try asking another way.' });
});
