"""Deliver outgoing messages as Web Push notifications.

Clients who installed the app and allowed notifications have a push subscription; they get a notification.
Everyone else sees the message in the app the next time they open it ("in-app").
Without VAPID keys configured, delivery is a dry run that marks messages "in-app".

Generate keys once:  python -m app.notify --generate-keys
"""
from __future__ import annotations

import base64
import json
import logging
import sys

from sqlmodel import Session

from .config import config
from .models import MessageRow, PushSubscriptionRow
from .repo import push_subscriptions
from .schemas import Message

log = logging.getLogger("fitnessai.notify")


def _send_push(sub: PushSubscriptionRow, title: str, body: str, url: str) -> str:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=config.vapid_private_key,
            vapid_claims={"sub": config.vapid_subject},
        )
        return "push"
    except WebPushException as e:  # 404/410 = subscription gone (app removed)
        status = getattr(e.response, "status_code", None)
        return "gone" if status in (404, 410) else "failed"


def deliver(session: Session, messages: list[Message]) -> dict[str, int]:
    counts = {"push": 0, "in-app": 0, "failed": 0}
    for m in messages:
        if m.dir != "out":
            continue
        result = "in-app"
        if m.channel == "push" and config.vapid_private_key:
            subs = push_subscriptions(session, m.client_id)
            results = []
            for s in subs:
                r = _send_push(s, "FitnessAI", m.body, f"./#/book/{m.client_id}")
                if r == "gone":
                    session.delete(s)
                results.append(r)
            if "push" in results:
                result = "push"
            elif "failed" in results:
                result = "failed"
        row = session.get(MessageRow, m.id)
        if row:
            row.delivered = result
            session.add(row)
        m.delivered = result
        counts[result] += 1
    session.commit()
    log.info("delivered %s", counts)
    return counts


def generate_keys() -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid

    v = Vapid()
    v.generate_keys()
    raw_pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    raw_priv = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
    return b64(raw_pub), b64(raw_priv)


if __name__ == "__main__":
    if "--generate-keys" in sys.argv:
        pub, priv = generate_keys()
        print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}")
