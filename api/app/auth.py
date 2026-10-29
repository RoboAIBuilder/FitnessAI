"""Sign-in with a code, like LearnerLens's class code — but one code per person.

- The trainer signs in with TRAINER_CODE (an environment variable; "coach" when running locally).
- Each client signs in with their own code, stored on their profile. It starts as their first name,
  lowercase ("priya"), and the trainer can change it on the client's Edit screen.

A successful sign-in returns a signed session token; the app sends it as "Authorization: Bearer <token>".

AUTH_MODE=dev skips sign-in for local development: requests act as the trainer, or as a client with
the header X-Dev-Client: <client id>.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .config import config
from .engine.dates import utcnow
from .models import ClientRow, Trainer
from .repo import app_secret, get_session


@dataclass
class Principal:
    role: Literal["trainer", "client"]
    trainer_id: str
    client_id: Optional[str] = None


def trainer_code() -> str:
    if config.trainer_code:
        return config.trainer_code
    if config.on_vercel:
        raise HTTPException(503, "Set the TRAINER_CODE environment variable in Vercel to finish setup.")
    return "coach"


def _secret(session: Session) -> str:
    return config.secret_key or app_secret(session, "session_key", lambda: secrets.token_urlsafe(48))


def sign_in(session: Session, code: str) -> dict:
    code = (code or "").strip().lower()
    if not code:
        raise HTTPException(400, "Enter your code.")
    trainer = session.exec(select(Trainer)).first()
    if trainer is None:
        raise HTTPException(503, "FitnessAI isn't set up yet.")
    row = session.exec(select(ClientRow).where(ClientRow.trainer_id == trainer.id, ClientRow.access_code == code)).first()
    if row is not None:
        p = Principal("client", trainer.id, row.id)
    elif secrets.compare_digest(code, trainer_code().lower()):
        p = Principal("trainer", trainer.id)
    else:
        raise HTTPException(401, "That code didn't match. Check with your coach.")
    exp = utcnow() + timedelta(days=config.session_days)
    token = jwt.encode({"role": p.role, "tid": p.trainer_id, "cid": p.client_id, "exp": exp}, _secret(session), algorithm="HS256")
    return {"token": token, "role": p.role, "clientId": p.client_id}


def current_principal(request: Request, session: Session = Depends(get_session)) -> Principal:
    if config.auth_mode == "dev":
        trainer = session.exec(select(Trainer)).first()
        if trainer is None:
            raise HTTPException(503, "No trainer yet. Run: python -m app.cli seed")
        cid = request.headers.get("X-Dev-Client")
        if cid:
            row = session.get(ClientRow, cid)
            if not row or row.trainer_id != trainer.id:
                raise HTTPException(404, "Unknown client")
            return Principal("client", trainer.id, cid)
        return Principal("trainer", trainer.id)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Sign in required")
    try:
        claims = jwt.decode(auth[7:], _secret(session), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session ended. Sign in again.")
    if claims.get("role") == "client":
        row = session.get(ClientRow, claims.get("cid") or "")
        if row is None:  # client removed
            raise HTTPException(401, "Sign in again.")
        return Principal("client", row.trainer_id, row.id)
    if session.get(Trainer, claims.get("tid") or "") is None:
        raise HTTPException(401, "Sign in again.")
    return Principal("trainer", claims["tid"])


def trainer_only(p: Principal = Depends(current_principal)) -> Principal:
    if p.role != "trainer":
        raise HTTPException(403, "Trainer only")
    return p


def can_act_for_client(p: Principal, client_id: str | None) -> None:
    if p.role == "client" and p.client_id != client_id:
        raise HTTPException(403, "Not your booking")
