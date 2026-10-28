"""Command line: python -m app.cli seed | reset"""
from __future__ import annotations

import sys

from sqlmodel import Session, select

from .config import config
from .engine.dates import utcnow
from .models import Trainer
from . import repo
from .seed import build_seed


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else "help"
    repo.create_tables()
    with Session(repo.engine) as s:
        if cmd == "seed":
            if s.exec(select(Trainer)).first():
                print("Already seeded. Use 'reset' to start over.")
                return
            repo.seed_trainer(s, build_seed(utcnow(), config.default_timezone))
            print("Seeded demo trainer t-demo with 6 clients.")
        elif cmd == "reset":
            for t in s.exec(select(Trainer)).all():
                repo.reset_trainer(s, t.id)
            repo.seed_trainer(s, build_seed(utcnow(), config.default_timezone))
            print("Reset to demo data.")
        else:
            print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
