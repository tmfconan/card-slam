"""Anti-brute-force rate limiting and CAPTCHA for the login flow.

Design notes
------------
Card Slam runs as a single Fargate container with FastAPI + DynamoDB and no
Redis/Memcached, so the mitigations here are deliberately dependency-free and
in-process:

* Rate limiting / lockout: a sliding-window counter of failed login attempts
  keyed by client IP + username. After ``CAPTCHA_AFTER_FAILURES`` failures a
  CAPTCHA is required for the next attempt; after ``LOCKOUT_AFTER_FAILURES``
  the key is locked out for ``LOCKOUT_SECONDS`` (HTTP 429). State lives in
  memory, which is the correct scope for a single container. If Card Slam is
  ever scaled horizontally this should move to a shared store (a DynamoDB
  table with a TTL attribute, or Redis).

* CAPTCHA: a self-hosted arithmetic challenge. Third-party options such as
  Google reCAPTCHA or hCaptcha were considered but rejected -- they require an
  external account/secret and outbound network calls from the container, which
  adds operational coupling for a personal app and breaks offline tests. The
  arithmetic challenge needs no secrets, works offline, and -- combined with
  the lockout above -- is enough to stop unattended credential-stuffing bots.
"""

from __future__ import annotations

import os
import secrets
import threading
import time

from fastapi import Request


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# Tunables (overridable via environment variables)
WINDOW_SECONDS = _int_env("LOGIN_WINDOW_SECONDS", 900)  # 15 min sliding window
CAPTCHA_AFTER_FAILURES = _int_env("LOGIN_CAPTCHA_AFTER_FAILURES", 3)
LOCKOUT_AFTER_FAILURES = _int_env("LOGIN_LOCKOUT_AFTER_FAILURES", 8)
LOCKOUT_SECONDS = _int_env("LOGIN_LOCKOUT_SECONDS", 900)  # 15 min lockout
CAPTCHA_TTL_SECONDS = _int_env("LOGIN_CAPTCHA_TTL_SECONDS", 300)

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}
_lockouts: dict[str, float] = {}
_captchas: dict[str, tuple[str, float]] = {}


def _now() -> float:
    return time.time()


def client_ip(request: Request) -> str:
    """Best-effort client IP, honouring the load balancer's forwarding header."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def attempt_key(request: Request, username: str) -> str:
    return f"{client_ip(request)}|{username.lower()}"


def _prune(key: str, now: float) -> list[float]:
    """Drop failure timestamps outside the sliding window; returns what remains."""
    stamps = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
    if stamps:
        _failures[key] = stamps
    else:
        _failures.pop(key, None)
    return stamps


def failure_count(key: str) -> int:
    with _lock:
        return len(_prune(key, _now()))


def captcha_required(key: str) -> bool:
    return failure_count(key) >= CAPTCHA_AFTER_FAILURES


def seconds_until_unlock(key: str) -> int:
    """Seconds remaining on a lockout, or 0 if not locked. Clears stale entries."""
    with _lock:
        until = _lockouts.get(key)
        now = _now()
        if until and until > now:
            return int(until - now) + 1
        if until:
            _lockouts.pop(key, None)
        return 0


def is_locked(key: str) -> bool:
    return seconds_until_unlock(key) > 0


def record_failure(key: str) -> int:
    """Record a failed attempt; locks the key once the threshold is reached.

    Returns the current failure count within the window.
    """
    with _lock:
        now = _now()
        stamps = _prune(key, now)
        stamps.append(now)
        _failures[key] = stamps
        if len(stamps) >= LOCKOUT_AFTER_FAILURES:
            _lockouts[key] = now + LOCKOUT_SECONDS
        return len(stamps)


def record_success(key: str) -> None:
    """Clear all throttling state for a key after a successful login."""
    with _lock:
        _failures.pop(key, None)
        _lockouts.pop(key, None)


def _prune_captchas(now: float) -> None:
    for cid in [c for c, (_, exp) in _captchas.items() if exp < now]:
        _captchas.pop(cid, None)


def generate_captcha() -> dict:
    """Issue a single-use arithmetic challenge."""
    a = secrets.randbelow(9) + 1
    b = secrets.randbelow(9) + 1
    challenge_id = secrets.token_urlsafe(16)
    now = _now()
    with _lock:
        _prune_captchas(now)
        _captchas[challenge_id] = (str(a + b), now + CAPTCHA_TTL_SECONDS)
    return {"challenge_id": challenge_id, "question": f"What is {a} + {b}?"}


def verify_captcha(challenge_id: str | None, answer: str | None) -> bool:
    """Verify and consume a challenge. Each challenge is valid for one attempt."""
    if not challenge_id or answer is None:
        return False
    with _lock:
        entry = _captchas.pop(challenge_id, None)  # single-use
    if not entry:
        return False
    expected, expires_at = entry
    if expires_at < _now():
        return False
    return str(answer).strip() == expected


def reset() -> None:
    """Clear all state. Intended for tests."""
    with _lock:
        _failures.clear()
        _lockouts.clear()
        _captchas.clear()
