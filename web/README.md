# FitnessAI · web app

The phone app. Connected to the Python API (`../api`) when `VITE_API_URL` is set; otherwise it runs as a self-contained offline demo. See the root README for setup.

A mobile-first, installable web app (PWA) for a personal trainer who runs 30-minute circuit sessions:
two circuits of four exercises, each done twice, mixing cardio and functional strength with few machines.

## What it does

| Area | Screens |
|---|---|
| Today | Today's sessions, coach insights (stalled lifts, missed sessions, scheduling decisions), resume a running session |
| Live session | Circuit runner: 4 sets (A, A, B, B), set timer, load/reps steppers, **Modify** sheet (swap, easier, lighter, shorter, skip + reason) with **Remember for next time** |
| Clients | Profile (height, weight, frequency, objectives, limits), **sessions purchased / done / pending** with purchase history and low-balance alerts, saved modifications, scheduling preferences, history (4-week attendance grid, set times, loads), progress charts, next-week plan |
| Programs | AI session builder (format, goal, cardio/strength mix, equipment, client limits and saved mods applied), tap-to-swap, 38-move library |
| Next week | Rule engine: stalled lift → tempo variant at −10%, manageable load → +1 step, poor attendance → hold loads, endurance goal behind → rope sprints + tempo run, travel → sessions dropped. Approve & send |
| Schedule | Shared calendar of open times around synced busy blocks (other jobs), auto-plan N days ahead from each client's usual slot, invites, reminders, alternatives on conflicts, waitlist for freed slots |
| Client replies | Conversation per client; only the cases the app can't decide land in "Needs you" |
| Client view | `#/book/<clientId>` — what a client sees: offered times, open slots, make-it-my-usual-time, note to coach, turn on app notifications (install instructions for iPhone/Android) |

## Run

```bash
npm install
npm run dev          # local dev server
npm test             # engine tests (generator, planner, scheduler)
npm run build        # installable PWA in dist/ (manifest + service worker)
npm run build:demo   # single-file demo in dist-demo/index.html
```

## Code map

- `src/engine/generator.ts` — circuit generator (constraints, saved mods, equipment, objective lifts)
- `src/engine/planner.ts` — stall/progress detection, objective projections, next-week plan
- `src/engine/scheduler.ts` — open slots, auto-plan, accept/decline, waitlist, reminders
- `src/lib/balance.ts` — session package balance (purchased − done = pending; missed sessions don't count)
- `src/data/exercises.ts` — exercise library (type, pattern, equipment, joints to avoid, tempo variants)
- `src/data/seed.ts` — demo clients with four weeks of history, built with the real engines
- `src/store.ts` — app state (zustand, persisted on the device)
- `src/pages/*` — screens

## Connected mode

- `src/api.ts` — API client, code sign-in, Web Push subscription
- `src/apiActions.ts` — replaces on-device actions with API calls when `VITE_API_URL` is set
- `src/engine/events.ts` — the same event rules as the API, for the offline demo
- `public/push-sw.js` — shows notifications pushed by the API

## Offline demo vs connected

Without `VITE_API_URL` the app is a self-contained demo: data stays on one device and the same event rules run in the browser. With it, everything is stored in the Python API (Neon Postgres on Vercel) and shared between the trainer and clients. See the root README for deployment.

Possible next steps: Google Calendar sync for the trainer's other jobs (busy times), and AI-written session notes and plan explanations behind the same generator/planner functions.
