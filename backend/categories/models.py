from pydantic import BaseModel
from typing import Optional


class CategoryCreate(BaseModel):
    name: str
    color: str  # hex e.g. "#3b82f6"


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class Category(BaseModel):
    id: str
    name: str
    color: str
    created_at: str
