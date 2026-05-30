from typing import Literal, Optional
from pydantic import BaseModel


class ThemeUpdate(BaseModel):
    # The UI theme the signed-in user prefers. Persisted per-user so the
    # choice follows them across devices and sessions.
    theme: Literal["light", "dark"]


class LoginRequest(BaseModel):
    username: str
    password: str
    # Supplied only once the login flow demands a CAPTCHA (see auth.security).
    captcha_id: Optional[str] = None
    captcha_answer: Optional[str] = None


class CaptchaResponse(BaseModel):
    challenge_id: str
    question: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
