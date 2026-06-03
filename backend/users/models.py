from typing import Literal

from pydantic import BaseModel

Role = Literal["admin", "user"]


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role = "user"


class User(BaseModel):
    username: str
    role: str
    created_at: str


class RoleUpdate(BaseModel):
    role: Role
