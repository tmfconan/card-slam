"""Persistence for "Close the Day" records (DynamoDB).

A day closure captures the user's learning for a given day plus the AI summary
they reviewed. These are eventually rolled up into larger improvement summaries,
so they must outlive the request.

There is no dedicated table provisioned for this feature, so closures reuse the
generic single-partition-key ``integrations`` table. The partition key is
namespaced — ``dayclose#<username>#<YYYY-MM-DD>`` — so it never collides with the
provider credentials (``provider="zoho"``) that also live there. ``username`` and
``date`` are stored as their own attributes so closures can be scanned per user
for the future roll-up feature.
"""
from datetime import datetime, timezone

from db import get_integrations_table

_PREFIX = "dayclose"


def _key(username: str, date: str) -> str:
    return f"{_PREFIX}#{username}#{date}"


def get_day_close(username: str, date: str) -> dict | None:
    """Return the stored closure for a user's day, or None if not closed yet."""
    item = (
        get_integrations_table()
        .get_item(Key={"provider": _key(username, date)})
        .get("Item")
    )
    if not item:
        return None
    return {
        "date": item.get("date", date),
        "ai_summary": item.get("ai_summary", ""),
        "learning": item.get("learning", ""),
        "created_at": item.get("created_at", ""),
        "updated_at": item.get("updated_at", ""),
    }


def save_day_close(username: str, date: str, learning: str, ai_summary: str) -> dict:
    """Create or update a day closure. Re-closing a day overwrites the learning
    and summary while preserving the original ``created_at``."""
    table = get_integrations_table()
    now = datetime.now(timezone.utc).isoformat()
    existing = table.get_item(Key={"provider": _key(username, date)}).get("Item") or {}
    created_at = existing.get("created_at", now)
    table.put_item(
        Item={
            "provider": _key(username, date),
            "type": _PREFIX,
            "username": username,
            "date": date,
            "ai_summary": ai_summary,
            "learning": learning,
            "created_at": created_at,
            "updated_at": now,
        }
    )
    return {
        "date": date,
        "ai_summary": ai_summary,
        "learning": learning,
        "created_at": created_at,
        "updated_at": now,
    }
