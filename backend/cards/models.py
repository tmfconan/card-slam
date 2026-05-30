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


class FeatureRequestStatus(str, Enum):
    pending_validation = "pending_validation"
    validation_failed = "validation_failed"
    queued = "queued"
    waiting_for_merge = "waiting_for_merge"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"
    merged = "merged"


class CardCreate(BaseModel):
    title: str
    description: str = ""
    category_id: str
    status: Status = Status.brainstorm
    priority: int = 0
    high_priority: bool = False
    todo_date: Optional[str] = None   # YYYY-MM-DD
    todo_time: Optional[str] = None   # HH:MM
    duration: int = 30                # minutes; minimum 30
    auto_merge: bool = False          # feature requests: auto-merge after build


class CardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    status: Optional[Status] = None
    priority: Optional[int] = None
    high_priority: Optional[bool] = None
    todo_date: Optional[str] = None   # set to null to clear
    todo_time: Optional[str] = None   # set to null to clear
    duration: Optional[int] = None
    archived: Optional[bool] = None   # True to archive, False to restore
    auto_merge: Optional[bool] = None   # auto-merge feature request after build


class CardReorderItem(BaseModel):
    id: str
    status: Status
    priority: int


class BatchStatusUpdate(BaseModel):
    ids: list[str]
    status: Status


class BatchDelete(BaseModel):
    ids: list[str]


class BatchArchive(BaseModel):
    ids: list[str]
    archived: bool = True   # True to archive, False to restore


class Card(BaseModel):
    id: str
    title: str
    description: str
    category_id: str
    status: Status
    priority: int
    high_priority: bool = False
    duration: int = 30
    archived: bool = False
    todo_date: Optional[str] = None
    todo_time: Optional[str] = None
    created_at: str
    updated_at: str
    is_feature_request: bool = False
    feature_request_status: Optional[FeatureRequestStatus] = None
    auto_merge: bool = False
