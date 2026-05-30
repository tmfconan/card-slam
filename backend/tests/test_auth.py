from tests.conftest import TEST_PASSWORD, REGULAR_USER, REGULAR_PASSWORD


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_correct_username_and_password(client):
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert len(data["access_token"]) > 0


def test_login_wrong_password(client):
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_login_unknown_username(client):
    response = client.post(
        "/api/auth/login", json={"username": "nobody", "password": TEST_PASSWORD}
    )
    assert response.status_code == 401


def test_me_returns_username_and_role(client, auth_headers):
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"


def test_me_for_regular_user(client, user_auth_headers):
    response = client.get("/api/auth/me", headers=user_auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == REGULAR_USER
    assert data["role"] == "user"


def test_me_defaults_to_light_theme(client, auth_headers):
    """A user who has never chosen a theme defaults to light mode."""
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["theme"] == "light"


def test_update_theme_persists_across_requests(client, auth_headers):
    update = client.put(
        "/api/auth/me/theme", json={"theme": "dark"}, headers=auth_headers
    )
    assert update.status_code == 200
    assert update.json()["theme"] == "dark"

    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.json()["theme"] == "dark"

    # Switching back to light is equally persisted.
    client.put("/api/auth/me/theme", json={"theme": "light"}, headers=auth_headers)
    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.json()["theme"] == "light"


def test_update_theme_rejects_invalid_value(client, auth_headers):
    response = client.put(
        "/api/auth/me/theme", json={"theme": "neon"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_update_theme_requires_auth(client):
    response = client.put("/api/auth/me/theme", json={"theme": "dark"})
    assert response.status_code in (401, 403)


def test_theme_is_per_user(client, auth_headers, user_auth_headers):
    """One user's theme choice must not leak into another's."""
    client.put("/api/auth/me/theme", json={"theme": "dark"}, headers=auth_headers)

    other = client.get("/api/auth/me", headers=user_auth_headers)
    assert other.json()["theme"] == "light"


def test_categories_no_auth_header(client):
    response = client.get("/api/categories/")
    assert response.status_code in (401, 403)


def test_categories_bad_token(client):
    response = client.get(
        "/api/categories/", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401
