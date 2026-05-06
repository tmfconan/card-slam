from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import bcrypt

from .models import UserCreate, User
from auth.router import require_admin
from db import get_users_table, get_cards_table, get_categories_table

router = APIRouter(prefix="/admin/users", tags=["admin"])


@router.get("/", response_model=list[User])
def list_users(admin: str = Depends(require_admin)):
    table = get_users_table()
    items = table.scan().get("Items", [])
    return [{"username": u["username"], "role": u["role"], "created_at": u["created_at"]}
            for u in sorted(items, key=lambda x: x["created_at"])]


@router.post("/", response_model=User, status_code=201)
def create_user(body: UserCreate, admin: str = Depends(require_admin)):
    table = get_users_table()
    if table.get_item(Key={"username": body.username}).get("Item"):
        raise HTTPException(status_code=409, detail="Username already exists")

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    item = {
        "username": body.username,
        "password_hash": password_hash,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item)
    return {"username": item["username"], "role": item["role"], "created_at": item["created_at"]}


@router.delete("/{username}", status_code=204)
def delete_user(username: str, admin: str = Depends(require_admin)):
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the admin account")

    table = get_users_table()
    if not table.get_item(Key={"username": username}).get("Item"):
        raise HTTPException(status_code=404, detail="User not found")

    # Delete the user's cards
    cards_table = get_cards_table()
    from boto3.dynamodb.conditions import Attr
    for card in cards_table.scan(FilterExpression=Attr("username").eq(username)).get("Items", []):
        cards_table.delete_item(Key={"id": card["id"]})

    # Delete the user's categories
    cats_table = get_categories_table()
    for cat in cats_table.scan(FilterExpression=Attr("username").eq(username)).get("Items", []):
        cats_table.delete_item(Key={"id": cat["id"]})

    table.delete_item(Key={"username": username})
