from fastapi import APIRouter, HTTPException, Depends
import uuid
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr

from .models import CategoryCreate, CategoryUpdate, Category
from auth.router import verify_token
from db import get_categories_table

router = APIRouter(prefix="/categories", tags=["categories"])


def _owned(item: dict, username: str) -> bool:
    return item.get("username", "admin") == username


@router.get("/", response_model=list[Category])
def list_categories(username: str = Depends(verify_token)):
    table = get_categories_table()
    items = table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    # Also include legacy records (no username) attributed to admin
    if username == "admin":
        legacy = [i for i in table.scan().get("Items", []) if "username" not in i]
        items = items + legacy
    return sorted(items, key=lambda x: x["created_at"])


@router.post("/", response_model=Category, status_code=201)
def create_category(body: CategoryCreate, username: str = Depends(verify_token)):
    table = get_categories_table()
    item = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": body.name,
        "color": body.color,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item)
    return item


@router.put("/{category_id}", response_model=Category)
def update_category(
    category_id: str, body: CategoryUpdate, username: str = Depends(verify_token)
):
    table = get_categories_table()
    item = table.get_item(Key={"id": category_id}).get("Item")
    if not item or not _owned(item, username):
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump(exclude_none=True).items():
        item[k] = v
    table.put_item(Item=item)
    return item


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, username: str = Depends(verify_token)):
    table = get_categories_table()
    item = table.get_item(Key={"id": category_id}).get("Item")
    if not item or not _owned(item, username):
        raise HTTPException(status_code=404, detail="Category not found")
    table.delete_item(Key={"id": category_id})
