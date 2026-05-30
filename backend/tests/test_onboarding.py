def test_onboarding_steps_returns_200(client, auth_headers):
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    assert resp.status_code == 200


def test_onboarding_steps_returns_ordered_list(client, auth_headers):
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    data = resp.json()
    assert "steps" in data
    assert isinstance(data["steps"], list)
    assert len(data["steps"]) >= 5
    ids = [s["id"] for s in data["steps"]]
    assert ids == sorted(ids)
    assert ids[0] == 1


def test_onboarding_steps_each_step_has_required_fields(client, auth_headers):
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    for step in resp.json()["steps"]:
        for field in ("id", "title", "summary", "location", "action", "expect"):
            assert field in step, f"missing field {field} in step {step}"
            if field == "id":
                assert isinstance(step[field], int)
            else:
                assert isinstance(step[field], str) and step[field].strip()


def test_onboarding_steps_cover_core_workflow(client, auth_headers):
    """The walkthrough must hit the major in-app beats."""
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    titles = " ".join(s["title"].lower() for s in resp.json()["steps"])
    assert "category" in titles
    assert "card" in titles
    assert "kanban" in titles


def test_onboarding_steps_skip_signin_and_account_creation(client, auth_headers):
    """The user must already be signed in to view the tutorial, so account
    creation and sign-in steps are intentionally excluded."""
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    haystack = " ".join(
        " ".join((s["title"], s["summary"], s["action"])).lower()
        for s in resp.json()["steps"]
    )
    # No step should be primarily about getting an account or signing in.
    for step in resp.json()["steps"]:
        assert "sign in to your workspace" not in step["title"].lower()
        assert "get an account" not in step["title"].lower()
    # Sanity check: at least sign-in isn't a focal action either.
    assert "click 'sign in'" not in haystack


def test_onboarding_steps_document_auto_code(client, auth_headers):
    """The walkthrough should document the auto-code / feature requests feature."""
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    haystack = " ".join(
        " ".join((s["title"], s["summary"], s["action"], s["location"])).lower()
        for s in resp.json()["steps"]
    )
    assert "auto-code" in haystack or "feature request" in haystack


def test_onboarding_admin_step_hidden_from_regular_users(client, user_auth_headers):
    """The auto-code / feature request step is admin-only and must not appear
    for regular users, who can't reach the Feature Requests page."""
    resp = client.get("/api/onboarding/steps", headers=user_auth_headers)
    assert resp.status_code == 200
    haystack = " ".join(
        " ".join((s["title"], s["summary"], s["action"], s["location"])).lower()
        for s in resp.json()["steps"]
    )
    assert "auto-code" not in haystack
    assert "feature request" not in haystack


def test_onboarding_admin_step_visible_to_admins(client, auth_headers):
    """Admins still see the auto-code / feature request step."""
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    haystack = " ".join(
        " ".join((s["title"], s["summary"], s["action"], s["location"])).lower()
        for s in resp.json()["steps"]
    )
    assert "auto-code" in haystack or "feature request" in haystack


def test_onboarding_steps_do_not_leak_admin_only_flag(client, auth_headers):
    """The internal admin_only marker must not appear in the response."""
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    for step in resp.json()["steps"]:
        assert "admin_only" not in step


def test_onboarding_steps_requires_auth(client):
    resp = client.get("/api/onboarding/steps")
    assert resp.status_code == 401


def test_onboarding_steps_available_to_regular_user(client, user_auth_headers):
    """Onboarding is for new users — it must not be admin-only."""
    resp = client.get("/api/onboarding/steps", headers=user_auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["steps"]) >= 5
