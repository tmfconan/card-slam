"""Tests for the Zoho integration: event parsing and sync create/update/skip."""
import boto3
import pytest
from moto import mock_aws


# ── parse_event (pure) ───────────────────────────────────────────────────────

def test_parse_timed_event():
    from integrations.service import parse_event

    parsed = parse_event(
        {
            "uid": "e1",
            "title": "Standup",
            "description": "Daily sync",
            "start": "20240115T100000",
            "end": "20240115T103000",
        }
    )
    assert parsed == {
        "title": "Standup",
        "description": "Daily sync",
        "todo_date": "2024-01-15",
        "todo_time": "10:00",
        "duration": 30,
    }


def test_parse_timed_event_rounds_duration_up_to_minimum():
    from integrations.service import parse_event

    parsed = parse_event(
        {"uid": "e2", "title": "Quick", "start": "20240115T100000", "end": "20240115T100500"}
    )
    assert parsed["duration"] == 30   # 5 minutes -> clamped to 30


def test_parse_long_event_keeps_real_duration():
    from integrations.service import parse_event

    parsed = parse_event(
        {"uid": "e3", "title": "Workshop", "start": "20240115T090000", "end": "20240115T110000"}
    )
    assert parsed["duration"] == 120


def test_parse_all_day_event_has_no_time():
    from integrations.service import parse_event

    parsed = parse_event(
        {"uid": "e4", "title": "Holiday", "start": "20240115", "end": "20240116"}
    )
    assert parsed["todo_date"] == "2024-01-15"
    assert parsed["todo_time"] is None
    assert parsed["duration"] == 30


def test_parse_missing_title_falls_back():
    from integrations.service import parse_event

    parsed = parse_event({"uid": "e5", "start": "20240115T100000", "end": "20240115T103000"})
    assert parsed["title"] == "(untitled event)"


def test_parse_reads_nested_dateandtime():
    from integrations.service import parse_event

    parsed = parse_event(
        {
            "uid": "e6",
            "title": "Sync",
            "dateandtime": {
                "start": "20240115T100000+0530",
                "end": "20240115T110000+0530",
                "timezone": "Asia/Kolkata",
            },
        }
    )
    assert parsed["todo_date"] == "2024-01-15"
    assert parsed["todo_time"] == "10:00"
    assert parsed["duration"] == 60


def test_parse_event_without_start_returns_none():
    from integrations.service import parse_event

    assert parse_event({"uid": "e7", "title": "No date"}) is None


# ── sync_calendar (create / update / skip) ───────────────────────────────────

@pytest.fixture
def dynamo(monkeypatch):
    monkeypatch.setenv("CARDS_TABLE", "card-slam-cards")
    monkeypatch.setenv("USERS_TABLE", "card-slam-users")
    with mock_aws():
        import db
        db._dynamodb.cache_clear()
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        resource.create_table(
            TableName="card-slam-cards",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield resource
        db._dynamodb.cache_clear()


def _events():
    return [
        {"uid": "evt-1", "title": "Meeting", "description": "Notes",
         "start": "20240115T100000", "end": "20240115T110000"},
    ]


def test_sync_creates_card(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-1")

    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (1, 0, 0)
    items = dynamo.Table("card-slam-cards").scan()["Items"]
    assert len(items) == 1
    card = items[0]
    assert card["title"] == "Meeting"
    assert card["zoho_event_uid"] == "evt-1"
    assert card["category_id"] == "cat-1"
    assert card["status"] == "ready_to_do"
    assert card["todo_date"] == "2024-01-15"
    assert card["todo_time"] == "10:00"
    assert int(card["duration"]) == 60


def test_sync_without_default_category_leaves_card_uncategorized(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: None)

    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (1, 0, 0)
    card = dynamo.Table("card-slam-cards").scan()["Items"][0]
    assert "category_id" not in card


def test_resync_unchanged_event_is_skipped(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-1")

    service.sync_calendar("admin", "cal-uid")
    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (0, 0, 1)
    assert len(dynamo.Table("card-slam-cards").scan()["Items"]) == 1


def test_resync_changed_event_updates_card(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-1")
    service.sync_calendar("admin", "cal-uid")

    changed = [{**_events()[0], "title": "Meeting (moved)", "end": "20240115T120000"}]
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: changed)
    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (0, 1, 0)
    items = dynamo.Table("card-slam-cards").scan()["Items"]
    assert len(items) == 1
    assert items[0]["title"] == "Meeting (moved)"
    assert int(items[0]["duration"]) == 120


def test_resync_backfills_default_category_onto_uncategorized_card(dynamo, monkeypatch):
    """A card imported before a default category was configured gets the default
    applied on the next sync (even when the event itself is unchanged)."""
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())

    # First import: no default category configured -> card has none.
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: None)
    service.sync_calendar("admin", "cal-uid")
    card = dynamo.Table("card-slam-cards").scan()["Items"][0]
    assert "category_id" not in card

    # User configures a default, then re-syncs the same (unchanged) event.
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-1")
    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (0, 1, 0)
    card = dynamo.Table("card-slam-cards").scan()["Items"][0]
    assert card["category_id"] == "cat-1"


def test_resync_does_not_override_existing_category(dynamo, monkeypatch):
    """Re-syncing never clobbers a category already on an imported card."""
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())

    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-1")
    service.sync_calendar("admin", "cal-uid")

    # The default changes, but the unchanged card keeps its original category.
    monkeypatch.setattr(service, "get_zoho_default_category", lambda u: "cat-2")
    result = service.sync_calendar("admin", "cal-uid")

    assert (result.created, result.updated, result.skipped) == (0, 0, 1)
    card = dynamo.Table("card-slam-cards").scan()["Items"][0]
    assert card["category_id"] == "cat-1"


# ── full-stack: config default category flows through to imported cards ───────
# These exercise the real store -> sync path (the unit tests above stub out the
# default-category lookup), mocking only Zoho's external HTTP calls.

def test_sync_via_api_assigns_configured_default_category(client, user_auth_headers, monkeypatch):
    from integrations import service
    from db import get_cards_table

    put = client.put(
        "/api/integrations/zoho/config",
        json={"client_id": "cid", "client_secret": "sec", "default_category_id": "cat-2"},
        headers=user_auth_headers,
    )
    assert put.status_code == 200, put.text

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())

    resp = client.post(
        "/api/integrations/zoho/sync",
        json={"calendar_uid": "cal-uid", "days": 31},
        headers=user_auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 1

    imported = [c for c in get_cards_table().scan()["Items"] if c.get("zoho_event_uid") == "evt-1"]
    assert len(imported) == 1
    assert imported[0].get("category_id") == "cat-2"


def test_sync_via_api_backfills_default_onto_previously_imported_card(client, user_auth_headers, monkeypatch):
    from integrations import service
    from db import get_cards_table

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())

    # Configure without a default, import once -> card is uncategorized.
    client.put(
        "/api/integrations/zoho/config",
        json={"client_id": "cid", "client_secret": "sec"},
        headers=user_auth_headers,
    )
    client.post(
        "/api/integrations/zoho/sync",
        json={"calendar_uid": "cal-uid", "days": 31},
        headers=user_auth_headers,
    )
    imported = [c for c in get_cards_table().scan()["Items"] if c.get("zoho_event_uid") == "evt-1"]
    assert imported and imported[0].get("category_id") is None

    # Now set a default and re-sync -> the existing card is backfilled.
    client.put(
        "/api/integrations/zoho/config",
        json={"client_id": "cid", "client_secret": "", "default_category_id": "cat-1"},
        headers=user_auth_headers,
    )
    resp = client.post(
        "/api/integrations/zoho/sync",
        json={"calendar_uid": "cal-uid", "days": 31},
        headers=user_auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["updated"] == 1

    imported = [c for c in get_cards_table().scan()["Items"] if c.get("zoho_event_uid") == "evt-1"]
    assert len(imported) == 1
    assert imported[0].get("category_id") == "cat-1"
