// Database (Neon Postgres). DATABASE_URL comes from the Vercel + Neon connection.
require('./env');
require('pg').types.setTypeParser(1082, v => v); // dates stay 'YYYY-MM-DD'
const { Pool } = require('pg');

let pool = null, ready = null;

function err(status, message) { return Object.assign(new Error(message), { status }); }

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw err(503, 'The database is not connected yet.');
  if (!pool) pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000 });
  return pool;
}

const SCHEMA = `
create table if not exists users (
  id text primary key,
  name text not null default '',
  google_sub text unique,
  google_email text,
  refresh_enc text,
  tz text not null default 'Asia/Jerusalem',
  synced_from date,
  import_state jsonb,
  gmail_history text,
  gmail_watch_exp bigint,
  cal_checked timestamptz,
  cal_channel text,
  cal_resource text,
  cal_exp bigint,
  push_base text,
  last_sync timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_google_email on users (lower(google_email));
create table if not exists jobs (
  id serial primary key,
  user_id text not null references users(id) on delete cascade,
  co text not null,
  role text not null default '',
  src text not null default 'Email',
  status text not null,
  applied date,
  first_reply date,
  next_raw text,
  tl jsonb not null default '[]',
  removed boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists jobs_user on jobs (user_id);
create table if not exists seen (
  user_id text not null references users(id) on delete cascade,
  src text not null,
  ext_id text not null,
  at timestamptz not null default now(),
  primary key (user_id, src, ext_id)
);
alter table users add column if not exists close_days int not null default 16;
alter table users add column if not exists watch_v int not null default 1;
create table if not exists ai_log (
  id serial primary key,
  user_id text not null references users(id) on delete cascade,
  at timestamptz not null default now(),
  src text not null,
  item_at timestamptz,
  sender text,
  subject text,
  result jsonb
);
create index if not exists ai_log_user on ai_log (user_id, id desc);
create table if not exists agent_undo (
  id serial primary key,
  user_id text not null references users(id) on delete cascade,
  at timestamptz not null default now(),
  label text not null,
  before jsonb not null,
  undone boolean not null default false
);
create index if not exists agent_undo_user on agent_undo (user_id, id desc);
alter table agent_undo add column if not exists items jsonb;
alter table agent_undo add column if not exists ask text;
create table if not exists jobs_backup (
  id serial primary key,
  user_id text not null references users(id) on delete cascade,
  at timestamptz not null default now(),
  data jsonb not null
);`;

async function q(text, params) {
  const p = getPool();
  if (!ready) ready = p.query(SCHEMA).catch(e => { ready = null; throw e; });
  await ready;
  return p.query(text, params);
}

module.exports = { q, err };
