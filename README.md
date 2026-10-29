# FitnessAI

A phone app for a personal trainer: client profiles, 30-minute circuit sessions (2 circuits × 4 exercises, each done twice), on-the-go modifications that are remembered, session packages (purchased / done / pending), progress toward objectives, next-week plans, and a shared calendar where every booking change is handled the moment it happens.

```
fitnessai/
├── api/   Python backend (FastAPI + SQLModel). All the logic lives here.
├── web/   Installable phone app (React PWA). Runs as an offline demo when no API is set.
└── docs/  EVENTS.md — every event and what the app does for it
```

## Tech stack

| Layer | Choice |
|---|---|
| API | FastAPI + Pydantic (Python 3.12+) |
| Logic | `api/app/engine/`: session generator, next-week planner, scheduler, event handlers, session balance |
| Database | **Neon Postgres** from Vercel's Storage tab (same as Lost_Found); SQLite locally |
| Sign-in | Codes: the trainer has `TRAINER_CODE`; each client has their own code (first name, lowercase, by default) |
| Scheduling | Event-driven (see `docs/EVENTS.md`). No cron: **Plan & remind now** plans and sends reminders when tapped |
| Notifications | Web Push (optional); otherwise clients see updates in the app |
| Hosting | Vercel: one project for `web/`, one for `api/` |
| Tests | `pytest` (26: engine, API, events, sign-in; run against SQLite and Postgres), Vitest (web) |

Not included yet, by choice: text messages and in-app payments.

## Run locally

```bash
# 1. API (http://localhost:8000, docs at /docs) — SQLite, sample data, trainer code "coach"
cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
pytest

# 2. App (http://localhost:5173) in another terminal
cd web
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Sign in with **coach** (trainer) or a client's first name (**priya**, **daniel**, **marcus**, **elena**, **leo**, **sam**). Without `VITE_API_URL`, `npm run dev` runs the offline demo with the same screens.

## Deploy to Vercel

Two Vercel projects from this one repo, the same way Lost_Found is set up.

### 1. API project
1. Vercel → **Add New → Project** → import `RoboAIBuilder/FitnessAI`. Name it e.g. `fitnessai-api`.
2. **Root Directory:** `api`. Vercel recognises FastAPI (`pyproject.toml` points it to `app.main:app`). No build command.
3. Deploy once. Then **Storage → Create → Neon (Postgres)** and connect it to this project. It sets `DATABASE_URL`.
4. **Settings → Environment Variables:**
   - `TRAINER_CODE`: the trainer's sign-in code
   - `CORS_ORIGINS`: the web app's address (from step 2 below), e.g. `https://fitnessai-web.vercel.app`
   - optional `CORS_ORIGIN_REGEX`: `https://fitnessai-web-.*\.vercel\.app` to allow preview deployments
   - `SEED_DEMO`: `1` to start with the sample clients, `0` to start empty
   - optional: `SECRET_KEY`, `TRAINER_TZ` (default `America/New_York`), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` for notifications
5. Redeploy. Open `https://<api>/api/health`: it should say `"ok": true` with `"database": "postgres"`, or list what's still missing.

Tables are created on first request. For later schema changes, run `alembic upgrade head` with `DATABASE_URL` set to the Neon URL.

### 2. Web project
1. **Add New → Project** → the same repo. Name it e.g. `fitnessai-web`.
2. **Root Directory:** `web`. Framework: Vite (build `npm run build`, output `dist`, from `web/vercel.json`).
3. **Environment Variable:** `VITE_API_URL` = the API project's address, e.g. `https://fitnessai-api.vercel.app`.
4. Deploy. Put this address into the API's `CORS_ORIGINS` and redeploy the API.

Cost: a demo fits Vercel's and Neon's free plans. Vercel describes Hobby as for personal projects; check whether a paid plan applies once real clients use it.

## API overview

All writes return the caller's fresh state. Interactive docs at `/docs`. Events are listed in `docs/EVENTS.md`.

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | Sign in with a code → session token |
| GET | `/api/state` | both | Trainer: everything. Client: only their own data + open times |
| GET | `/api/health` | anyone | Setup check |
| PUT | `/api/clients/{id}` | trainer | Create/update a client (incl. sign-in code) |
| POST/DELETE | `/api/clients/{id}/mods[/{exerciseId}]` | trainer | Save/remove a remembered modification |
| POST/DELETE | `/api/clients/{id}/packages[/{packageId}]` | trainer | Add (renewal event) / remove purchased sessions |
| POST | `/api/programs/generate`, PUT `/api/programs/{clientId}` | trainer | Draft / save circuits |
| POST | `/api/sessions` | trainer | Log a finished session (low-balance event) |
| POST | `/api/clients/{id}/plan`, `/plan/approve` | trainer | Build / approve next week's plan |
| POST | `/api/schedule/run` | trainer | Plan & remind now |
| POST | `/api/clients/{id}/book` | both | Book / accept an offer / change a confirmed session |
| POST | `/api/clients/{id}/usual-slot` | both | Make a time the client's usual slot |
| POST | `/api/bookings/{id}/decline`, `/cancel` | both | Decline (new times offered) / cancel (waitlist offered) |
| POST | `/api/bookings/{id}/offer`, `/skip`, `/missed` | trainer | Handle requests |
| POST/DELETE | `/api/busy[/{id}]` | trainer | Block / unblock time (affected clients moved) |
| PUT | `/api/availability`, `/api/settings` | trainer | Weekly hours (affected clients moved), booking rules |
