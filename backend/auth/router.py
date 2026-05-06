from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError

from .models import LoginRequest, TokenResponse
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


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    table = get_users_table()
    user = table.get_item(Key={"username": body.username}).get("Item")
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_token(body.username, user["role"]))


@router.get("/me")
def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = _decode(credentials)
    return {"username": payload["sub"], "role": payload.get("role", "user")}
