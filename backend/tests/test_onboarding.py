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


def test_onboarding_steps_covers_account_through_first_board(client, auth_headers):
    resp = client.get("/api/onboarding/steps", headers=auth_headers)
    titles = " ".join(s["title"].lower() for s in resp.json()["steps"])
    # The walkthrough must touch the major beats: account/sign-in, a category,
    # creating a card, and using the Kanban board.
    assert "sign in" in titles
    assert "category" in titles
    assert "card" in titles
    assert "kanban" in titles


def test_onboarding_steps_requires_auth(client):
    resp = client.get("/api/onboarding/steps")
    assert resp.status_code == 401


def test_onboarding_steps_available_to_regular_user(client, user_auth_headers):
    """Onboarding is for new users — it must not be admin-only."""
    resp = client.get("/api/onboarding/steps", headers=user_auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["steps"]) >= 5
