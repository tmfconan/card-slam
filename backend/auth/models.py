from typing import Optional
from pydantic import BaseModel


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
