from tests.conftest import TEST_PASSWORD, REGULAR_USER, REGULAR_PASSWORD


# ── Admin user management ──────────────────────────────────────────────────────

def test_admin_can_create_user(client, auth_headers):
    resp = client.post(
        "/api/admin/users",
        json={"username": "newuser", "password": "newpass123"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "newuser"
    assert data["role"] == "user"
    assert "password_hash" not in data


def test_admin_can_list_users(client, auth_headers):
    resp = client.get("/api/admin/users", headers=auth_headers)
    assert resp.status_code == 200
    usernames = [u["username"] for u in resp.json()]
    assert "admin" in usernames


def test_created_user_appears_in_list(client, auth_headers):
    client.post(
        "/api/admin/users",
        json={"username": "alice", "password": "pass"},
        headers=auth_headers,
    )
    resp = client.get("/api/admin/users", headers=auth_headers)
    usernames = [u["username"] for u in resp.json()]
    assert "alice" in usernames


def test_admin_can_delete_user(client, auth_headers, user_auth_headers):
    resp = client.delete(f"/api/admin/users/{REGULAR_USER}", headers=auth_headers)
    assert resp.status_code == 204

    # User no longer appears in list
    list_resp = client.get("/api/admin/users", headers=auth_headers)
    usernames = [u["username"] for u in list_resp.json()]
    assert REGULAR_USER not in usernames


def test_deleting_user_removes_their_cards(client, auth_headers, user_auth_headers):
    # Regular user creates a card
    client.post(
        "/api/cards/",
        json={"title": "User card", "description": "", "category_id": "cat-x"},
        headers=user_auth_headers,
    )
    # Admin deletes the user
    client.delete(f"/api/admin/users/{REGULAR_USER}", headers=auth_headers)
    # Card is gone
    cards = client.get("/api/cards/", headers=auth_headers).json()
    assert all(c["title"] != "User card" for c in cards)


def test_deleting_user_removes_their_categories(client, auth_headers, user_auth_headers):
    client.post(
        "/api/categories/",
        json={"name": "User cat", "color": "#ff0000"},
        headers=user_auth_headers,
    )
    client.delete(f"/api/admin/users/{REGULAR_USER}", headers=auth_headers)
    cats = client.get("/api/categories/", headers=auth_headers).json()
    assert all(c["name"] != "User cat" for c in cats)


def test_cannot_create_duplicate_username(client, auth_headers):
    client.post(
        "/api/admin/users",
        json={"username": "dup", "password": "pass"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/admin/users",
        json={"username": "dup", "password": "pass2"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


def test_cannot_delete_admin(client, auth_headers):
    resp = client.delete("/api/admin/users/admin", headers=auth_headers)
    assert resp.status_code == 400


def test_delete_nonexistent_user_returns_404(client, auth_headers):
    resp = client.delete("/api/admin/users/ghost", headers=auth_headers)
    assert resp.status_code == 404


# ── Non-admin access denied ────────────────────────────────────────────────────

def test_regular_user_cannot_create_users(client, user_auth_headers):
    resp = client.post(
        "/api/admin/users",
        json={"username": "hacker", "password": "pass"},
        headers=user_auth_headers,
    )
    assert resp.status_code == 403


def test_regular_user_cannot_list_users(client, user_auth_headers):
    resp = client.get("/api/admin/users", headers=user_auth_headers)
    assert resp.status_code == 403


def test_regular_user_cannot_delete_users(client, auth_headers, user_auth_headers):
    resp = client.delete(
        "/api/admin/users/admin", headers=user_auth_headers
    )
    assert resp.status_code == 403


# ── New user can log in ────────────────────────────────────────────────────────

def test_created_user_can_login(client, auth_headers):
    client.post(
        "/api/admin/users",
        json={"username": "logintest", "password": "mypass"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/auth/login", json={"username": "logintest", "password": "mypass"}
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_created_user_cannot_login_with_wrong_password(client, auth_headers):
    client.post(
        "/api/admin/users",
        json={"username": "logintest2", "password": "correctpass"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/auth/login", json={"username": "logintest2", "password": "wrongpass"}
    )
    assert resp.status_code == 401
