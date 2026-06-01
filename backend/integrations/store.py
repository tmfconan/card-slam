"""App-wide integration credential storage (DynamoDB, secret encrypted at rest).

Credentials are OAuth-*app* credentials shared by all users, so they're stored
once per provider (partition key ``provider``). The ``client_id`` is a public
OAuth identifier (it appears in the authorize URL the browser sees) and is kept
in plaintext for display; the ``client_secret`` is encrypted via ``crypto``.
"""
from datetime import datetime, timezone

from db import get_integrations_table
from . import crypto

_ZOHO = "zoho"


def get_zoho_config_status() -> dict:
    """For the admin UI: whether Zoho is configured and its (non-secret) client_id."""
    item = get_integrations_table().get_item(Key={"provider": _ZOHO}).get("Item")
    if not item or not item.get("client_secret_encrypted"):
        return {"configured": False, "client_id": None}
    return {"configured": True, "client_id": item.get("client_id")}


def set_zoho_config(client_id: str, client_secret: str, updated_by: str) -> None:
    """Store the Zoho credentials. A blank ``client_secret`` keeps the existing
    encrypted secret (so the admin can edit the client_id without re-typing it)."""
    table = get_integrations_table()

    if client_secret:
        encrypted = crypto.encrypt(client_secret)
    else:
        existing = table.get_item(Key={"provider": _ZOHO}).get("Item") or {}
        encrypted = existing.get("client_secret_encrypted")
        if not encrypted:
            raise ValueError("client_secret is required")

    table.put_item(
        Item={
            "provider": _ZOHO,
            "client_id": client_id,
            "client_secret_encrypted": encrypted,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": updated_by,
        }
    )


def get_zoho_credentials() -> tuple:
    """Return ``(client_id, client_secret)`` for use by the OAuth flow, or
    ``(None, None)`` if Zoho is not configured."""
    item = get_integrations_table().get_item(Key={"provider": _ZOHO}).get("Item")
    if not item or not item.get("client_secret_encrypted"):
        return None, None
    return item.get("client_id"), crypto.decrypt(item["client_secret_encrypted"])


def delete_zoho_config() -> None:
    get_integrations_table().delete_item(Key={"provider": _ZOHO})
