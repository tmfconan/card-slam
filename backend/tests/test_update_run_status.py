"""Tests for the post_build status/auto-merge script (scripts/update_run_status.py)."""
import importlib.util
import os

import boto3
import pytest
from moto import mock_aws

_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "scripts",
    "update_run_status.py",
)


def _load():
    spec = importlib.util.spec_from_file_location("update_run_status", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code


@pytest.fixture
def mod():
    return _load()


# ── auto_merge() ────────────────────────────────────────────────────────────

def test_auto_merge_skipped_without_token(mod, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert mod.auto_merge("card-1", "Feature") is False


def test_auto_merge_succeeds_on_201(mod, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "tok")
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **k: _FakeResponse(201))
    assert mod.auto_merge("card-1", "Feature") is True


def test_auto_merge_fails_on_conflict(mod, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "tok")
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **k: _FakeResponse(409))
    assert mod.auto_merge("card-1", "Feature") is False


def test_auto_merge_handles_request_error(mod, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "tok")

    def _boom(*a, **k):
        raise mod.httpx.RequestError("network down")

    monkeypatch.setattr(mod.httpx, "post", _boom)
    assert mod.auto_merge("card-1", "Feature") is False


# ── main() card status ──────────────────────────────────────────────────────

@pytest.fixture
def dynamo():
    with mock_aws():
        db = boto3.resource("dynamodb", region_name="us-east-1")
        db.create_table(
            TableName="card-slam-cards",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        db.create_table(
            TableName="card-slam-feature-runs",
            KeySchema=[{"AttributeName": "run_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "run_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield db


def _seed_card(dynamo, card_id, auto_merge):
    dynamo.Table("card-slam-cards").put_item(
        Item={
            "id": card_id,
            "title": "Feature",
            "is_feature_request": True,
            "feature_request_status": "in_progress",
            "auto_merge": auto_merge,
        }
    )


def _status(dynamo, card_id):
    item = dynamo.Table("card-slam-cards").get_item(Key={"id": card_id}).get("Item")
    return item["feature_request_status"]


def _set_env(monkeypatch, card_id):
    monkeypatch.setenv("REGION", "us-east-1")
    monkeypatch.setenv("CARD_ID", card_id)
    monkeypatch.setenv("RUN_ID", "")
    monkeypatch.setenv("CARDS_TABLE", "card-slam-cards")
    monkeypatch.setenv("FEATURE_RUNS_TABLE", "card-slam-feature-runs")


def test_success_with_auto_merge_marks_merged(mod, dynamo, monkeypatch):
    _seed_card(dynamo, "c1", auto_merge=True)
    _set_env(monkeypatch, "c1")
    monkeypatch.setenv("GITHUB_TOKEN", "tok")
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **k: _FakeResponse(201))

    mod.main("success")

    assert _status(dynamo, "c1") == "merged"


def test_success_without_auto_merge_marks_completed(mod, dynamo, monkeypatch):
    _seed_card(dynamo, "c2", auto_merge=False)
    _set_env(monkeypatch, "c2")

    mod.main("success")

    assert _status(dynamo, "c2") == "completed"


def test_success_with_auto_merge_falls_back_when_merge_fails(mod, dynamo, monkeypatch):
    _seed_card(dynamo, "c3", auto_merge=True)
    _set_env(monkeypatch, "c3")
    monkeypatch.setenv("GITHUB_TOKEN", "tok")
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **k: _FakeResponse(409))

    mod.main("success")

    # Merge conflict → card stays completed for a manual merge.
    assert _status(dynamo, "c3") == "completed"


def test_failure_marks_failed_and_skips_merge(mod, dynamo, monkeypatch):
    _seed_card(dynamo, "c4", auto_merge=True)
    _set_env(monkeypatch, "c4")

    def _fail(*a, **k):
        raise AssertionError("merge should not be attempted on failure")

    monkeypatch.setattr(mod.httpx, "post", _fail)

    mod.main("failure")

    assert _status(dynamo, "c4") == "failed"
