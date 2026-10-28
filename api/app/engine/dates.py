"""Date helpers. All stored datetimes are timezone-aware (UTC); day-level logic runs in the trainer's timezone."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def dow(d: datetime | date) -> int:
    """0 = Sunday … 6 = Saturday (matches JavaScript getDay())."""
    return (d.weekday() + 1) % 7


def local(dt: datetime, tz: ZoneInfo) -> datetime:
    return dt.astimezone(tz)


def start_of_day(dt: datetime, tz: ZoneInfo) -> datetime:
    d = dt.astimezone(tz)
    return datetime.combine(d.date(), time(0, 0), tzinfo=tz)


def at_time(day: datetime | date, hhmm: str, tz: ZoneInfo) -> datetime:
    d = day.astimezone(tz).date() if isinstance(day, datetime) else day
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime.combine(d, time(h, m), tzinfo=tz)


def add_days(dt: datetime, n: int) -> datetime:
    """Calendar-day arithmetic that keeps wall-clock time across DST changes."""
    if dt.tzinfo is not None and isinstance(dt.tzinfo, ZoneInfo):
        naive = dt.replace(tzinfo=None) + timedelta(days=n)
        return naive.replace(tzinfo=dt.tzinfo)
    return dt + timedelta(days=n)


def add_minutes(dt: datetime, n: float) -> datetime:
    return dt + timedelta(minutes=n)


def same_day(a: datetime, b: datetime, tz: ZoneInfo) -> bool:
    return a.astimezone(tz).date() == b.astimezone(tz).date()


def start_of_week(dt: datetime, tz: ZoneInfo) -> datetime:
    """Monday of the week containing dt."""
    s = start_of_day(dt, tz)
    return add_days(s, -((dow(s) + 6) % 7))


def hhmm(dt: datetime, tz: ZoneInfo) -> str:
    d = dt.astimezone(tz)
    return f"{d.hour:02d}:{d.minute:02d}"


def minutes_of(s: str) -> int:
    h, m = (int(x) for x in s.split(":"))
    return h * 60 + m


def fmt_time(dt: datetime, tz: ZoneInfo) -> str:
    d = dt.astimezone(tz)
    h = d.hour % 12 or 12
    return f"{h}:{d.minute:02d} {'PM' if d.hour >= 12 else 'AM'}"


def fmt_day(dt: datetime, tz: ZoneInfo) -> str:
    d = dt.astimezone(tz)
    return f"{DOW_SHORT[dow(d)]}, {MONTHS[d.month - 1]} {d.day}"


def fmt_month_day(dt: datetime, tz: ZoneInfo) -> str:
    d = dt.astimezone(tz)
    return f"{MONTHS[d.month - 1]} {d.day}"


def day_key(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).date().isoformat()
