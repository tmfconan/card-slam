from fastapi import APIRouter, HTTPException, Depends, Query, Body
import uuid
from datetime import datetime, timezone
from typing import Optional

from .models import CardCreate, CardUpdate, CardReorderItem, Card, Status
from auth.router import verify_token
from db import get_cards_table

router = APIRouter(prefix="/cards", tags=["cards"])


def _normalize(item: dict) -> dict:
    item["priority"] = int(item.get("priority", 0))
    return item


@router.get("/", response_model=list[Card])
def list_cards(
    status: Optional[Status] = Query(None),
    category_id: Optional[str] = Query(None),
    user: str = Depends(verify_token),
):
    table = get_cards_table()
    items = [_normalize(i) for i in table.scan().get("Items", [])]
    if status:
        items = [i for i in items if i["status"] == status]
    if category_id:
        items = [i for i in items if i["category_id"] == category_id]
    return sorted(items, key=lambda x: (x["priority"], x["created_at"]))


@router.post("/", response_model=Card, status_code=201)
def create_card(body: CardCreate, user: str = Depends(verify_token)):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "category_id": body.category_id,
        "status": body.status,
        "priority": body.priority,
        "created_at": now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    return item


@router.post("/batch", response_model=list[Card], status_code=201)
def create_cards_batch(bodies: list[CardCreate], user: str = Depends(verify_token)):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for i, body in enumerate(bodies):
        item = {
            "id": str(uuid.uuid4()),
            "title": body.title,
            "description": body.description,
            "category_id": body.category_id,
            "status": body.status,
            "priority": i,
            "created_at": now,
            "updated_at": now,
        }
        table.put_item(Item=item)
        items.append(item)
    return items


@router.post("/reorder", status_code=200)
def reorder_cards(
    items: list[CardReorderItem] = Body(...),
    user: str = Depends(verify_token),
):
    table = get_cards_table()
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        response = table.get_item(Key={"id": item.id})
        card = response.get("Item")
        if card:
            card["status"] = item.status
            card["priority"] = item.priority
            card["updated_at"] = now
            table.put_item(Item=card)
    return {"ok": True}


@router.get("/{card_id}", response_model=Card)
def get_card(card_id: str, user: str = Depends(verify_token)):
    table = get_cards_table()
    response = table.get_item(Key={"id": card_id})
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Card not found")
    return _normalize(item)


@router.put("/{card_id}", response_model=Card)
def update_card(card_id: str, body: CardUpdate, user: str = Depends(verify_token)):
    table = get_cards_table()
    response = table.get_item(Key={"id": card_id})
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Card not found")
    for k, v in body.model_dump(exclude_none=True).items():
        item[k] = v
    item["updated_at"] = datetime.now(timezone.utc).isoformat()
    table.put_item(Item=item)
    return _normalize(item)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: str, user: str = Depends(verify_token)):
    table = get_cards_table()
    if not table.get_item(Key={"id": card_id}).get("Item"):
        raise HTTPException(status_code=404, detail="Card not found")
    table.delete_item(Key={"id": card_id})
