// Reads job emails and calendar events and says what happened (applied, interview, rejected...).
// Uses Claude when ANTHROPIC_API_KEY is set, otherwise simple keyword rules.
const { z } = require('zod');

const MODEL = 'claude-opus-5-5';
const KINDS = ['applied', 'invited', 'scheduled', 'assignment', 'rejected', 'offer', 'update', 'none'];

const Result = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    job_related: z.boolean(),
    company: z.string(),
    role: z.string(),
    kind: z.enum(KINDS),
    interview_at: z.string().nullable(),
    note: z.string(),
  })),
});

const SYSTEM = `You read emails and calendar events of one job seeker and find updates about their own job applications.
For each item return:
- job_related: true only if it is about one of the user's own applications or hiring processes (confirmation, recruiter reply, interview, home assignment, rejection, offer). Job alert digests, newsletters, ads, courses and general networking are false.
- company: the hiring company's short name (not the job board or applicant system, e.g. not "Comeet", "Greenhouse", "LinkedIn"). If it matches a known company from the list, use exactly that name. Empty if unknown.
- role: the job title if stated, else "".
- kind: applied (application received or sent) | invited (asked to interview or to book a time) | scheduled (an interview with a set time) | assignment (home task) | rejected | offer | update (other real progress) | none.
- interview_at: the interview start as local time "YYYY-MM-DDTHH:MM" if the item states a specific date and time, else null.
- note: what happened, in English, 2 to 6 words, starting with a capital letter, e.g. "Invited to interview", "Rejected by email", "Home assignment", "Applied", "Interview set". No company name.
Return one entry per input item, with the same i.`;

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + ' …' : s; }

function render(items, known) {
  return `Known companies: ${known.length ? known.join(', ') : '(none yet)'}\n\n` + items.map(x =>
    x.type === 'calendar'
      ? `<item i="${x.i}" type="calendar event">\nTitle: ${x.subject}\nStarts (local): ${x.start}\nOrganizer: ${x.from}\nDescription: ${clip(x.text, 1500)}\n</item>`
      : `<item i="${x.i}" type="email">\nDate: ${x.date}\nFrom: ${x.from}\nSubject: ${x.subject}\nBody:\n${clip(x.text, 3000)}\n</item>`
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

// Fallback rules when there is no AI key.
const PLATFORMS = /comeet|greenhouse|lever|workday|ashby|smartrecruiters|bamboohr|linkedin|indeed|drushim|alljobs|gmail|google|notifications?|no-?reply|careers?|jobs|talent|recruiting|hr/i;
function companyFrom(x) {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(x.from); let name = m ? m[1] : '';
  name = name.replace(/\b(via|from|at|team|careers?|recruiting|talent( acquisition)?|hr|jobs|hiring)\b.*$/i, '').trim();
  if (name && !PLATFORMS.test(name)) return name;
  const dom = /@([\w-]+)\./.exec(x.from); if (dom && !PLATFORMS.test(dom[1])) return dom[1][0].toUpperCase() + dom[1].slice(1);
  const s = /\b(?:at|to|with|from)\s+([A-Z][\w.&-]+(?:\s[A-Z][\w&-]+)?)/.exec(x.subject); return s ? s[1] : '';
}
function withRules(items) {
  return items.map(x => {
    const t = (x.subject + '\n' + x.text).toLowerCase();
    let kind = 'none', note = '';
    if (x.type === 'calendar') { kind = /interview|ראיון|screen|hr call|recruit/.test(t) ? 'scheduled' : 'none'; note = 'Interview set'; }
    else if (/unfortunately|not (to )?move forward|other candidates|decided not to|לצערנו|not be moving/.test(t)) { kind = 'rejected'; note = 'Rejected by email'; }
    else if (/offer letter|pleased to offer|job offer/.test(t)) { kind = 'offer'; note = 'Got an offer'; }
    else if (/home (assignment|task)|take[- ]home|assignment|מטלה/.test(t)) { kind = 'assignment'; note = 'Home assignment'; }
    else if (/interview|ראיון|schedule a (call|time)|book a time/.test(t)) { kind = 'invited'; note = 'Invited to interview'; }
    else if (/thank you for (applying|your application)|application (was )?(received|sent|submitted)|we received your application|קיבלנו את/.test(t)) { kind = 'applied'; note = 'Applied'; }
    const company = companyFrom(x);
    return { i: x.i, job_related: kind !== 'none' && !!company, company, role: '', kind, interview_at: x.type === 'calendar' ? x.start : null, note };
  });
}

async function classify(items, known) {
  if (!items.length) return [];
  const out = process.env.ANTHROPIC_API_KEY ? await withClaude(items, known) : withRules(items);
  const byI = new Map(out.map(o => [o.i, o]));
  return items.map(x => ({ ...x, ...(byI.get(x.i) || { job_related: false }) }));
}

module.exports = { classify, KINDS };
