# JobImp web

JobImp, a proactive job-search agent. Static front end (`index.html` + `app.js`) and Vercel functions in `api/`.

- `api/login.js` sign in / out (session cookie)
- `api/jobs.js` the signed-in user's jobs: list, save changes, first import from Gmail
- `api/google.js` Google sign-in (Gmail + Calendar, read only)
- `api/gmail-push.js` Google Pub/Sub calls it the moment a new email arrives
- `api/calendar-push.js` Google Calendar calls it when an event changes
- `api/cron.js` daily: renews the Gmail/Calendar watch and catches up
- `api/_lib/` database (Neon Postgres), auth, Google, AI reading, sync logic

Gmail and Calendar are strictly read only: the code only allows GET calls plus the "watch" calls that ask Google for notifications.
Settings: see `.env.example`.
