from pydantic import BaseModel
from typing import Optional
from enum import Enum


class FeatureRunStatus(str, Enum):
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"


class FeatureRun(BaseModel):
    run_id: str
    card_id: str
    card_title: str
    card_description: str
    status: FeatureRunStatus
    codebuild_build_id: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    reason: str


class FlagRequest(BaseModel):
    pass
