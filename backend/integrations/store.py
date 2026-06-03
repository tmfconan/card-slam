"""Per-user integration credential storage (DynamoDB, secret encrypted at rest).

Each user supplies their *own* OAuth app credentials so they connect to their own
Zoho account rather than a single shared one. Credentials live on the user's
record in the users table: the ``client_id`` is a public OAuth identifier (it
appears in the authorize URL the browser sees) and is kept in plaintext for
display; the ``client_secret`` is encrypted via ``crypto``.
"""
from datetime import datetime, timezone

from db import get_users_table
from . import crypto


def get_zoho_config_status(username: str) -> dict:
    """For the user's integration UI: whether they've configured Zoho and their
    (non-secret) client_id."""
    item = get_users_table().get_item(Key={"username": username}).get("Item") or {}
    if not item.get("zoho_client_secret_encrypted"):
        return {"configured": False, "client_id": None}
    return {"configured": True, "client_id": item.get("zoho_client_id")}


def set_zoho_config(username: str, client_id: str, client_secret: str) -> None:
    """Store the user's Zoho credentials. A blank ``client_secret`` keeps the
    existing encrypted secret (so the user can edit the client_id without
    re-typing it)."""
    table = get_users_table()

    if client_secret:
        encrypted = crypto.encrypt(client_secret)
    else:
        existing = table.get_item(Key={"username": username}).get("Item") or {}
        encrypted = existing.get("zoho_client_secret_encrypted")
        if not encrypted:
            raise ValueError("client_secret is required")

    table.update_item(
        Key={"username": username},
        UpdateExpression=(
            "SET zoho_client_id = :c, zoho_client_secret_encrypted = :s, "
            "zoho_config_updated_at = :u"
        ),
        ExpressionAttributeValues={
            ":c": client_id,
            ":s": encrypted,
            ":u": datetime.now(timezone.utc).isoformat(),
        },
    )


def get_zoho_credentials(username: str) -> tuple:
    """Return ``(client_id, client_secret)`` for use by the OAuth flow, or
    ``(None, None)`` if the user hasn't configured Zoho."""
    item = get_users_table().get_item(Key={"username": username}).get("Item") or {}
    if not item.get("zoho_client_secret_encrypted"):
        return None, None
    return item.get("zoho_client_id"), crypto.decrypt(item["zoho_client_secret_encrypted"])


def delete_zoho_config(username: str) -> None:
    get_users_table().update_item(
        Key={"username": username},
        UpdateExpression=(
            "REMOVE zoho_client_id, zoho_client_secret_encrypted, zoho_config_updated_at"
        ),
    )
