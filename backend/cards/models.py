from pydantic import BaseModel
from typing import Optional
from enum import Enum


class Status(str, Enum):
    brainstorm = "brainstorm"
    intent_to_do = "intent_to_do"
    ready_to_do = "ready_to_do"
    in_progress = "in_progress"
    needs_finishing = "needs_finishing"
    done = "done"


class CardCreate(BaseModel):
    title: str
    description: str = ""
    category_id: str
    status: Status = Status.brainstorm
    priority: int = 0
    todo_date: Optional[str] = None  # YYYY-MM-DD


class CardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    status: Optional[Status] = None
    priority: Optional[int] = None
    todo_date: Optional[str] = None  # YYYY-MM-DD; explicitly set to null to clear


class CardReorderItem(BaseModel):
    id: str
    status: Status
    priority: int


class Card(BaseModel):
    id: str
    title: str
    description: str
    category_id: str
    status: Status
    priority: int
    todo_date: Optional[str] = None
    created_at: str
    updated_at: str
