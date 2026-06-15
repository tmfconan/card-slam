"""Zoho Calendar integration: OAuth 2.0 token handling + one-way event import.

Events are pulled from a Zoho calendar and turned into CardSlam cards. Each
imported card stores the originating event's Zoho ``uid`` so re-syncing skips
unchanged events, updates ones that changed in Zoho, and creates only new ones.
"""
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from boto3.dynamodb.conditions import Attr
from jose import jwt, JWTError

from config import get_jwt_secret
from db import get_cards_table, get_users_table
from .models import ZohoCalendarInfo, ZohoSyncResult
from .store import get_zoho_credentials

# Data-center-specific endpoints. Defaults target the US (.com) data center; set
# the env vars to the regional hosts (e.g. accounts.zoho.eu) for EU/IN/AU accounts.
_ACCOUNTS_BASE = os.environ.get("ZOHO_ACCOUNTS_BASE", "https://accounts.zoho.com")
_CALENDAR_BASE = os.environ.get("ZOHO_CALENDAR_BASE", "https://calendar.zoho.com/api/v1")
_APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8000")

_SCOPES = "ZohoCalendar.calendar.READ,ZohoCalendar.event.READ"
_STATE_ALGORITHM = "HS256"
_STATE_PURPOSE = "zoho_oauth"
_MAX_RANGE_DAYS = 31  # Zoho rejects event-list ranges longer than 31 days


class ZohoNotConnected(Exception):
    """Raised when a user has no stored Zoho refresh token."""


class ZohoError(Exception):
    """Raised when a Zoho API call fails or returns an unexpected response."""


# ── OAuth: authorize URL + signed state ──────────────────────────────────────

def _redirect_uri() -> str:
    return f"{_APP_BASE_URL}/api/integrations/zoho/callback"


def make_state(username: str) -> str:
    """Sign a short-lived token carrying the username so the (unauthenticated)
    OAuth callback can attribute the returned code to the right user."""
    payload = {
        "sub": username,
        "purpose": _STATE_PURPOSE,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_STATE_ALGORITHM)


def read_state(token: str) -> str:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[_STATE_ALGORITHM])
    except JWTError:
        raise ZohoError("Invalid or expired OAuth state")
    if payload.get("purpose") != _STATE_PURPOSE:
        raise ZohoError("Invalid OAuth state")
    return payload["sub"]


def build_authorize_url(username: str, state: str) -> str:
    client_id, _ = get_zoho_credentials(username)
    if not client_id:
        raise ZohoError("Zoho credentials not configured")
    params = {
        "scope": _SCOPES,
        "client_id": client_id,
        "response_type": "code",
        "access_type": "offline",   # required to receive a refresh token
        "redirect_uri": _redirect_uri(),
        "prompt": "consent",        # force a refresh token on re-consent
        "state": state,
    }
    return f"{_ACCOUNTS_BASE}/oauth/v2/auth?{urlencode(params)}"


# ── OAuth: token exchange + storage ──────────────────────────────────────────

def exchange_code(username: str, code: str) -> dict:
    """Trade an authorization code for access + refresh tokens."""
    data = _post_token(
        username,
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
        },
    )
    if "refresh_token" not in data:
        # Without a refresh token we can't sync later. This usually means the
        # app was previously authorized without access_type=offline/prompt.
        raise ZohoError(
            "Zoho did not return a refresh token. Remove the app from your Zoho "
            "account's connected apps and try connecting again."
        )
    return data


def refresh_access_token(username: str, refresh_token: str) -> dict:
    return _post_token(
        username, {"grant_type": "refresh_token", "refresh_token": refresh_token}
    )


def _post_token(username: str, extra_params: dict) -> dict:
    client_id, client_secret = get_zoho_credentials(username)
    if not client_id or not client_secret:
        raise ZohoError("Zoho credentials not configured")
    params = {
        "client_id": client_id,
        "client_secret": client_secret,
        **extra_params,
    }
    try:
        resp = httpx.post(f"{_ACCOUNTS_BASE}/oauth/v2/token", params=params, timeout=30)
    except httpx.RequestError as exc:
        raise ZohoError(f"Zoho token request failed: {exc}")
    data = resp.json()
    if "access_token" not in data:
        raise ZohoError(data.get("error", "Zoho token request failed"))
    return data


def store_tokens(username: str, tokens: dict) -> None:
    """Persist the full token set after the initial code exchange."""
    get_users_table().update_item(
        Key={"username": username},
        UpdateExpression=(
            "SET zoho_refresh_token = :r, zoho_access_token = :a, "
            "zoho_token_expiry = :e"
        ),
        ExpressionAttributeValues={
            ":r": tokens["refresh_token"],
            ":a": tokens["access_token"],
            ":e": _expiry_iso(tokens),
        },
    )


def _persist_access(username: str, tokens: dict) -> None:
    """Persist a refreshed access token (refresh token is unchanged)."""
    get_users_table().update_item(
        Key={"username": username},
        UpdateExpression="SET zoho_access_token = :a, zoho_token_expiry = :e",
        ExpressionAttributeValues={
            ":a": tokens["access_token"],
            ":e": _expiry_iso(tokens),
        },
    )


def _expiry_iso(tokens: dict) -> str:
    # 60s buffer so a token isn't treated as valid right up to the wire.
    seconds = int(tokens.get("expires_in", 3600)) - 60
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def get_valid_access_token(username: str) -> str:
    user = get_users_table().get_item(Key={"username": username}).get("Item") or {}
    refresh = user.get("zoho_refresh_token")
    if not refresh:
        raise ZohoNotConnected()
    access = user.get("zoho_access_token")
    expiry = user.get("zoho_token_expiry")
    if access and expiry and datetime.now(timezone.utc) < datetime.fromisoformat(expiry):
        return access
    tokens = refresh_access_token(username, refresh)
    _persist_access(username, tokens)
    return tokens["access_token"]


def is_connected(username: str) -> bool:
    user = get_users_table().get_item(Key={"username": username}).get("Item") or {}
    return bool(user.get("zoho_refresh_token"))


def is_zoho_configured(username: str) -> bool:
    """Whether the user has configured their own Zoho OAuth credentials."""
    client_id, client_secret = get_zoho_credentials(username)
    return bool(client_id and client_secret)


def disconnect(username: str) -> None:
    get_users_table().update_item(
        Key={"username": username},
        UpdateExpression="REMOVE zoho_refresh_token, zoho_access_token, zoho_token_expiry",
    )


# ── Calendar API ─────────────────────────────────────────────────────────────

def _auth_header(token: str) -> dict:
    # Zoho uses its own scheme here, NOT "Bearer".
    return {"Authorization": f"Zoho-oauthtoken {token}"}


def list_calendars(username: str) -> list[ZohoCalendarInfo]:
    token = get_valid_access_token(username)
    try:
        resp = httpx.get(
            f"{_CALENDAR_BASE}/calendars", headers=_auth_header(token), timeout=30
        )
    except httpx.RequestError as exc:
        raise ZohoError(f"Zoho calendar request failed: {exc}")
    if resp.status_code != 200:
        raise ZohoError(f"Zoho returned {resp.status_code} listing calendars")
    calendars = resp.json().get("calendars", [])
    return [
        ZohoCalendarInfo(uid=c["uid"], name=c.get("name") or "Calendar")
        for c in calendars
        if c.get("uid")
    ]


def _fetch_events(token: str, calendar_uid: str, start, end) -> list[dict]:
    range_param = json.dumps(
        {"start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d")}
    )
    try:
        resp = httpx.get(
            f"{_CALENDAR_BASE}/calendars/{calendar_uid}/events",
            params={"range": range_param},
            # application/json+large is required for event descriptions.
            headers={**_auth_header(token), "Accept": "application/json+large"},
            timeout=30,
        )
    except httpx.RequestError as exc:
        raise ZohoError(f"Zoho events request failed: {exc}")
    if resp.status_code != 200:
        raise ZohoError(f"Zoho returned {resp.status_code} listing events")
    return resp.json().get("events", [])


def _parse_zoho_datetime(value: str):
    """Parse a Zoho datetime string into (datetime, is_timed).

    Timed events look like ``20240115T100000`` (optionally with a trailing
    timezone offset/Z); all-day events are just ``20240115``.
    """
    date_part = value[:8]
    dt = datetime.strptime(date_part, "%Y%m%d")
    if "T" in value:
        after_t = value[value.index("T") + 1:]
        hhmmss = after_t[:6].ljust(6, "0")
        t = datetime.strptime(hhmmss, "%H%M%S")
        return dt.replace(hour=t.hour, minute=t.minute, second=t.second), True
    return dt, False


def _event_start_end(event: dict):
    """Pull the start/end datetime strings out of an event.

    Zoho nests them under ``dateandtime`` (an object, or a list for recurring
    instances); older/flat shapes carry top-level ``start``/``end``. Returns
    ``(start_str, end_str)`` or ``(None, None)`` when neither is present.
    """
    dat = event.get("dateandtime")
    if isinstance(dat, list):
        dat = dat[0] if dat else None
    if isinstance(dat, dict) and dat.get("start"):
        return dat.get("start"), dat.get("end") or dat.get("start")

    start = event.get("start")
    if start:
        return start, event.get("end") or start
    return None, None


def parse_event(event: dict):
    """Map a Zoho event to the card fields we care about.

    Returns ``None`` for events with no parseable start datetime so the caller
    can skip them rather than fail the whole sync.
    """
    start_str, end_str = _event_start_end(event)
    if not start_str:
        return None
    start_dt, timed = _parse_zoho_datetime(start_str)
    end_dt, _ = _parse_zoho_datetime(end_str)

    if timed:
        minutes = int((end_dt - start_dt).total_seconds() // 60)
        duration = max(30, minutes)
        todo_time = start_dt.strftime("%H:%M")
    else:
        duration = 30
        todo_time = None

    return {
        "title": event.get("title") or "(untitled event)",
        "description": event.get("description") or "",
        "todo_date": start_dt.strftime("%Y-%m-%d"),
        "todo_time": todo_time,
        "duration": duration,
    }


# ── Sync ─────────────────────────────────────────────────────────────────────

def _changed(card: dict, parsed: dict) -> bool:
    return (
        card.get("title") != parsed["title"]
        or (card.get("description") or "") != parsed["description"]
        or card.get("todo_date") != parsed["todo_date"]
        or card.get("todo_time") != parsed["todo_time"]
        or int(card.get("duration", 30)) != parsed["duration"]
    )


def _apply_parsed(card: dict, parsed: dict, now: str) -> None:
    card["title"] = parsed["title"]
    card["description"] = parsed["description"]
    card["todo_date"] = parsed["todo_date"]
    card["duration"] = parsed["duration"]
    if parsed["todo_time"] is not None:
        card["todo_time"] = parsed["todo_time"]
    else:
        card.pop("todo_time", None)
    card["updated_at"] = now


def sync_calendar(
    username: str, calendar_uid: str, category_id: str, days: int = _MAX_RANGE_DAYS
) -> ZohoSyncResult:
    token = get_valid_access_token(username)

    start = datetime.now(timezone.utc).date()
    end = start + timedelta(days=max(1, min(days, _MAX_RANGE_DAYS)))
    events = _fetch_events(token, calendar_uid, start, end)

    cards_table = get_cards_table()
    existing = {
        item["zoho_event_uid"]: item
        for item in cards_table.scan(
            FilterExpression=Attr("username").eq(username)
            & Attr("zoho_event_uid").exists()
        ).get("Items", [])
    }

    now = datetime.now(timezone.utc).isoformat()
    created = updated = skipped = 0

    for event in events:
        uid = event.get("uid")
        if not uid:
            continue
        parsed = parse_event(event)
        if parsed is None:   # event without a usable start datetime
            continue

        card = existing.get(uid)
        if card is not None:
            if _changed(card, parsed):
                _apply_parsed(card, parsed, now)
                cards_table.put_item(Item=card)
                updated += 1
            else:
                skipped += 1
            continue

        item = {
            "id": str(uuid.uuid4()),
            "username": username,
            "title": parsed["title"],
            "description": parsed["description"],
            "category_id": category_id,
            "status": "ready_to_do",
            "priority": 0,
            "high_priority": False,
            "duration": parsed["duration"],
            "auto_merge": False,
            "zoho_event_uid": uid,
            "todo_date": parsed["todo_date"],
            "created_at": now,
            "updated_at": now,
        }
        if parsed["todo_time"] is not None:
            item["todo_time"] = parsed["todo_time"]
        cards_table.put_item(Item=item)
        created += 1

    return ZohoSyncResult(created=created, updated=updated, skipped=skipped)
