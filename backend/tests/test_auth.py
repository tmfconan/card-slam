from tests.conftest import TEST_PASSWORD


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_correct_password(client):
    response = client.post("/api/auth/login", json={"password": TEST_PASSWORD})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert isinstance(data["access_token"], str)
    assert len(data["access_token"]) > 0


def test_login_wrong_password(client):
    response = client.post("/api/auth/login", json={"password": "wrong-password"})
    assert response.status_code == 401


def test_categories_no_auth_header(client):
    response = client.get("/api/categories/")
    # HTTPBearer returns 403 when the Authorization header is missing entirely
    assert response.status_code in (401, 403)


def test_categories_bad_token(client):
    response = client.get(
        "/api/categories/", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401
