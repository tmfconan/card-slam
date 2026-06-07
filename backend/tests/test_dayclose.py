import json
from unittest.mock import MagicMock, patch


DAY = "2026-06-02"


def _make_mock_client(text: str) -> MagicMock:
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=text)]
    mock_client_instance = MagicMock()
    mock_client_instance.messages.create.return_value = mock_message
    return MagicMock(return_value=mock_client_instance)


def _make_card(client, auth_headers, title, status, todo_date=None):
    body = {
        "title": title,
        "description": f"{title} description",
        "category_id": "cat-1",
        "status": status,
    }
    if todo_date is not None:
        body["todo_date"] = todo_date
    resp = client.post("/api/cards/", json=body, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Summary generation ──────────────────────────────────────────────────────

def test_summary_computes_completed_and_incomplete(client, auth_headers):
    _make_card(client, auth_headers, "Finished task", "done", DAY)
    _make_card(client, auth_headers, "Open task", "in_progress", DAY)
    # A card on another day must not appear in this day's summary.
    _make_card(client, auth_headers, "Other day", "done", "2026-06-01")

    mock_cls = _make_mock_client(json.dumps({"summary": "Solid day overall."}))
    with patch("anthropic.Anthropic", mock_cls):
        resp = client.post("/api/dayclose/summary", json={"date": DAY}, headers=auth_headers)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["summary"] == "Solid day overall."
    assert data["completed"] == ["Finished task"]
    assert data["incomplete"] == ["Open task"]


def test_summary_with_no_cards_skips_claude(client, auth_headers):
    # No Claude mock: if the endpoint called Claude it would error, proving the
    # empty-day short-circuit works without hitting the model.
    resp = client.post("/api/dayclose/summary", json={"date": DAY}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["completed"] == []
    assert data["incomplete"] == []
    assert "no work to summarize" in data["summary"].lower()


def test_summary_strips_markdown_fences(client, auth_headers):
    _make_card(client, auth_headers, "A task", "done", DAY)
    fenced = "```json\n" + json.dumps({"summary": "Wrapped up."}) + "\n```"
    mock_cls = _make_mock_client(fenced)
    with patch("anthropic.Anthropic", mock_cls):
        resp = client.post("/api/dayclose/summary", json={"date": DAY}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["summary"] == "Wrapped up."


def test_summary_invalid_date_returns_400(client, auth_headers):
    resp = client.post("/api/dayclose/summary", json={"date": "not-a-date"}, headers=auth_headers)
    assert resp.status_code == 400


def test_summary_invalid_claude_json_returns_502(client, auth_headers):
    _make_card(client, auth_headers, "A task", "in_progress", DAY)
    mock_cls = _make_mock_client("totally not json")
    with patch("anthropic.Anthropic", mock_cls):
        resp = client.post("/api/dayclose/summary", json={"date": DAY}, headers=auth_headers)
    assert resp.status_code == 502


# ── Saving / retrieving a closure ───────────────────────────────────────────

def test_save_requires_learning(client, auth_headers):
    resp = client.post(
        "/api/dayclose",
        json={"date": DAY, "learning": "   ", "ai_summary": "x"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_save_and_get_round_trip(client, auth_headers):
    save = client.post(
        "/api/dayclose",
        json={"date": DAY, "learning": "Batch similar work together.", "ai_summary": "Good day."},
        headers=auth_headers,
    )
    assert save.status_code == 201, save.text
    assert save.json()["learning"] == "Batch similar work together."

    got = client.get(f"/api/dayclose/{DAY}", headers=auth_headers)
    assert got.status_code == 200, got.text
    data = got.json()
    assert data["learning"] == "Batch similar work together."
    assert data["ai_summary"] == "Good day."
    assert data["date"] == DAY


def test_get_unclosed_day_returns_404(client, auth_headers):
    resp = client.get("/api/dayclose/2026-06-02", headers=auth_headers)
    assert resp.status_code == 404


def test_resaving_preserves_created_at(client, auth_headers):
    first = client.post(
        "/api/dayclose",
        json={"date": DAY, "learning": "First note."},
        headers=auth_headers,
    ).json()
    second = client.post(
        "/api/dayclose",
        json={"date": DAY, "learning": "Updated note."},
        headers=auth_headers,
    ).json()
    assert second["created_at"] == first["created_at"]
    assert second["learning"] == "Updated note."


def test_closures_are_per_user(client, auth_headers, user_auth_headers):
    client.post(
        "/api/dayclose",
        json={"date": DAY, "learning": "Admin learning."},
        headers=auth_headers,
    )
    # The regular user hasn't closed this day, so they see a 404.
    resp = client.get(f"/api/dayclose/{DAY}", headers=user_auth_headers)
    assert resp.status_code == 404


# ── Listing closed days ─────────────────────────────────────────────────────

def test_list_closed_days_returns_saved_dates(client, auth_headers):
    # Nothing closed yet.
    empty = client.get("/api/dayclose", headers=auth_headers)
    assert empty.status_code == 200, empty.text
    assert empty.json() == []

    for d in ("2026-06-01", "2026-06-03", "2026-06-02"):
        client.post(
            "/api/dayclose", json={"date": d, "learning": "note"}, headers=auth_headers
        )

    resp = client.get("/api/dayclose", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    # Sorted ascending regardless of insertion order.
    assert resp.json() == ["2026-06-01", "2026-06-02", "2026-06-03"]


def test_list_closed_days_respects_range(client, auth_headers):
    for d in ("2026-06-01", "2026-06-05", "2026-06-10"):
        client.post(
            "/api/dayclose", json={"date": d, "learning": "note"}, headers=auth_headers
        )

    resp = client.get(
        "/api/dayclose",
        params={"start": "2026-06-02", "end": "2026-06-09"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == ["2026-06-05"]


def test_list_closed_days_invalid_range_returns_400(client, auth_headers):
    resp = client.get(
        "/api/dayclose", params={"start": "nope"}, headers=auth_headers
    )
    assert resp.status_code == 400


def test_list_closed_days_is_per_user(client, auth_headers, user_auth_headers):
    client.post(
        "/api/dayclose", json={"date": DAY, "learning": "Admin note."}, headers=auth_headers
    )
    # The regular user has closed nothing.
    resp = client.get("/api/dayclose", headers=user_auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_requires_auth(client):
    assert client.post("/api/dayclose/summary", json={"date": DAY}).status_code in (401, 403)
    assert client.get(f"/api/dayclose/{DAY}").status_code in (401, 403)
    assert client.get("/api/dayclose").status_code in (401, 403)
    assert client.post("/api/dayclose", json={"date": DAY, "learning": "x"}).status_code in (401, 403)
