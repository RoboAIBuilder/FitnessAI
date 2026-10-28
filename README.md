# FitnessAI

A phone app for a personal trainer: client profiles, 30-minute circuit sessions (2 circuits × 4 exercises, each done twice), on-the-go modifications that are remembered, session packages (purchased / done / pending), progress toward objectives, next-week plans, and a shared calendar with automatic invites, reminders and a waitlist.

```
fitnessai/
├── api/   Python backend: FastAPI + SQLModel + Postgres. All the logic lives here.
└── web/   Installable phone app (React PWA). Screens only when connected to the API;
           runs fully offline as a demo when no API is configured.
```

## Tech stack

| Layer | Choice |
|---|---|
| API | FastAPI + Pydantic (Python 3.11+) |
| Logic | `api/app/engine/`: session generator, next-week planner, scheduler, session balance |
| Database | Postgres (Supabase) in production, SQLite locally; SQLModel tables, Alembic migrations |
| Sign-in | Supabase Auth (email code); the API verifies the token and limits clients to their own data |
| Scheduled jobs | `python -m app.jobs` hourly (Render Cron): invites, reminders, notifications |
| Notifications | Web Push via `pywebpush`; clients without notifications see updates in the app |
| App | React + TypeScript PWA (Vite), hosted on Vercel |
| Tests | `pytest` (API + engine, including a parity test against the original TypeScript generator), Vitest (web) |

Not included yet, by choice: text messages and in-app payments.

## Run locally

```bash
# 1. API (http://localhost:8000, docs at /docs)
cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload        # creates fitnessai.db with the sample trainer and clients
pytest                               # 18 tests

# 2. App (http://localhost:5173) in another terminal
cd web
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Local mode needs no sign-in: the app acts as the trainer. To see a client's own view, run this in the browser console and reload: `localStorage.setItem('fitnessai.devClient', 'c-leo')` (remove it to go back).

Without `VITE_API_URL`, `npm run dev` runs the offline demo with the same screens.

## Deploy

1. **Supabase**: create a project. Copy the Postgres connection string, the JWT secret, the project URL and the anon key. Turn on Email sign-in (codes).
2. **API on Render**: "New → Blueprint" from this repo uses `render.yaml` (API + hourly job). Set `DATABASE_URL` (`postgresql+psycopg://…`), `SUPABASE_JWT_SECRET`, `CORS_ORIGINS` (the Vercel URL), and the VAPID keys from `python -m app.notify --generate-keys`. Migrations run on each deploy.
3. **App on Vercel**: root directory `web`, build `npm run build`, output `dist`. Environment: `VITE_API_URL` (the Render URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. **Link accounts**: set the trainer's Supabase user id in `trainer.auth_user_id` (one SQL update). Clients sign in with the email saved on their profile; the API links them on first sign-in.

## API overview

All writes return the caller's fresh state. Interactive docs at `/docs`.

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/state` | both | Trainer: everything. Client: only their own data + open times |
| PUT | `/api/clients/{id}` | trainer | Create/update a client |
| POST/DELETE | `/api/clients/{id}/mods[/{exerciseId}]` | trainer | Save/remove a remembered modification |
| POST/DELETE | `/api/clients/{id}/packages[/{packageId}]` | trainer | Add/remove purchased sessions |
| POST | `/api/clients/{id}/measurements` | trainer | Log a weight/time measurement |
| POST | `/api/programs/generate` | trainer | Draft circuits (limits, saved mods, equipment applied) |
| PUT | `/api/programs/{clientId}` | trainer | Save a program |
| POST | `/api/sessions` | trainer | Log a finished session |
| POST | `/api/clients/{id}/plan`, `/plan/approve` | trainer | Build / approve next week's plan |
| POST | `/api/schedule/run` | trainer | Plan the next days, send invites and reminders now |
| POST | `/api/clients/{id}/book` | both | Book an open time / accept an offer |
| POST | `/api/bookings/{id}/decline` | both | Decline; the app offers the next open times |
| POST | `/api/bookings/{id}/offer`, `/skip`, `/cancel` | trainer | Handle requests; cancelled slots go to the waitlist |
| POST | `/api/clients/{id}/push` | both | Turn app notifications on/off (stores the device subscription) |
| PUT | `/api/settings`, `/api/availability` | trainer | Hours, booking rules, automation switches |
