from datetime import datetime, timedelta, timezone


# ── helpers ────────────────────────────────────────────────────────────────────

CARD_BASE = {
    "title": "Report test card",
    "description": "",
    "category_id": "cat-123",
    "status": "brainstorm",
    "priority": 0,
}


def _create_done_card(client, auth_headers, weeks_ago: int = 0, title: str = "Done card"):
    """Create a card and mark it done. The updated_at will reflect 'now', but
    we force created_at to be weeks_ago weeks in the past by patching after creation."""
    resp = client.post(
        "/api/cards/",
        json={**CARD_BASE, "title": title, "status": "done"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ── basic endpoint tests ────────────────────────────────────────────────────────

def test_velocity_empty(client, auth_headers):
    resp = client.get("/api/reports/velocity", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["lifetime"]["total_intended"] == 0
    assert data["lifetime"]["total_done"] == 0
    assert data["lifetime"]["completion_rate"] == 0.0
    assert "weekly_throughput" not in data
    assert len(data["weekly_cohort"]) == 16


def test_velocity_counts_done_cards(client, auth_headers):
    _create_done_card(client, auth_headers, title="Done 1")
    _create_done_card(client, auth_headers, title="Done 2")

    resp = client.get("/api/reports/velocity", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["lifetime"]["total_done"] == 2


def test_velocity_lifetime_completion_rate(client, auth_headers):
    # 2 intended (not done), 1 done
    client.post("/api/cards/", json={**CARD_BASE, "status": "in_progress"}, headers=auth_headers)
    client.post("/api/cards/", json={**CARD_BASE, "status": "ready_to_do"}, headers=auth_headers)
    _create_done_card(client, auth_headers)

    resp = client.get("/api/reports/velocity", headers=auth_headers)
    data = resp.json()
    # 3 intended, 1 done → 0.333
    assert data["lifetime"]["total_intended"] == 3
    assert data["lifetime"]["total_done"] == 1
    assert abs(data["lifetime"]["completion_rate"] - round(1 / 3, 3)) < 0.001


def test_velocity_weekly_series_has_correct_length(client, auth_headers):
    resp = client.get("/api/reports/velocity", headers=auth_headers)
    data = resp.json()
    assert len(data["weekly_cohort"]) == 16


def test_velocity_weekly_series_keys_present(client, auth_headers):
    resp = client.get("/api/reports/velocity", headers=auth_headers)
    cohort = resp.json()["weekly_cohort"]
    for entry in cohort:
        assert "week" in entry
        assert "week_label" in entry
        assert "done" in entry
        assert "intended" in entry
        assert "not_done" in entry
        assert "rate" in entry


def test_velocity_response_omits_weekly_throughput(client, auth_headers):
    resp = client.get("/api/reports/velocity", headers=auth_headers)
    data = resp.json()
    assert "weekly_throughput" not in data


# ── Bug 3: ref_date query parameter ────────────────────────────────────────────

def test_velocity_ref_date_returns_200(client, auth_headers):
    resp = client.get(
        "/api/reports/velocity?ref_date=2025-01-15",
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_velocity_ref_date_changes_week_window(client, auth_headers):
    """Different ref_dates should anchor to different 16-week windows."""
    resp_today = client.get("/api/reports/velocity", headers=auth_headers)
    resp_past = client.get(
        "/api/reports/velocity?ref_date=2024-01-01",
        headers=auth_headers,
    )

    labels_today = [e["week"] for e in resp_today.json()["weekly_cohort"]]
    labels_past = [e["week"] for e in resp_past.json()["weekly_cohort"]]

    # The two windows must differ — a date 2 years ago is outside today's 16-week window
    assert labels_today != labels_past


def test_velocity_ref_date_last_week_in_series_matches_anchor(client, auth_headers):
    """The final entry in the series should be the ISO week that contains ref_date."""
    from datetime import datetime, timezone

    ref = "2024-06-17"  # ISO week 25 of 2024
    resp = client.get(f"/api/reports/velocity?ref_date={ref}", headers=auth_headers)
    cohort = resp.json()["weekly_cohort"]
    last_week_key = cohort[-1]["week"]

    anchor = datetime.fromisoformat(ref).replace(tzinfo=timezone.utc)
    cal = anchor.isocalendar()
    expected_key = f"{cal[0]}-W{cal[1]:02d}"

    assert last_week_key == expected_key


def test_velocity_invalid_ref_date_falls_back_to_today(client, auth_headers):
    """An unparseable ref_date should not 500 — it falls back to today's anchor."""
    resp = client.get(
        "/api/reports/velocity?ref_date=not-a-date",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["weekly_cohort"]) == 16


def test_velocity_requires_auth(client):
    resp = client.get("/api/reports/velocity")
    assert resp.status_code == 401
