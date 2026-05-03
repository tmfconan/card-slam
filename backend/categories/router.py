from fastapi import APIRouter, HTTPException, Depends
import uuid
from datetime import datetime, timezone

from .models import CategoryCreate, CategoryUpdate, Category
from auth.router import verify_token
from db import get_categories_table

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[Category])
def list_categories(user: str = Depends(verify_token)):
    table = get_categories_table()
    result = table.scan()
    items = result.get("Items", [])
    return sorted(items, key=lambda x: x["created_at"])


@router.post("/", response_model=Category, status_code=201)
def create_category(body: CategoryCreate, user: str = Depends(verify_token)):
    table = get_categories_table()
    item = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "color": body.color,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item)
    return item


@router.put("/{category_id}", response_model=Category)
def update_category(
    category_id: str, body: CategoryUpdate, user: str = Depends(verify_token)
):
    table = get_categories_table()
    response = table.get_item(Key={"id": category_id})
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump(exclude_none=True).items():
        item[k] = v
    table.put_item(Item=item)
    return item


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, user: str = Depends(verify_token)):
    table = get_categories_table()
    if not table.get_item(Key={"id": category_id}).get("Item"):
        raise HTTPException(status_code=404, detail="Category not found")
    table.delete_item(Key={"id": category_id})
