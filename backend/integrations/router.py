import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from auth.router import verify_token
from .models import (
    ZohoStatus,
    ZohoCalendarInfo,
    ZohoSyncRequest,
    ZohoSyncResult,
    ZohoConfigStatus,
    ZohoConfigUpdate,
)
from . import service, store
from .service import ZohoError, ZohoNotConnected

router = APIRouter(prefix="/integrations", tags=["integrations"])

# Where the OAuth callback sends the browser once tokens are stored. Same origin
# as the API in production; in local dev set APP_BASE_URL to the host serving the SPA.
_APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8000")


@router.get("/zoho/status", response_model=ZohoStatus)
def zoho_status(username: str = Depends(verify_token)):
    return ZohoStatus(connected=service.is_connected(username))


@router.get("/zoho/authorize")
def zoho_authorize(username: str = Depends(verify_token)):
    """Return the Zoho consent URL for the frontend to redirect to."""
    if not service.is_zoho_configured(username):
        raise HTTPException(status_code=503, detail="Zoho client credentials not configured")
    state = service.make_state(username)
    return {"url": service.build_authorize_url(username, state)}


@router.get("/zoho/callback")
def zoho_callback(code: str = Query(...), state: str = Query(...)):
    """Zoho redirects the browser here after consent. Authenticated via the
    signed ``state`` (no Bearer token is present on this navigation)."""
    try:
        username = service.read_state(state)
        tokens = service.exchange_code(username, code)
        service.store_tokens(username, tokens)
    except (ZohoError, ZohoNotConnected):
        return RedirectResponse(url=f"{_APP_BASE_URL}/calendar?zoho=error")
    return RedirectResponse(url=f"{_APP_BASE_URL}/calendar?zoho=connected")


@router.get("/zoho/calendars", response_model=list[ZohoCalendarInfo])
def zoho_calendars(username: str = Depends(verify_token)):
    try:
        return service.list_calendars(username)
    except ZohoNotConnected:
        raise HTTPException(status_code=409, detail="Zoho not connected")
    except ZohoError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/zoho/sync", response_model=ZohoSyncResult)
def zoho_sync(body: ZohoSyncRequest, username: str = Depends(verify_token)):
    try:
        return service.sync_calendar(
            username, body.calendar_uid, body.category_id, body.days
        )
    except ZohoNotConnected:
        raise HTTPException(status_code=409, detail="Zoho not connected")
    except ZohoError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/zoho/disconnect")
def zoho_disconnect(username: str = Depends(verify_token)):
    service.disconnect(username)
    return {"ok": True}


# ── Per-user provider credentials ────────────────────────────────────────────
# Each user supplies their own OAuth app credentials so they connect to their
# own Zoho account rather than a single shared one.

@router.get("/zoho/config", response_model=ZohoConfigStatus)
def get_zoho_config(username: str = Depends(verify_token)):
    return ZohoConfigStatus(**store.get_zoho_config_status(username))


@router.put("/zoho/config", response_model=ZohoConfigStatus)
def put_zoho_config(body: ZohoConfigUpdate, username: str = Depends(verify_token)):
    try:
        store.set_zoho_config(username, body.client_id, body.client_secret)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ZohoConfigStatus(**store.get_zoho_config_status(username))


@router.delete("/zoho/config")
def delete_zoho_config(username: str = Depends(verify_token)):
    store.delete_zoho_config(username)
    return {"ok": True}
