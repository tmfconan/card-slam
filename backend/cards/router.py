from fastapi import APIRouter, HTTPException, Depends, Query, Body
import uuid
from datetime import datetime, timezone
from typing import Optional
from boto3.dynamodb.conditions import Attr

from .models import (
    CardCreate,
    CardUpdate,
    CardReorderItem,
    BatchStatusUpdate,
    BatchDelete,
    BatchArchive,
    Card,
    Status,
    FeatureRequestStatus,
)
from auth.router import verify_token
from db import get_cards_table

router = APIRouter(prefix="/cards", tags=["cards"])

# A card whose feature request is queued or building feeds its content to the
# auto-code build, so it is locked against modification until removed from the
# queue. waiting_for_merge is presentational (stored status stays "queued") but
# is included for completeness.
_LOCKED_FEATURE_REQUEST_STATUSES = frozenset(
    {
        FeatureRequestStatus.pending_validation.value,
        FeatureRequestStatus.queued.value,
        FeatureRequestStatus.waiting_for_merge.value,
        FeatureRequestStatus.in_progress.value,
    }
)

_QUEUE_LOCKED_DETAIL = (
    "Card is queued or in progress for a feature request and can't be modified. "
    "Remove it from the queue first."
)


def _is_queue_locked(item: dict) -> bool:
    """A flagged feature request that is queued or building is locked."""
    return bool(item.get("is_feature_request")) and (
        item.get("feature_request_status") in _LOCKED_FEATURE_REQUEST_STATUSES
    )


def _normalize(item: dict) -> dict:
    item["priority"] = int(item.get("priority", 0))
    item["duration"] = int(item.get("duration", 30))
    item["high_priority"] = bool(item.get("high_priority", False))
    item["archived"] = bool(item.get("archived", False))
    item.setdefault("username", "admin")  # migrate legacy records
    item.setdefault("is_feature_request", False)
    item.setdefault("feature_request_status", None)
    item["auto_merge"] = bool(item.get("auto_merge", False))
    return item


def _apply_wait_for_merge(items: list[dict]) -> None:
    """Mark queued feature requests as "waiting_for_merge" (in place) when an
    earlier feature request has been build-deployed but not yet merged."""
    has_unmerged_deploy = any(
        i.get("feature_request_status") == FeatureRequestStatus.completed.value
        for i in items
    )
    if not has_unmerged_deploy:
        return
    for i in items:
        if i.get("feature_request_status") == FeatureRequestStatus.queued.value:
            i["feature_request_status"] = FeatureRequestStatus.waiting_for_merge.value


def _owned(item: dict, username: str) -> bool:
    return item.get("username", "admin") == username


def _get_owned(table, card_id: str, username: str) -> dict:
    item = table.get_item(Key={"id": card_id}).get("Item")
    if not item or not _owned(item, username):
        raise HTTPException(status_code=404, detail="Card not found")
    return _normalize(item)


@router.get("/", response_model=list[Card])
def list_cards(
    status: Optional[Status] = Query(None),
    category_id: Optional[str] = Query(None),
    archived: bool = Query(False),
    username: str = Depends(verify_token),
):
    table = get_cards_table()
    items = [_normalize(i) for i in
             table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])]
    # Include legacy records for admin
    if username == "admin":
        legacy = [_normalize(i) for i in table.scan().get("Items", []) if "username" not in i]
        items = items + legacy
    # "Wait for merge": if any feature request has been build-deployed but not yet
    # merged (status "completed"), queued feature requests must not start building
    # — they need to build on the latest code. Surface them as "waiting_for_merge".
    # This is presentational: the stored status stays "queued" and is determined
    # over the full owned set, before the view filters below narrow it.
    _apply_wait_for_merge(items)
    # Archived cards are surfaced separately from active content; the default
    # listing (archived=False) returns only active cards.
    items = [i for i in items if i["archived"] == archived]
    if status:
        items = [i for i in items if i["status"] == status]
    if category_id:
        items = [i for i in items if i["category_id"] == category_id]
    return sorted(items, key=lambda x: (x["priority"], x["created_at"]))


@router.post("/", response_model=Card, status_code=201)
def create_card(body: CardCreate, username: str = Depends(verify_token)):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    item: dict = {
        "id": str(uuid.uuid4()),
        "username": username,
        "title": body.title,
        "description": body.description,
        "category_id": body.category_id,
        "status": body.status,
        "priority": body.priority,
        "high_priority": body.high_priority,
        "duration": body.duration,
        "auto_merge": body.auto_merge,
        "created_at": now,
        "updated_at": now,
    }
    if body.todo_date is not None:
        item["todo_date"] = body.todo_date
    if body.todo_time is not None:
        item["todo_time"] = body.todo_time
    table.put_item(Item=item)
    return item


@router.post("/batch", response_model=list[Card], status_code=201)
def create_cards_batch(bodies: list[CardCreate], username: str = Depends(verify_token)):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for i, body in enumerate(bodies):
        item = {
            "id": str(uuid.uuid4()),
            "username": username,
            "title": body.title,
            "description": body.description,
            "category_id": body.category_id,
            "status": body.status,
            "priority": i,
            "high_priority": body.high_priority,
            "duration": body.duration,
            "auto_merge": body.auto_merge,
            "created_at": now,
            "updated_at": now,
        }
        if body.todo_date is not None:
            item["todo_date"] = body.todo_date
        if body.todo_time is not None:
            item["todo_time"] = body.todo_time
        table.put_item(Item=item)
        items.append(item)
    return items


@router.post("/batch-status", status_code=200)
def batch_status_update(
    body: BatchStatusUpdate, username: str = Depends(verify_token)
):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for card_id in body.ids:
        card = table.get_item(Key={"id": card_id}).get("Item")
        if card and _owned(card, username) and not _is_queue_locked(card):
            card["status"] = body.status
            card["updated_at"] = now
            table.put_item(Item=card)
            updated += 1
    return {"updated": updated}


@router.post("/batch-archive", status_code=200)
def batch_archive(body: BatchArchive, username: str = Depends(verify_token)):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for card_id in body.ids:
        card = table.get_item(Key={"id": card_id}).get("Item")
        if card and _owned(card, username) and not _is_queue_locked(card):
            card["archived"] = body.archived
            card["updated_at"] = now
            table.put_item(Item=card)
            updated += 1
    return {"updated": updated}


@router.post("/batch-delete", status_code=200)
def batch_delete(body: BatchDelete, username: str = Depends(verify_token)):
    table = get_cards_table()
    deleted = 0
    for card_id in body.ids:
        card = table.get_item(Key={"id": card_id}).get("Item")
        if card and _owned(card, username) and not _is_queue_locked(card):
            table.delete_item(Key={"id": card_id})
            deleted += 1
    return {"deleted": deleted}


@router.post("/reorder", status_code=200)
def reorder_cards(
    items: list[CardReorderItem] = Body(...),
    username: str = Depends(verify_token),
):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        card = table.get_item(Key={"id": item.id}).get("Item")
        if card and _owned(card, username) and not _is_queue_locked(card):
            card["status"] = item.status
            card["priority"] = item.priority
            card["updated_at"] = now
            table.put_item(Item=card)
    return {"ok": True}


@router.get("/{card_id}", response_model=Card)
def get_card(card_id: str, username: str = Depends(verify_token)):
    return _get_owned(get_cards_table(), card_id, username)


@router.put("/{card_id}", response_model=Card)
def update_card(card_id: str, body: CardUpdate, username: str = Depends(verify_token)):
    table = get_cards_table()
    item = _get_owned(table, card_id, username)
    updates = body.model_dump(exclude_unset=True)
    # A locked feature request can't have its content changed. The auto_merge
    # toggle governs post-build merging (not the build requirements), so it stays
    # editable while queued or building.
    if _is_queue_locked(item) and set(updates) - {"auto_merge"}:
        raise HTTPException(status_code=409, detail=_QUEUE_LOCKED_DETAIL)
    for k, v in updates.items():
        if v is None:
            item.pop(k, None)
        else:
            item[k] = v
    item["updated_at"] = datetime.now(timezone.utc).isoformat()
    table.put_item(Item=item)
    return _normalize(item)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: str, username: str = Depends(verify_token)):
    table = get_cards_table()
    item = _get_owned(table, card_id, username)  # raises 404 if not owned
    if _is_queue_locked(item):
        raise HTTPException(status_code=409, detail=_QUEUE_LOCKED_DETAIL)
    table.delete_item(Key={"id": card_id})
