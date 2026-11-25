// Reads job emails and calendar events and says what happened (applied, interview, rejected...).
// Needs ANTHROPIC_API_KEY. Without it nothing is read (simple word rules made wrong jobs from recruiter names).
const { z } = require('zod');

const MODEL = 'claude-opus-5-5';
const KINDS = ['applied', 'invited', 'scheduled', 'assignment', 'rejected', 'offer', 'update', 'submitted', 'followup', 'replied', 'none'];
const STEPS = ['applied', 'hr', 'test', 'manager', 'references', 'offer', 'none'];

const Result = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    job_related: z.boolean(),
    company: z.string(),
    role: z.string(),
    kind: z.enum(KINDS),
    step: z.enum(STEPS),
    interview_at: z.string().nullable(),
    note: z.string(),
    why: z.string(),
  })),
});

const SYSTEM = `You read emails and calendar events of one job seeker and find updates about their own job applications.
For each item return:
- job_related: true only if it is about one of the user's own applications or hiring processes (confirmation, recruiter reply, interview, home assignment, rejection, offer). Job alert digests, newsletters, ads, courses and general networking are false.
- company: the hiring company's short name. Work it out from the sender's email domain (e.g. shiraba@monday.com -> monday.com), the signature, the subject and the body. A recruiter's or interviewer's personal name is NEVER the company. Not the job board or applicant system either (not "Comeet", "Greenhouse", "LinkedIn", "Gmail"). If it matches a known company from the list, use exactly that name (e.g. "monday" or "Monday recruiting" -> "Monday.com" when that is on the list). Empty if you cannot tell.
- role: the job title if stated, else "".
- kind: applied (application received or sent) | invited (asked to interview or to book a time) | scheduled (an interview with a set time) | assignment (home task) | rejected | offer | update (other real progress) | none.
  For items marked "sent by the user" (emails the user wrote): applied (the user applied by email) | submitted (the user sent a home assignment or requested files) | followup (the user followed up or asked about the process) | replied (the user answered the company, e.g. confirmed a time) | none. The company is the one the user wrote to.
- step: which stage of the hiring process this item is part of. applied (the application) | hr (a call or interview with a recruiter, HR or talent person, or a first intro call) | test (home assignment, technical or coding test, exercise, case study, presenting an assignment, including the user sending it back) | manager (an interview with the hiring manager, team lead, team members, founders or executives, or any later interview round) | references (reference checks) | offer (an offer or salary talk) | none (reminders, reschedules, cancellations, plain confirmations, follow-ups, rejections, and anything else that is not a stage itself).
- interview_at: the interview start as local time "YYYY-MM-DDTHH:MM" if the item states a specific date and time, else null.
- note: what happened, in English, 2 to 6 words, starting with a capital letter, e.g. "Invited to interview", "Rejected by email", "Home assignment", "Applied", "Interview set". For sent emails start with "You", e.g. "You sent the home assignment", "You followed up", "You confirmed the time". No company name.
- why: one short, plain sentence a non-technical user understands, naming the clue you used. E.g. "The invite came from scaleops.com and sets an interview time." or "A Google Docs share request, not about a job." No jargon. Never mention Claude, AI or yourself.
Return one entry per input item, with the same i.`;

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …' : s; }

function render(items, known) {
  return `Known companies: ${known.length ? known.join(', ') : '(none yet)'}\n\n` + items.map(x =>
    x.type === 'calendar'
      ? `<item i="${x.i}" type="calendar event">\nTitle: ${x.subject}\nStarts (local): ${x.start}\nOrganizer: ${x.from}\nDescription: ${clip(x.text, 1500)}\n</item>`
      : `<item i="${x.i}" type="${x.sent ? 'email sent by the user' : 'email'}">\nDate: ${x.date}\nFrom: ${x.from}\nTo: ${x.to || ''}\nSubject: ${x.subject}${x.files ? `\nAttachments: ${x.files}` : ''}\nBody:\n${clip(x.text, 3000)}\n</item>`
  ).join('\n\n');
}

let client = null;
async function withClaude(items, known) {
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic(); }
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const r = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Result) },
    messages: [{ role: 'user', content: render(items, known) }],
  });
  if (r.stop_reason === 'refusal' || !r.parsed_output) return items.map(x => ({ i: x.i, job_related: false }));
  return r.parsed_output.items;
}

const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

async function classify(items, known) {
  if (!items.length) return [];
  if (!hasKey()) throw Object.assign(new Error('The AI key is not set yet.'), { status: 503 });
  const out = await withClaude(items, known);
  const byI = new Map(out.map(o => [o.i, o]));
  return items.map(x => ({ ...x, ...(byI.get(x.i) || { job_related: false }) }));
}

module.exports = { classify, hasKey, KINDS, STEPS };
