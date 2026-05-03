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
