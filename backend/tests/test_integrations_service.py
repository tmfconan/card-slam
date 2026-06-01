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

    result = service.sync_calendar("admin", "cal-uid", "cat-1")

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


def test_resync_unchanged_event_is_skipped(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())

    service.sync_calendar("admin", "cal-uid", "cat-1")
    result = service.sync_calendar("admin", "cal-uid", "cat-1")

    assert (result.created, result.updated, result.skipped) == (0, 0, 1)
    assert len(dynamo.Table("card-slam-cards").scan()["Items"]) == 1


def test_resync_changed_event_updates_card(dynamo, monkeypatch):
    from integrations import service

    monkeypatch.setattr(service, "get_valid_access_token", lambda u: "tok")
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: _events())
    service.sync_calendar("admin", "cal-uid", "cat-1")

    changed = [{**_events()[0], "title": "Meeting (moved)", "end": "20240115T120000"}]
    monkeypatch.setattr(service, "_fetch_events", lambda *a, **k: changed)
    result = service.sync_calendar("admin", "cal-uid", "cat-1")

    assert (result.created, result.updated, result.skipped) == (0, 1, 0)
    items = dynamo.Table("card-slam-cards").scan()["Items"]
    assert len(items) == 1
    assert items[0]["title"] == "Meeting (moved)"
    assert int(items[0]["duration"]) == 120
