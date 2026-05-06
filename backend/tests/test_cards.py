import pytest


CARD_PAYLOAD = {
    "title": "Test Card",
    "description": "A test card description",
    "category_id": "cat-123",
    "status": "brainstorm",
    "priority": 0,
}


def test_list_empty(client, auth_headers):
    response = client.get("/api/cards/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_create_card(client, auth_headers):
    response = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == CARD_PAYLOAD["title"]
    assert data["description"] == CARD_PAYLOAD["description"]
    assert data["category_id"] == CARD_PAYLOAD["category_id"]
    assert data["status"] == CARD_PAYLOAD["status"]
    assert data["priority"] == CARD_PAYLOAD["priority"]
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_batch(client, auth_headers):
    batch = [
        {
            "title": f"Card {i}",
            "description": f"Description {i}",
            "category_id": "cat-123",
            "status": "brainstorm",
            "priority": 0,
        }
        for i in range(3)
    ]
    response = client.post("/api/cards/batch", json=batch, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data) == 3
    priorities = [item["priority"] for item in data]
    assert priorities == [0, 1, 2]


def test_update_card_status(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"status": "in_progress"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "in_progress"


def test_filter_by_status(client, auth_headers):
    client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "status": "brainstorm"},
        headers=auth_headers,
    )
    client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "title": "Done Card", "status": "done"},
        headers=auth_headers,
    )

    response = client.get("/api/cards/?status=brainstorm", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "brainstorm"


def test_filter_by_category_id(client, auth_headers):
    client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "category_id": "cat-aaa"},
        headers=auth_headers,
    )
    client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "title": "Other Category Card", "category_id": "cat-bbb"},
        headers=auth_headers,
    )

    response = client.get("/api/cards/?category_id=cat-aaa", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category_id"] == "cat-aaa"


def test_reorder_cards(client, auth_headers):
    batch = [
        {
            "title": f"Card {i}",
            "description": "",
            "category_id": "cat-123",
            "status": "brainstorm",
            "priority": 0,
        }
        for i in range(3)
    ]
    create_resp = client.post("/api/cards/batch", json=batch, headers=auth_headers)
    created = create_resp.json()

    # Reverse the priorities
    reorder_payload = [
        {"id": created[0]["id"], "status": "brainstorm", "priority": 2},
        {"id": created[1]["id"], "status": "brainstorm", "priority": 1},
        {"id": created[2]["id"], "status": "brainstorm", "priority": 0},
    ]
    reorder_resp = client.post(
        "/api/cards/reorder", json=reorder_payload, headers=auth_headers
    )
    assert reorder_resp.status_code == 200
    assert reorder_resp.json() == {"ok": True}

    # Verify priorities changed
    list_resp = client.get("/api/cards/", headers=auth_headers)
    cards = list_resp.json()
    id_to_priority = {c["id"]: c["priority"] for c in cards}
    assert id_to_priority[created[0]["id"]] == 2
    assert id_to_priority[created[1]["id"]] == 1
    assert id_to_priority[created[2]["id"]] == 0


def test_delete_card(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/cards/{card_id}", headers=auth_headers)
    assert delete_resp.status_code == 204

    list_resp = client.get("/api/cards/", headers=auth_headers)
    assert list_resp.json() == []


def test_delete_nonexistent_card(client, auth_headers):
    response = client.delete("/api/cards/does-not-exist", headers=auth_headers)
    assert response.status_code == 404


# ── todo_date tests ────────────────────────────────────────────────────────────

def test_create_card_with_todo_date(client, auth_headers):
    response = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "todo_date": "2026-05-10"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["todo_date"] == "2026-05-10"


def test_create_card_without_todo_date_is_null(client, auth_headers):
    response = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert response.status_code == 201
    assert response.json().get("todo_date") is None


def test_update_card_todo_date(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"todo_date": "2026-05-15"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["todo_date"] == "2026-05-15"


def test_clear_card_todo_date(client, auth_headers):
    create_resp = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "todo_date": "2026-05-10"},
        headers=auth_headers,
    )
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"todo_date": None},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json().get("todo_date") is None


def test_updated_at_changes_on_update(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card = create_resp.json()
    original_updated_at = card["updated_at"]

    import time; time.sleep(0.01)  # ensure timestamp differs

    update_resp = client.put(
        f"/api/cards/{card['id']}",
        json={"title": "Updated title"},
        headers=auth_headers,
    )
    assert update_resp.json()["updated_at"] != original_updated_at


# ── direct card creation tests (no AI) ────────────────────────────────────────

def test_create_card_with_all_statuses(client, auth_headers):
    from cards.models import Status
    for status in Status:
        resp = client.post(
            "/api/cards/",
            json={**CARD_PAYLOAD, "status": status.value},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == status.value


def test_create_card_defaults(client, auth_headers):
    """Minimal payload — status and priority should use defaults."""
    resp = client.post(
        "/api/cards/",
        json={"title": "Minimal", "description": "", "category_id": "cat-x"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "brainstorm"
    assert data["priority"] == 0
    assert data.get("todo_date") is None


# ── duration tests ─────────────────────────────────────────────────────────────

def test_create_card_default_duration_is_30(client, auth_headers):
    resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["duration"] == 30


def test_create_card_with_custom_duration(client, auth_headers):
    resp = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "duration": 90}, headers=auth_headers
    )
    assert resp.status_code == 201
    assert resp.json()["duration"] == 90


def test_update_card_duration(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}", json={"duration": 60}, headers=auth_headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["duration"] == 60


# ── todo_time tests ────────────────────────────────────────────────────────────

def test_create_card_with_todo_time(client, auth_headers):
    resp = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "todo_time": "09:00"}, headers=auth_headers
    )
    assert resp.status_code == 201
    assert resp.json()["todo_time"] == "09:00"


def test_create_card_without_todo_time_is_null(client, auth_headers):
    resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert resp.json().get("todo_time") is None


def test_update_card_todo_time(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}", json={"todo_time": "14:30"}, headers=auth_headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["todo_time"] == "14:30"


def test_clear_card_todo_time(client, auth_headers):
    create_resp = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "todo_time": "09:00"}, headers=auth_headers
    )
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}", json={"todo_time": None}, headers=auth_headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json().get("todo_time") is None


# ── batch status tests ─────────────────────────────────────────────────────────

def test_batch_status_update(client, auth_headers):
    batch = [
        {**CARD_PAYLOAD, "title": f"Card {i}", "status": "brainstorm"} for i in range(3)
    ]
    created = client.post("/api/cards/batch", json=batch, headers=auth_headers).json()
    ids = [c["id"] for c in created]

    resp = client.post(
        "/api/cards/batch-status",
        json={"ids": ids, "status": "in_progress"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 3

    cards = client.get("/api/cards/", headers=auth_headers).json()
    for card in cards:
        assert card["status"] == "in_progress"


def test_batch_status_update_empty_ids(client, auth_headers):
    resp = client.post(
        "/api/cards/batch-status",
        json={"ids": [], "status": "done"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0


def test_batch_status_skips_nonexistent_ids(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    real_id = create_resp.json()["id"]

    resp = client.post(
        "/api/cards/batch-status",
        json={"ids": [real_id, "does-not-exist"], "status": "done"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1


# ── User isolation tests ───────────────────────────────────────────────────────

def test_user_cannot_see_other_users_cards(client, auth_headers, user_auth_headers):
    """Admin's cards are invisible to regular user and vice versa."""
    # Admin creates a card
    client.post("/api/cards/", json={**CARD_PAYLOAD, "title": "Admin only card"}, headers=auth_headers)
    # Regular user cannot see it
    resp = client.get("/api/cards/", headers=user_auth_headers)
    titles = [c["title"] for c in resp.json()]
    assert "Admin only card" not in titles


def test_user_sees_only_their_own_cards(client, auth_headers, user_auth_headers):
    client.post("/api/cards/", json={**CARD_PAYLOAD, "title": "Admin card"}, headers=auth_headers)
    client.post("/api/cards/", json={**CARD_PAYLOAD, "title": "User card"}, headers=user_auth_headers)

    admin_titles = [c["title"] for c in client.get("/api/cards/", headers=auth_headers).json()]
    user_titles = [c["title"] for c in client.get("/api/cards/", headers=user_auth_headers).json()]

    assert "Admin card" in admin_titles
    assert "User card" not in admin_titles
    assert "User card" in user_titles
    assert "Admin card" not in user_titles


def test_user_cannot_update_another_users_card(client, auth_headers, user_auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]
    # Regular user cannot update admin's card
    resp = client.put(f"/api/cards/{card_id}", json={"title": "Hacked"}, headers=user_auth_headers)
    assert resp.status_code == 404


def test_user_cannot_delete_another_users_card(client, auth_headers, user_auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]
    resp = client.delete(f"/api/cards/{card_id}", headers=user_auth_headers)
    assert resp.status_code == 404
