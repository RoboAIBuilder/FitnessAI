"""Event handlers and code sign-in."""
import os
import tempfile
from datetime import timedelta

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db.name}")
os.environ.setdefault("AUTH_MODE", "dev")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import config  # noqa: E402
from app.engine import events  # noqa: E402
from app.engine.balance import session_balance  # noqa: E402
from app.engine.dates import utcnow  # noqa: E402
from app.engine.scheduler import Sched  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import build_seed  # noqa: E402

NOW = utcnow()


def sched():
    st = build_seed(NOW)
    return st, Sched(st.clients, st.bookings, st.busy, st.availability, st.settings)


def next_confirmed(s, exclude=()):
    return next(b for b in sorted(s.bookings, key=lambda b: b.start) if b.status == "confirmed" and b.start > NOW + timedelta(hours=13) and b.client_id not in exclude)


def test_block_time_moves_booked_client():
    st, s = sched()
    b = next_confirmed(s)
    blk, out = events.block_time(s, b.start - timedelta(minutes=5), b.start + timedelta(minutes=45), "Dentist", NOW)
    moved = next(x for x in out.bookings if x.id == b.id)
    assert moved.status in ("awaiting", "needs-you")
    if moved.status == "awaiting":
        assert moved.offered and all(t != b.start for t in moved.offered)
    assert any(m.client_id == b.client_id and "can't make" in m.body or "needs to move" in m.body for m in out.messages)
    assert blk.source == "Manual"


def test_unblock_offers_waitlist():
    st, s = sched()
    b = next_confirmed(s)
    start = b.start + timedelta(hours=7)
    # find a window inside availability with no bookings: block it, then unblock
    day_slots = events.open_slots(s, b.start, NOW)
    if not day_slots:
        return
    t = day_slots[0]
    blk, _ = events.block_time(s, t, t + timedelta(minutes=40), "Errand", NOW)
    out = events.unblock_time(s, blk, NOW)
    assert any(x.source == "waitlist" for x in out.bookings)
    assert start  # keep linter quiet


def test_reschedule_frees_old_slot_to_waitlist():
    st, s = sched()
    b = next_confirmed(s, exclude=("c-sam",))
    alt = next(t for t in events.open_slots(s, b.start, NOW) if t != b.start)
    r = events.client_books(s, b.client_id, alt, NOW, b.id, unbooked_left=5, by_client=True)
    assert r.ok and r.result.booking.start == alt
    assert any(x.source == "waitlist" and x.start == b.start for x in r.extra.bookings)


def test_late_change_refused():
    st, s = sched()
    soon = next((b for b in s.bookings if b.status == "confirmed" and NOW < b.start < NOW + timedelta(hours=11)), None)
    if soon is None:
        b = next_confirmed(s)
        b.start = NOW + timedelta(hours=3)
        soon = b
    r = events.client_books(s, soon.client_id, soon.start + timedelta(days=1), NOW, soon.id, unbooked_left=5, by_client=True)
    assert not r.ok and "Message your coach" in r.reason


def test_no_sessions_left_holds_booking_and_renewal_confirms():
    st, s = sched()
    t = next(t for d in range(2, 6) for t in events.open_slots(s, NOW + timedelta(days=d), NOW))
    r = events.client_books(s, "c-leo", t, NOW, None, unbooked_left=0, by_client=True)
    assert r.ok and r.result.booking.status == "needs-you"
    s.bookings.append(r.result.booking)
    out = events.renewed(s, "c-leo", 10, NOW)
    assert any(x.id == r.result.booking.id and x.status == "confirmed" for x in out.bookings)


def test_low_balance_notice():
    st, _ = sched()
    leo = next(c for c in st.clients if c.id == "c-leo")
    bal = session_balance(leo, st.logs, st.bookings, NOW)
    assert events.low_balance_notice(leo, bal.pending, NOW)  # 2 left
    assert not events.low_balance_notice(leo, 8, NOW)


def test_api_block_and_availability_events():
    with TestClient(app) as c:
        st = c.get("/api/state").json()
        b = next(x for x in sorted(st["bookings"], key=lambda x: x["start"]) if x["status"] == "confirmed" and x["start"] > (NOW + timedelta(hours=13)).isoformat())
        from datetime import datetime
        start = datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
        r = c.post("/api/busy", json={"start": (start - timedelta(minutes=5)).isoformat(), "end": (start + timedelta(minutes=40)).isoformat(), "label": "Errand"}).json()
        assert "moved" in r["summary"]
        moved = next(x for x in r["state"]["bookings"] if x["id"] == b["id"])
        assert moved["status"] in ("awaiting", "needs-you")
        blk = next(x for x in r["state"]["busy"] if x["source"] == "Manual")
        r2 = c.delete(f"/api/busy/{blk['id']}").json()
        assert "open again" in r2["summary"]
        # clearing a whole day of hours moves that day's sessions
        av = r2["state"]["availability"]
        dow = str((start.astimezone().weekday() + 1) % 7)
        st3 = c.put("/api/availability", json={**av, dow: []}).json()
        assert all(x["status"] != "confirmed" or not x["start"].startswith(start.date().isoformat()) or x["id"] == b["id"] for x in st3["bookings"])


def test_code_sign_in():
    object.__setattr__(config, "auth_mode", "code")
    try:
        with TestClient(app) as c:
            assert c.get("/api/state").status_code == 401
            assert c.post("/api/auth/login", json={"code": "nope"}).status_code == 401
            t = c.post("/api/auth/login", json={"code": "Coach"}).json()
            assert t["role"] == "trainer"
            st = c.get("/api/state", headers={"Authorization": f"Bearer {t['token']}"}).json()
            assert st["role"] == "trainer" and len(st["clients"]) == 6
            codes = {x["id"]: x["accessCode"] for x in st["clients"]}
            assert codes["c-priya"] == "priya" and codes["c-leo"] == "leo"
            ct = c.post("/api/auth/login", json={"code": "leo"}).json()
            assert ct["role"] == "client" and ct["clientId"] == "c-leo"
            cs = c.get("/api/state", headers={"Authorization": f"Bearer {ct['token']}"}).json()
            assert [x["id"] for x in cs["clients"]] == ["c-leo"] and cs["busy"] == []
            # a client can't use trainer endpoints
            assert c.post("/api/clients/c-leo/packages", json={"sessions": 5}, headers={"Authorization": f"Bearer {ct['token']}"}).status_code == 403
            # a second Priya gets a unique code
            new = {**next(x for x in st["clients"] if x["id"] == "c-priya"), "id": "c-priya2", "accessCode": None, "packages": []}
            st2 = c.put("/api/clients/c-priya2", json=new, headers={"Authorization": f"Bearer {t['token']}"}).json()
            assert next(x for x in st2["clients"] if x["id"] == "c-priya2")["accessCode"] == "priya2"
    finally:
        object.__setattr__(config, "auth_mode", "dev")
