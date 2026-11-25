// Clean settings pasted into Vercel: copying can add invisible characters (spaces, line breaks, zero-width marks).
const INVISIBLE = /[\s\u00A0\u200B-\u200D\u2028\u2029\u2060\uFEFF]+/g;
const EDGES = /^[\s\u00A0\u200B-\u200D\u2028\u2029\u2060\uFEFF]+|[\s\u00A0\u200B-\u200D\u2028\u2029\u2060\uFEFF]+$/g;
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_PUBSUB_TOPIC', 'CRON_SECRET', 'ANTHROPIC_API_KEY', 'DATABASE_URL']) {
  if (process.env[k]) process.env[k] = process.env[k].replace(INVISIBLE, '');
}
for (const k of ['JOBIMP_GILAD_PASSWORD', 'JOBIMP_GILAD_DATA']) {
  if (process.env[k]) process.env[k] = process.env[k].replace(EDGES, '');
}
