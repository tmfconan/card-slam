from typing import Optional

from pydantic import BaseModel


class ZohoStatus(BaseModel):
    connected: bool


class ZohoCalendarInfo(BaseModel):
    uid: str
    name: str


class ZohoSyncRequest(BaseModel):
    calendar_uid: str
    days: int = 31   # how far ahead to import; capped to Zoho's 31-day range


class ZohoSyncResult(BaseModel):
    created: int
    updated: int
    skipped: int


class ZohoConfigStatus(BaseModel):
    configured: bool
    client_id: Optional[str] = None   # public OAuth identifier; secret is never returned
    # default category applied to imported cards; None means imported cards get no category
    default_category_id: Optional[str] = None


class ZohoConfigUpdate(BaseModel):
    client_id: str
    client_secret: str = ""   # blank on update keeps the stored secret
    # None (or omitted) clears the default so imported cards get no category
    default_category_id: Optional[str] = None
