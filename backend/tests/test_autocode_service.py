"""Tests for the autocode service history/merged-status presentation."""
import boto3
import pytest
from moto import mock_aws


@pytest.fixture
def dynamo(monkeypatch):
    monkeypatch.setenv("CARDS_TABLE", "card-slam-cards")
    monkeypatch.setenv("FEATURE_RUNS_TABLE", "card-slam-feature-runs")
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
        resource.create_table(
            TableName="card-slam-feature-runs",
            KeySchema=[{"AttributeName": "run_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "run_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield resource
        db._dynamodb.cache_clear()


def _seed_card(dynamo, card_id, status):
    dynamo.Table("card-slam-cards").put_item(
        Item={
            "id": card_id,
            "title": "Feature",
            "is_feature_request": True,
            "feature_request_status": status,
        }
    )


def _seed_run(dynamo, run_id, card_id, status, started_at="2024-01-01T00:00:00Z"):
    dynamo.Table("card-slam-feature-runs").put_item(
        Item={
            "run_id": run_id,
            "card_id": card_id,
            "card_title": "Feature",
            "card_description": "",
            "status": status,
            "started_at": started_at,
        }
    )


def test_completed_run_shown_as_merged_when_card_merged(dynamo):
    from autocode.service import get_history

    _seed_card(dynamo, "c1", "merged")
    _seed_run(dynamo, "r1", "c1", "completed")

    history = get_history()

    assert history[0]["status"] == "merged"


def test_completed_run_stays_completed_when_card_not_merged(dynamo):
    from autocode.service import get_history

    _seed_card(dynamo, "c1", "completed")
    _seed_run(dynamo, "r1", "c1", "completed")

    history = get_history()

    assert history[0]["status"] == "completed"


def test_failed_run_not_affected_by_merged_card(dynamo):
    from autocode.service import get_history

    # A card may have an earlier failed run and a later merged deploy.
    _seed_card(dynamo, "c1", "merged")
    _seed_run(dynamo, "r1", "c1", "failed")

    history = get_history()

    assert history[0]["status"] == "failed"


def test_merged_override_is_presentational_only(dynamo):
    from autocode.service import get_history

    _seed_card(dynamo, "c1", "merged")
    _seed_run(dynamo, "r1", "c1", "completed")

    get_history()

    stored = dynamo.Table("card-slam-feature-runs").get_item(
        Key={"run_id": "r1"}
    )["Item"]
    assert stored["status"] == "completed"


def test_run_without_matching_card_keeps_status(dynamo):
    from autocode.service import get_history

    _seed_run(dynamo, "r1", "missing-card", "completed")

    history = get_history()

    assert history[0]["status"] == "completed"
