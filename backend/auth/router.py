from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import jwt, JWTError

from .models import LoginRequest, TokenResponse
from config import get_jwt_secret, get_password_hash

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_HOURS = 24


def create_token(sub: str) -> str:
    payload = {
        "sub": sub,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_ALGORITHM)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    try:
        payload = jwt.decode(
            credentials.credentials, get_jwt_secret(), algorithms=[_ALGORITHM]
        )
        return payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    stored_hash = get_password_hash()
    if not stored_hash:
        raise HTTPException(status_code=500, detail="Auth not configured")
    if not bcrypt.checkpw(body.password.encode(), stored_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid password")
    return TokenResponse(access_token=create_token("admin"))
