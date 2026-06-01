from typing import Optional

from pydantic import BaseModel


class ZohoStatus(BaseModel):
    connected: bool


class ZohoCalendarInfo(BaseModel):
    uid: str
    name: str


class ZohoSyncRequest(BaseModel):
    calendar_uid: str
    category_id: str
    days: int = 31   # how far ahead to import; capped to Zoho's 31-day range


class ZohoSyncResult(BaseModel):
    created: int
    updated: int
    skipped: int


class ZohoConfigStatus(BaseModel):
    configured: bool
    client_id: Optional[str] = None   # public OAuth identifier; secret is never returned


class ZohoConfigUpdate(BaseModel):
    client_id: str
    client_secret: str = ""   # blank on update keeps the stored secret
