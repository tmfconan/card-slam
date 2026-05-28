from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError

from .models import LoginRequest, TokenResponse, CaptchaResponse
from . import security as login_security
from config import get_jwt_secret
from db import get_users_table

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_HOURS = 24


def create_token(username: str, role: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_ALGORITHM)


def _decode(credentials: HTTPAuthorizationCredentials) -> dict:
    try:
        return jwt.decode(
            credentials.credentials, get_jwt_secret(), algorithms=[_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Returns the username of the authenticated user."""
    return _decode(credentials)["sub"]


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Returns the username; raises 403 if the user is not admin."""
    payload = _decode(credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload["sub"]


@router.get("/captcha", response_model=CaptchaResponse)
def captcha():
    """Issue a CAPTCHA challenge for the login form to solve."""
    return login_security.generate_captcha()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request):
    key = login_security.attempt_key(request, body.username)

    locked = login_security.seconds_until_unlock(key)
    if locked:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Too many failed login attempts. Please try again later.",
                "retry_after": locked,
                "captcha_required": True,
            },
            headers={"Retry-After": str(locked)},
        )

    if login_security.captcha_required(key):
        if not body.captcha_id or body.captcha_answer is None:
            raise HTTPException(
                status_code=400,
                detail={"message": "Captcha required.", "captcha_required": True},
            )
        if not login_security.verify_captcha(body.captcha_id, body.captcha_answer):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Captcha verification failed.",
                    "captcha_required": True,
                },
            )

    table = get_users_table()
    user = table.get_item(Key={"username": body.username}).get("Item")
    if not user or not bcrypt.checkpw(
        body.password.encode(), user["password_hash"].encode()
    ):
        count = login_security.record_failure(key)
        raise HTTPException(
            status_code=401,
            detail={
                "message": "Invalid credentials",
                "captcha_required": count >= login_security.CAPTCHA_AFTER_FAILURES,
            },
        )

    login_security.record_success(key)
    return TokenResponse(access_token=create_token(body.username, user["role"]))


@router.get("/me")
def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = _decode(credentials)
    return {"username": payload["sub"], "role": payload.get("role", "user")}
