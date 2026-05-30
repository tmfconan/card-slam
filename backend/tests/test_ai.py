import json
from unittest.mock import MagicMock, patch


PARSE_PAYLOAD = {
    "prompt": "Build a login page with email and password fields",
    "category_id": "cat-123",
}

VALID_ITEMS = [
    {"title": "Create login form", "description": "Build the HTML form with email and password inputs."},
    {"title": "Add form validation", "description": "Validate that email is valid and password is non-empty."},
]


def _make_mock_client(text: str) -> MagicMock:
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=text)]

    mock_client_instance = MagicMock()
    mock_client_instance.messages.create.return_value = mock_message

    mock_anthropic_cls = MagicMock(return_value=mock_client_instance)
    return mock_anthropic_cls


def test_parse_returns_items_for_valid_json(client, auth_headers):
    raw_text = json.dumps(VALID_ITEMS)
    mock_cls = _make_mock_client(raw_text)

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/parse", json=PARSE_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 2
    assert data["items"][0]["title"] == VALID_ITEMS[0]["title"]
    assert data["items"][1]["title"] == VALID_ITEMS[1]["title"]


def test_parse_strips_markdown_code_fences(client, auth_headers):
    fenced_text = "```json\n" + json.dumps(VALID_ITEMS) + "\n```"
    mock_cls = _make_mock_client(fenced_text)

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/parse", json=PARSE_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["items"][0]["title"] == VALID_ITEMS[0]["title"]


def test_parse_returns_502_for_invalid_json(client, auth_headers):
    mock_cls = _make_mock_client("this is not valid json at all")

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/parse", json=PARSE_PAYLOAD, headers=auth_headers)

    assert response.status_code == 502
    assert "invalid JSON" in response.json()["detail"]


# ── Weekly Plan Assist ─────────────────────────────────────────────────────

PLAN_PAYLOAD = {"week_start": "2026-06-01", "days": 7}


def _make_card(client, auth_headers, title, status):
    resp = client.post(
        "/api/cards/",
        json={
            "title": title,
            "description": f"{title} description",
            "category_id": "cat-1",
            "status": status,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_suggest_plan_returns_items(client, auth_headers):
    intent_id = _make_card(client, auth_headers, "Intent card", "intent_to_do")
    ready_id = _make_card(client, auth_headers, "Ready card", "ready_to_do")

    plan = [
        {"card_id": intent_id, "todo_date": "2026-06-02", "todo_time": "09:00", "reason": "a"},
        {"card_id": ready_id, "todo_date": "2026-06-01", "todo_time": "10:30", "reason": "b"},
    ]
    mock_cls = _make_mock_client(json.dumps(plan))

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    by_id = {i["card_id"]: i for i in items}
    assert by_id[ready_id]["todo_date"] == "2026-06-01"
    assert by_id[ready_id]["todo_time"] == "10:30"
    assert by_id[ready_id]["title"] == "Ready card"


def test_suggest_plan_excludes_non_plannable_statuses(client, auth_headers):
    # Only intent_to_do / ready_to_do should be sent to the planner.
    _make_card(client, auth_headers, "Brainstorm card", "brainstorm")
    _make_card(client, auth_headers, "Done card", "done")
    intent_id = _make_card(client, auth_headers, "Intent card", "intent_to_do")

    captured = {}

    def fake_create(**kwargs):
        captured["content"] = kwargs["messages"][0]["content"]
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps([
            {"card_id": intent_id, "todo_date": "2026-06-02", "todo_time": "08:00", "reason": "x"}
        ]))]
        return mock_message

    mock_instance = MagicMock()
    mock_instance.messages.create.side_effect = fake_create
    mock_cls = MagicMock(return_value=mock_instance)

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    assert "Intent card" in captured["content"]
    assert "Brainstorm card" not in captured["content"]
    assert "Done card" not in captured["content"]


def test_suggest_plan_empty_when_no_plannable_cards(client, auth_headers):
    _make_card(client, auth_headers, "Brainstorm card", "brainstorm")

    # No LLM call should happen; an exploding mock proves it.
    mock_cls = MagicMock(side_effect=AssertionError("LLM should not be called"))
    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_suggest_plan_ignores_unknown_card_ids(client, auth_headers):
    intent_id = _make_card(client, auth_headers, "Intent card", "intent_to_do")

    plan = [
        {"card_id": intent_id, "todo_date": "2026-06-02", "todo_time": "09:00", "reason": "a"},
        {"card_id": "made-up-id", "todo_date": "2026-06-03", "todo_time": "11:00", "reason": "b"},
    ]
    mock_cls = _make_mock_client(json.dumps(plan))

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["card_id"] == intent_id


def test_suggest_plan_returns_502_for_invalid_json(client, auth_headers):
    _make_card(client, auth_headers, "Intent card", "intent_to_do")
    mock_cls = _make_mock_client("not valid json")

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 502


def test_suggest_plan_does_not_use_other_users_cards(client, auth_headers, user_auth_headers):
    # A card owned by the regular user must not appear in admin's plan input.
    _make_card(client, user_auth_headers, "User-only intent card", "intent_to_do")
    admin_intent = _make_card(client, auth_headers, "Admin intent card", "intent_to_do")

    captured = {}

    def fake_create(**kwargs):
        captured["content"] = kwargs["messages"][0]["content"]
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps([
            {"card_id": admin_intent, "todo_date": "2026-06-02", "todo_time": "08:00", "reason": "x"}
        ]))]
        return mock_message

    mock_instance = MagicMock()
    mock_instance.messages.create.side_effect = fake_create
    mock_cls = MagicMock(return_value=mock_instance)

    with patch("anthropic.Anthropic", mock_cls):
        response = client.post("/api/ai/suggest-plan", json=PLAN_PAYLOAD, headers=auth_headers)

    assert response.status_code == 200
    assert "Admin intent card" in captured["content"]
    assert "User-only intent card" not in captured["content"]
