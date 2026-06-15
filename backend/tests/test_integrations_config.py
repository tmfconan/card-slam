"""Tests for per-user, encrypted Zoho credential storage."""
import pytest


# ── crypto round-trip ────────────────────────────────────────────────────────

def test_crypto_round_trip():
    from integrations import crypto

    assert crypto.decrypt(crypto.encrypt("hunter2")) == "hunter2"


def test_crypto_ciphertext_is_not_plaintext():
    from integrations import crypto

    token = crypto.encrypt("super-secret")
    assert "super-secret" not in token


# ── store: set / get / update / delete (per user) ────────────────────────────

def test_set_and_get_zoho_credentials(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    assert store.get_zoho_credentials("admin") == ("client-123", "secret-xyz")


def test_credentials_are_isolated_per_user(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "admin-client", "admin-secret")
    store.set_zoho_config("alice", "alice-client", "alice-secret")

    assert store.get_zoho_credentials("admin") == ("admin-client", "admin-secret")
    assert store.get_zoho_credentials("alice") == ("alice-client", "alice-secret")


def test_unconfigured_user_has_no_credentials(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    # A different user who never configured Zoho sees nothing.
    assert store.get_zoho_credentials("alice") == (None, None)
    assert store.get_zoho_config_status("alice")["configured"] is False


def test_status_never_exposes_secret(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    assert store.get_zoho_config_status("admin") == {
        "configured": True,
        "client_id": "client-123",
    }


def test_blank_secret_on_update_keeps_existing(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    store.set_zoho_config("admin", "client-456", "")  # change id, keep secret

    client_id, secret = store.get_zoho_credentials("admin")
    assert client_id == "client-456"
    assert secret == "secret-xyz"


def test_new_config_requires_secret(dynamo_tables):
    from integrations import store

    with pytest.raises(ValueError):
        store.set_zoho_config("admin", "client-123", "")


def test_delete_clears_config(dynamo_tables):
    from integrations import store

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    store.delete_zoho_config("admin")

    assert store.get_zoho_credentials("admin") == (None, None)
    assert store.get_zoho_config_status("admin")["configured"] is False


def test_secret_is_stored_encrypted(dynamo_tables):
    from integrations import store
    from db import get_users_table

    store.set_zoho_config("admin", "client-123", "secret-xyz")
    item = get_users_table().get_item(Key={"username": "admin"})["Item"]

    assert "zoho_client_secret" not in item        # only the encrypted field is stored
    assert "secret-xyz" not in item["zoho_client_secret_encrypted"]


# ── per-user endpoints ───────────────────────────────────────────────────────

_CONFIG_URL = "/api/integrations/zoho/config"


def test_config_requires_authentication(client):
    assert client.get(_CONFIG_URL).status_code in (401, 403)


def test_regular_user_configures_and_status_hides_secret(client, user_auth_headers):
    put = client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": "sec"},
        headers=user_auth_headers,
    )
    assert put.status_code == 200
    assert put.json() == {"configured": True, "client_id": "cid"}

    get = client.get(_CONFIG_URL, headers=user_auth_headers)
    assert get.json() == {"configured": True, "client_id": "cid"}


def test_each_user_sees_only_their_own_config(client, auth_headers, user_auth_headers):
    client.put(
        _CONFIG_URL,
        json={"client_id": "admin-cid", "client_secret": "admin-sec"},
        headers=auth_headers,
    )
    client.put(
        _CONFIG_URL,
        json={"client_id": "user-cid", "client_secret": "user-sec"},
        headers=user_auth_headers,
    )

    assert client.get(_CONFIG_URL, headers=auth_headers).json()["client_id"] == "admin-cid"
    assert client.get(_CONFIG_URL, headers=user_auth_headers).json()["client_id"] == "user-cid"


def test_new_config_without_secret_is_rejected(client, user_auth_headers):
    resp = client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": ""},
        headers=user_auth_headers,
    )
    assert resp.status_code == 400


def test_user_deletes_config(client, user_auth_headers):
    client.put(
        _CONFIG_URL,
        json={"client_id": "cid", "client_secret": "sec"},
        headers=user_auth_headers,
    )
    assert client.delete(_CONFIG_URL, headers=user_auth_headers).status_code == 200
    assert client.get(_CONFIG_URL, headers=user_auth_headers).json()["configured"] is False
