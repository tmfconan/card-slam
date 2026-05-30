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


# ── batch archive tests ─────────────────────────────────────────────────────────

def test_batch_archive(client, auth_headers):
    batch = [{**CARD_PAYLOAD, "title": f"Card {i}"} for i in range(3)]
    created = client.post("/api/cards/batch", json=batch, headers=auth_headers).json()
    ids = [c["id"] for c in created]

    resp = client.post(
        "/api/cards/batch-archive", json={"ids": ids}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 3

    # Archived cards drop out of the default listing
    active = client.get("/api/cards/", headers=auth_headers).json()
    assert all(c["id"] not in ids for c in active)
    # …and surface under the archived listing
    archived = client.get("/api/cards/?archived=true", headers=auth_headers).json()
    assert {c["id"] for c in archived} == set(ids)


def test_batch_archive_restore(client, auth_headers):
    created = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers).json()
    card_id = created["id"]
    client.post("/api/cards/batch-archive", json={"ids": [card_id]}, headers=auth_headers)

    resp = client.post(
        "/api/cards/batch-archive",
        json={"ids": [card_id], "archived": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    active = client.get("/api/cards/", headers=auth_headers).json()
    assert any(c["id"] == card_id for c in active)


def test_batch_archive_empty_ids(client, auth_headers):
    resp = client.post(
        "/api/cards/batch-archive", json={"ids": []}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0


def test_batch_archive_skips_other_users_cards(client, auth_headers, user_auth_headers):
    other = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "User card"}, headers=user_auth_headers
    ).json()

    resp = client.post(
        "/api/cards/batch-archive", json={"ids": [other["id"]]}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0
    # The other user's card remains active and untouched
    active = client.get("/api/cards/", headers=user_auth_headers).json()
    assert any(c["id"] == other["id"] for c in active)


# ── batch delete tests ──────────────────────────────────────────────────────────

def test_batch_delete(client, auth_headers):
    batch = [{**CARD_PAYLOAD, "title": f"Card {i}"} for i in range(3)]
    created = client.post("/api/cards/batch", json=batch, headers=auth_headers).json()
    ids = [c["id"] for c in created]

    resp = client.post(
        "/api/cards/batch-delete", json={"ids": ids}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 3

    for card_id in ids:
        assert client.get(f"/api/cards/{card_id}", headers=auth_headers).status_code == 404


def test_batch_delete_empty_ids(client, auth_headers):
    resp = client.post(
        "/api/cards/batch-delete", json={"ids": []}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0


def test_batch_delete_skips_nonexistent_ids(client, auth_headers):
    created = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers).json()
    real_id = created["id"]

    resp = client.post(
        "/api/cards/batch-delete",
        json={"ids": [real_id, "does-not-exist"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1


def test_batch_delete_skips_other_users_cards(client, auth_headers, user_auth_headers):
    other = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "User card"}, headers=user_auth_headers
    ).json()

    resp = client.post(
        "/api/cards/batch-delete", json={"ids": [other["id"]]}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0
    # The other user's card still exists
    assert client.get(f"/api/cards/{other['id']}", headers=user_auth_headers).status_code == 200


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


# ── high_priority tests ────────────────────────────────────────────────────────

def test_create_card_default_high_priority_is_false(client, auth_headers):
    resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["high_priority"] is False


def test_create_card_with_high_priority_true(client, auth_headers):
    resp = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "high_priority": True},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["high_priority"] is True


def test_update_card_set_high_priority(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"high_priority": True},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["high_priority"] is True


def test_update_card_clear_high_priority(client, auth_headers):
    create_resp = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "high_priority": True},
        headers=auth_headers,
    )
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"high_priority": False},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["high_priority"] is False


def test_high_priority_persists_across_get(client, auth_headers):
    create_resp = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "high_priority": True},
        headers=auth_headers,
    )
    card_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/cards/{card_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["high_priority"] is True


# ── auto_merge tests ───────────────────────────────────────────────────────

def test_create_card_default_auto_merge_is_false(client, auth_headers):
    resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["auto_merge"] is False


def test_create_card_with_auto_merge_true(client, auth_headers):
    resp = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "auto_merge": True},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["auto_merge"] is True


def test_update_card_set_auto_merge(client, auth_headers):
    card_id = client.post(
        "/api/cards/", json=CARD_PAYLOAD, headers=auth_headers
    ).json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"auto_merge": True},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["auto_merge"] is True


def test_update_card_clear_auto_merge(client, auth_headers):
    card_id = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "auto_merge": True},
        headers=auth_headers,
    ).json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}",
        json={"auto_merge": False},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["auto_merge"] is False


def test_auto_merge_persists_across_get(client, auth_headers):
    card_id = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "auto_merge": True},
        headers=auth_headers,
    ).json()["id"]

    get_resp = client.get(f"/api/cards/{card_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["auto_merge"] is True


# ── Archived cards ──────────────────────────────────────────────────────────


def test_new_card_is_not_archived(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    assert create_resp.status_code == 201
    assert create_resp.json()["archived"] is False


def test_archive_card_via_update(client, auth_headers):
    create_resp = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers)
    card_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/cards/{card_id}", json={"archived": True}, headers=auth_headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["archived"] is True


def test_archived_cards_excluded_from_default_list(client, auth_headers):
    active = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "Active"}, headers=auth_headers
    ).json()
    archived = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "Archived"}, headers=auth_headers
    ).json()
    client.put(
        f"/api/cards/{archived['id']}", json={"archived": True}, headers=auth_headers
    )

    resp = client.get("/api/cards/", headers=auth_headers)
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert active["id"] in ids
    assert archived["id"] not in ids


def test_list_archived_cards(client, auth_headers):
    client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "Active"}, headers=auth_headers
    )
    archived = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": "Archived"}, headers=auth_headers
    ).json()
    client.put(
        f"/api/cards/{archived['id']}", json={"archived": True}, headers=auth_headers
    )

    resp = client.get("/api/cards/?archived=true", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == archived["id"]
    assert data[0]["archived"] is True


def test_unarchive_restores_card_to_default_list(client, auth_headers):
    card = client.post("/api/cards/", json=CARD_PAYLOAD, headers=auth_headers).json()
    client.put(f"/api/cards/{card['id']}", json={"archived": True}, headers=auth_headers)

    # Confirm it is hidden from the active list
    assert client.get("/api/cards/", headers=auth_headers).json() == []

    # Restore it
    restore = client.put(
        f"/api/cards/{card['id']}", json={"archived": False}, headers=auth_headers
    )
    assert restore.status_code == 200
    assert restore.json()["archived"] is False

    active_ids = [c["id"] for c in client.get("/api/cards/", headers=auth_headers).json()]
    assert card["id"] in active_ids
    assert client.get("/api/cards/?archived=true", headers=auth_headers).json() == []


def test_archived_status_filter_combine(client, auth_headers):
    """The archived flag and status filter combine correctly."""
    archived = client.post(
        "/api/cards/",
        json={**CARD_PAYLOAD, "title": "Archived done", "status": "done"},
        headers=auth_headers,
    ).json()
    client.put(
        f"/api/cards/{archived['id']}", json={"archived": True}, headers=auth_headers
    )

    # Archived list filtered to done returns it; brainstorm returns nothing
    done = client.get("/api/cards/?archived=true&status=done", headers=auth_headers)
    assert [c["id"] for c in done.json()] == [archived["id"]]
    brainstorm = client.get(
        "/api/cards/?archived=true&status=brainstorm", headers=auth_headers
    )
    assert brainstorm.json() == []


# --- Wait for merge -------------------------------------------------------

def _set_fr_status(dynamo_tables, card_id, status):
    """Set a card's feature-request status directly (not exposed via the API)."""
    table = dynamo_tables.Table("card-slam-cards")
    table.update_item(
        Key={"id": card_id},
        UpdateExpression="SET is_feature_request = :t, feature_request_status = :s",
        ExpressionAttributeValues={":t": True, ":s": status},
    )


def _make_fr(client, auth_headers, dynamo_tables, title, status):
    card = client.post(
        "/api/cards/", json={**CARD_PAYLOAD, "title": title}, headers=auth_headers
    ).json()
    _set_fr_status(dynamo_tables, card["id"], status)
    return card["id"]


def _listed(client, auth_headers):
    return {c["id"]: c for c in client.get("/api/cards/", headers=auth_headers).json()}


def test_queued_fr_waits_for_merge_when_deploy_unmerged(client, auth_headers, dynamo_tables):
    """A queued feature request is shown as waiting_for_merge while another
    request is build-deployed (completed) but not yet merged."""
    queued = _make_fr(client, auth_headers, dynamo_tables, "Queued FR", "queued")
    deployed = _make_fr(client, auth_headers, dynamo_tables, "Deployed FR", "completed")

    cards = _listed(client, auth_headers)
    assert cards[queued]["feature_request_status"] == "waiting_for_merge"
    # The deployed card itself is unaffected
    assert cards[deployed]["feature_request_status"] == "completed"


def test_queued_fr_stays_queued_without_unmerged_deploy(client, auth_headers, dynamo_tables):
    """With no deployed-but-unmerged request, queued stays queued."""
    queued = _make_fr(client, auth_headers, dynamo_tables, "Queued FR", "queued")

    cards = _listed(client, auth_headers)
    assert cards[queued]["feature_request_status"] == "queued"


def test_merged_deploy_does_not_block_queue(client, auth_headers, dynamo_tables):
    """A request that is already merged does not hold up the queue."""
    queued = _make_fr(client, auth_headers, dynamo_tables, "Queued FR", "queued")
    _make_fr(client, auth_headers, dynamo_tables, "Merged FR", "merged")

    cards = _listed(client, auth_headers)
    assert cards[queued]["feature_request_status"] == "queued"


def test_wait_for_merge_is_presentational_only(client, auth_headers, dynamo_tables):
    """The derivation does not mutate the stored status — it remains queued."""
    queued = _make_fr(client, auth_headers, dynamo_tables, "Queued FR", "queued")
    _make_fr(client, auth_headers, dynamo_tables, "Deployed FR", "completed")

    # Listing shows waiting_for_merge...
    assert _listed(client, auth_headers)[queued]["feature_request_status"] == "waiting_for_merge"
    # ...but the persisted record is still queued
    stored = dynamo_tables.Table("card-slam-cards").get_item(Key={"id": queued}).get("Item")
    assert stored["feature_request_status"] == "queued"
