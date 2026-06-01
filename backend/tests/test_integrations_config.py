"""Tests for admin-managed, encrypted Zoho credential storage."""
import pytest


# ── crypto round-trip ────────────────────────────────────────────────────────

def test_crypto_round_trip():
    from integrations import crypto

    assert crypto.decrypt(crypto.encrypt("hunter2")) == "hunter2"


def test_crypto_ciphertext_is_not_plaintext():
    from integrations import crypto

    token = crypto.encrypt("super-secret")
    assert "super-secret" not in token


# ── store: set / get / update / delete ───────────────────────────────────────

def test_set_and_get_zoho_credentials(dynamo_tables):
    from integrations import store

    store.set_zoho_config("client-123", "secret-xyz", "admin")
    assert store.get_zoho_credentials() == ("client-123", "secret-xyz")


def test_status_never_exposes_secret(dynamo_tables):
    from integrations import store

    store.set_zoho_config("client-123", "secret-xyz", "admin")
    assert store.get_zoho_config_status() == {"configured": True, "client_id": "client-123"}


def test_blank_secret_on_update_keeps_existing(dynamo_tables):
    from integrations import store

    store.set_zoho_config("client-123", "secret-xyz", "admin")
    store.set_zoho_config("client-456", "", "admin")  # change id, keep secret

    client_id, secret = store.get_zoho_credentials()
    assert client_id == "client-456"
    assert secret == "secret-xyz"


def test_new_config_requires_secret(dynamo_tables):
    from integrations import store

    with pytest.raises(ValueError):
        store.set_zoho_config("client-123", "", "admin")


def test_delete_clears_config(dynamo_tables):
    from integrations import store

    store.set_zoho_config("client-123", "secret-xyz", "admin")
    store.delete_zoho_config()

    assert store.get_zoho_credentials() == (None, None)
    assert store.get_zoho_config_status()["configured"] is False


def test_secret_is_stored_encrypted(dynamo_tables):
    from integrations import store
    from db import get_integrations_table

    store.set_zoho_config("client-123", "secret-xyz", "admin")
    item = get_integrations_table().get_item(Key={"provider": "zoho"})["Item"]

    assert "client_secret" not in item              # only the encrypted field is stored
    assert "secret-xyz" not in item["client_secret_encrypted"]


# ── admin endpoints ──────────────────────────────────────────────────────────

_CONFIG_URL = "/api/integrations/admin/zoho/config"


def test_get_config_requires_admin(client, user_auth_headers):
    assert client.get(_CONFIG_URL, headers=user_auth_headers).status_code == 403


def test_put_config_requires_admin(client, user_auth_headers):
    resp = client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": "sec"},
        headers=user_auth_headers,
    )
    assert resp.status_code == 403


def test_admin_configures_and_status_hides_secret(client, auth_headers):
    put = client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": "sec"},
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json() == {"configured": True, "client_id": "cid"}

    get = client.get(_CONFIG_URL, headers=auth_headers)
    assert get.json() == {"configured": True, "client_id": "cid"}


def test_admin_deletes_config(client, auth_headers):
    client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": "sec"},
        headers=auth_headers,
    )
    assert client.delete(_CONFIG_URL, headers=auth_headers).status_code == 200
    assert client.get(_CONFIG_URL, headers=auth_headers).json()["configured"] is False
