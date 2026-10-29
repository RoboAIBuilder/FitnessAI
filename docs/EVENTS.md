# FitnessAI events

FitnessAI is event-driven: every change is handled in the request that makes it, and the affected people are told right away. Nothing runs on a timer.

The one batch action is **Plan & remind now** on the Schedule screen: the trainer taps it when he knows his next few days.

"Notify" means an app notification for clients who turned notifications on, otherwise a message they see when they open the app. Client messages also appear in the trainer's **Client replies** screen.

Code: `api/app/engine/events.py` (handlers), `api/app/engine/scheduler.py` (open times, offers, waitlist), `api/app/main.py` (endpoints).

## Scheduling: client actions

| Event | What FitnessAI does |
|---|---|
| **Client books an open time** | Confirms it, confirms back to the client, and updates the trainer's calendar. If the client has no unbooked sessions left, the booking is held as **Needs you** ("No sessions left · renew to confirm") and the client is told the coach will confirm after renewal. |
| **Client accepts an offered time** | Confirms that booking; the other offered times are released. |
| **Client says "none of these work"** (adds a note) | Offers the next two open times. If there are none, or "Ask me before confirming" is on, flags **Needs you**. |
| **Client changes a confirmed session** (more than the notice window ahead, 12 h by default) | Moves the booking, frees the old time, and offers the old time to the first waitlist client. |
| **Client tries to change inside the notice window** | Refused: "Message your coach to change it." Their note goes to the trainer. |
| **Client cancels** | Cancels, tells the trainer, and offers the time to the waitlist. Inside the notice window it is recorded as a **late cancel**. Missed or cancelled sessions don't use up a purchased session. |
| **Client makes a time their usual slot** | Saves it. The next **Plan & remind now** invites them for that time. |
| **Client sends a note** | Appears in the trainer's Client replies. |
| **Client turns notifications on/off** | Saves the device subscription. Future messages go as notifications, or in-app only. |

## Scheduling: trainer actions

| Event | What FitnessAI does |
|---|---|
| **Trainer blocks time** (Schedule → Block time) | The time is hidden from clients. Every client already booked in that time is moved right away: offered the two nearest open times ("Sorry, your coach can't make Tue 5:30 PM anymore…"). If there's no open time nearby, the session is flagged **Needs you** and the client is told a new time is coming. The sheet shows who is affected before he confirms. |
| **Trainer removes a block** | The time opens up again, and the first open slot in it is offered to the waitlist. |
| **Trainer changes weekly hours** | Same as blocking: sessions that now fall outside his hours are moved right away. |
| **Trainer offers a time** (for a Needs-you request) | Sends the time; the client taps to confirm. |
| **Trainer offers an open slot to a client** | Sends it; first tap books it. |
| **Trainer skips a session** (e.g. client travelling) | Cancels and tells the client. |
| **Trainer cancels a session** | Cancels, tells the client, offers the time to the waitlist. |
| **Plan & remind now** (tap) | For the next N days (3 by default): standing clients are auto-confirmed at their usual time; others are invited; clashes get the two nearest open times; impossible ones are flagged **Needs you**. Then sends one reminder for each confirmed session in the next 12 hours (each session is reminded once). |

## Sessions and packages

| Event | What FitnessAI does |
|---|---|
| **Session logged** | Counts as done; pending = purchased − done. Lift goals pick up the new weight. If the client is down to 2, 1 or 0 sessions (or owes), they're notified. |
| **Session marked missed** | Logged as missed; doesn't use up a session. |
| **Trainer adds sessions** (renewal) | Bookings that were held for "No sessions left" are confirmed, oldest first, and the client is told. |
| **On-the-go modification saved** ("Remember for next time") | Stored on the client and applied automatically whenever that exercise comes up. |
| **Program saved** | Next week's plan is rebuilt from the new program. |
| **Next-week plan approved** | The client is told their plan is ready; the live session runs it next week. |

## Sign-in

| Event | What FitnessAI does |
|---|---|
| **Trainer enters the trainer code** (`TRAINER_CODE`) | Trainer session on this device (60 days). |
| **Client enters their code** (first name, lowercase, by default) | Client session that only sees their own booking page and data. Two clients with the same first name get unique codes (`priya`, `priya2`). The trainer can change any code on the client's Edit screen. |
| **Wrong code** | "That code didn't match. Check with your coach." |
| **Sign out** | Clears the session on this device. |
