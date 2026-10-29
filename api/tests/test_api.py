"""API tests against a throwaway SQLite database."""
import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db.name}")
os.environ["AUTH_MODE"] = "dev"
os.environ["SEED_DEMO"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def client():
    return TestClient(app)


def test_state_and_balance():
    with client() as c:
        st = c.get("/api/state").json()
        assert st["role"] == "trainer"
        assert len(st["clients"]) == 6
        assert {"openSlots", "suggestions", "plans", "settings"} <= st.keys()
        elena = next(x for x in st["clients"] if x["id"] == "c-elena")
        done = sum(1 for l in st["logs"] if l["clientId"] == "c-elena" and l["status"] == "done")
        assert sum(p["sessions"] for p in elena["packages"]) - done == 1


def test_add_package_and_log_session():
    with client() as c:
        before = sum(p["sessions"] for p in next(x for x in c.get("/api/state").json()["clients"] if x["id"] == "c-elena")["packages"])
        st = c.post("/api/clients/c-elena/packages", json={"sessions": 10, "price": 600}).json()
        elena = next(x for x in st["clients"] if x["id"] == "c-elena")
        assert sum(p["sessions"] for p in elena["packages"]) == before + 10
        log = next(l for l in st["logs"] if l["clientId"] == "c-elena" and l["status"] == "done")
        new = {**log, "id": "l_test", "date": "2026-10-27T22:00:00Z", "note": "api test"}
        st2 = c.post("/api/sessions", json={"log": new}).json()
        assert any(l["id"] == "l_test" for l in st2["logs"])


def test_saved_mod_round_trip():
    with client() as c:
        mod = {"exerciseId": "plank", "kind": "shorter", "detail": "30 s", "reason": "Back", "savedAt": "2026-10-27T22:00:00Z"}
        st = c.post("/api/clients/c-leo/mods", json=mod).json()
        leo = next(x for x in st["clients"] if x["id"] == "c-leo")
        assert any(m["exerciseId"] == "plank" for m in leo["mods"])
        st = c.delete("/api/clients/c-leo/mods/plank").json()
        assert not any(m["exerciseId"] == "plank" for m in next(x for x in st["clients"] if x["id"] == "c-leo")["mods"])


def test_generate_and_plan():
    with client() as c:
        days = c.post("/api/programs/generate", json={"clientId": "c-priya", "equipment": ["ropes", "dumbbells", "bodyweight", "box", "stability-ball"], "days": 3, "seed": 5}).json()["days"]
        assert len(days) == 3 and all(len(ci["items"]) == 4 for d in days for ci in d["circuits"])
        st = c.post("/api/clients/c-priya/plan").json()
        plan = st["plans"]["c-priya"]
        assert any(ch["kind"] == "stall" for ch in plan["changes"])
        st = c.post("/api/clients/c-priya/plan/approve").json()
        assert st["plans"]["c-priya"]["approved"] is True


def test_client_view_is_filtered_and_can_book():
    with client() as c:
        st = c.get("/api/state", headers={"X-Dev-Client": "c-leo"}).json()
        assert st["role"] == "client" and [x["id"] for x in st["clients"]] == ["c-leo"]
        assert st["busy"] == [] and all(b["clientId"] == "c-leo" for b in st["bookings"])
        day = next(k for k, v in sorted(st["openSlots"].items()) if v)
        start = st["openSlots"][day][0]
        st2 = c.post("/api/clients/c-leo/book", json={"start": start}, headers={"X-Dev-Client": "c-leo"}).json()
        assert any(b["start"].startswith(start[:16]) and b["status"] in ("confirmed", "needs-you") for b in st2["bookings"])
        # a client can't act for someone else
        assert c.post("/api/clients/c-priya/book", json={"start": start}, headers={"X-Dev-Client": "c-leo"}).status_code == 403
        assert c.post("/api/clients/c-leo/packages", json={"sessions": 5}, headers={"X-Dev-Client": "c-leo"}).status_code == 403


def test_schedule_run_and_simulate():
    with client() as c:
        r = c.post("/api/schedule/run").json()
        assert "invites" in r["result"]
        r = c.post("/api/demo/simulate-replies").json()
        assert r["count"] >= 0


def test_cancel_offers_waitlist():
    with client() as c:
        st = c.get("/api/state").json()
        b = next(x for x in st["bookings"] if x["status"] == "confirmed" and x["clientId"] != "c-sam")
        st2 = c.post(f"/api/bookings/{b['id']}/cancel").json()
        assert any(x["clientId"] == "c-sam" and x["source"] == "waitlist" for x in st2["bookings"])
