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
