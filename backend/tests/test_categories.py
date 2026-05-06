def test_list_empty(client, auth_headers):
    response = client.get("/api/categories/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_category(client, auth_headers):
    payload = {"name": "Backend", "color": "#3b82f6"}
    response = client.post("/api/categories/", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Backend"
    assert data["color"] == "#3b82f6"
    assert "id" in data
    assert "created_at" in data


def test_list_after_create(client, auth_headers):
    client.post(
        "/api/categories/",
        json={"name": "Frontend", "color": "#22c55e"},
        headers=auth_headers,
    )
    response = client.get("/api/categories/", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_update_category(client, auth_headers):
    create_resp = client.post(
        "/api/categories/",
        json={"name": "Old Name", "color": "#ef4444"},
        headers=auth_headers,
    )
    cat_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/categories/{cat_id}",
        json={"name": "New Name", "color": "#8b5cf6"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["name"] == "New Name"
    assert data["color"] == "#8b5cf6"
    assert data["id"] == cat_id


def test_update_nonexistent_category(client, auth_headers):
    response = client.put(
        "/api/categories/does-not-exist",
        json={"name": "Ghost", "color": "#000000"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_delete_category(client, auth_headers):
    create_resp = client.post(
        "/api/categories/",
        json={"name": "To Delete", "color": "#f97316"},
        headers=auth_headers,
    )
    cat_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/categories/{cat_id}", headers=auth_headers)
    assert delete_resp.status_code == 204

    list_resp = client.get("/api/categories/", headers=auth_headers)
    assert list_resp.json() == []


def test_delete_nonexistent_category(client, auth_headers):
    response = client.delete("/api/categories/does-not-exist", headers=auth_headers)
    assert response.status_code == 404


# ── User isolation tests ───────────────────────────────────────────────────────

def test_user_cannot_see_other_users_categories(client, auth_headers, user_auth_headers):
    client.post("/api/categories/", json={"name": "Admin cat", "color": "#000"}, headers=auth_headers)
    cats = client.get("/api/categories/", headers=user_auth_headers).json()
    assert all(c["name"] != "Admin cat" for c in cats)


def test_user_sees_only_their_own_categories(client, auth_headers, user_auth_headers):
    client.post("/api/categories/", json={"name": "Admin cat", "color": "#111"}, headers=auth_headers)
    client.post("/api/categories/", json={"name": "User cat", "color": "#222"}, headers=user_auth_headers)

    admin_names = [c["name"] for c in client.get("/api/categories/", headers=auth_headers).json()]
    user_names = [c["name"] for c in client.get("/api/categories/", headers=user_auth_headers).json()]

    assert "Admin cat" in admin_names and "User cat" not in admin_names
    assert "User cat" in user_names and "Admin cat" not in user_names
