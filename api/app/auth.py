"""Who is calling: the trainer, or one of their clients.

AUTH_MODE=dev       no login. Requests act as the first trainer; send header X-Dev-Client: <client id> to act as a client.
AUTH_MODE=supabase  verify the Supabase Auth JWT (Authorization: Bearer <token>). A user is the trainer if
                    trainer.auth_user_id matches; otherwise a client matched by auth_user_id, or linked on first
                    sign-in by email.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .config import config
from .models import ClientRow, Trainer
from .repo import get_session


@dataclass
class Principal:
    role: Literal["trainer", "client"]
    trainer_id: str
    client_id: Optional[str] = None


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
        claims = jwt.decode(auth[7:], config.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Sign in again.")
    sub, email = claims.get("sub"), (claims.get("email") or "").lower()

    trainer = session.exec(select(Trainer).where(Trainer.auth_user_id == sub)).first()
    if trainer:
        return Principal("trainer", trainer.id)
    client = session.exec(select(ClientRow).where(ClientRow.auth_user_id == sub)).first()
    if client is None and email:
        client = session.exec(select(ClientRow).where(ClientRow.email == email)).first()
        if client:
            client.auth_user_id = sub
            session.add(client)
            session.commit()
    if client:
        return Principal("client", client.trainer_id, client.id)
    raise HTTPException(403, "This account isn't linked to a trainer or client yet.")


def trainer_only(p: Principal = Depends(current_principal)) -> Principal:
    if p.role != "trainer":
        raise HTTPException(403, "Trainer only")
    return p


def can_act_for_client(p: Principal, client_id: str | None) -> None:
    if p.role == "client" and p.client_id != client_id:
        raise HTTPException(403, "Not your booking")
