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


def test_categories_no_auth_header(client):
    response = client.get("/api/categories/")
    assert response.status_code in (401, 403)


def test_categories_bad_token(client):
    response = client.get(
        "/api/categories/", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401
