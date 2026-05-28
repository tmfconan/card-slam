import re

from auth import security
from tests.conftest import TEST_PASSWORD


def _wrong_login(client, captcha=None):
    body = {"username": "admin", "password": "wrong-password"}
    if captcha:
        body["captcha_id"], body["captcha_answer"] = captcha
    return client.post("/api/auth/login", json=body)


def _solve_captcha(client):
    """Fetch a CAPTCHA and compute the answer from its question text."""
    data = client.get("/api/auth/captcha").json()
    nums = [int(n) for n in re.findall(r"\d+", data["question"])]
    return data["challenge_id"], str(sum(nums))


def test_captcha_endpoint_returns_a_challenge(client):
    response = client.get("/api/auth/captcha")
    assert response.status_code == 200
    data = response.json()
    assert data["challenge_id"]
    assert "+" in data["question"]


def test_captcha_required_flag_set_after_threshold(client):
    response = None
    for _ in range(security.CAPTCHA_AFTER_FAILURES):
        response = _wrong_login(client)
        assert response.status_code == 401
    # The last failure that reaches the threshold flags captcha as required.
    assert response.json()["detail"]["captcha_required"] is True


def test_login_rejected_without_captcha_once_required(client):
    for _ in range(security.CAPTCHA_AFTER_FAILURES):
        _wrong_login(client)
    response = _wrong_login(client)  # no captcha supplied
    assert response.status_code == 400
    assert response.json()["detail"]["captcha_required"] is True


def test_login_rejected_with_wrong_captcha_answer(client):
    for _ in range(security.CAPTCHA_AFTER_FAILURES):
        _wrong_login(client)
    challenge_id, _ = _solve_captcha(client)
    response = _wrong_login(client, captcha=(challenge_id, "999999"))
    assert response.status_code == 400
    assert "Captcha verification failed" in response.json()["detail"]["message"]


def test_login_succeeds_with_valid_captcha_and_correct_password(client):
    for _ in range(security.CAPTCHA_AFTER_FAILURES):
        _wrong_login(client)
    challenge_id, answer = _solve_captcha(client)
    response = client.post(
        "/api/auth/login",
        json={
            "username": "admin",
            "password": TEST_PASSWORD,
            "captcha_id": challenge_id,
            "captcha_answer": answer,
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_captcha_is_single_use(client):
    for _ in range(security.CAPTCHA_AFTER_FAILURES):
        _wrong_login(client)
    challenge_id, answer = _solve_captcha(client)
    # First use consumes the challenge (wrong password, but captcha is valid).
    first = _wrong_login(client, captcha=(challenge_id, answer))
    assert first.status_code == 401
    # Re-using the same challenge_id must fail captcha verification.
    second = _wrong_login(client, captcha=(challenge_id, answer))
    assert second.status_code == 400


def test_lockout_after_max_failures(client):
    status = None
    for i in range(security.LOCKOUT_AFTER_FAILURES + 2):
        captcha = _solve_captcha(client) if i >= security.CAPTCHA_AFTER_FAILURES else None
        response = _wrong_login(client, captcha=captcha)
        status = response.status_code
        if status == 429:
            break
    assert status == 429
    data = response.json()
    assert data["detail"]["retry_after"] > 0
    assert response.headers.get("Retry-After")


def test_successful_login_resets_failure_counter(client):
    for _ in range(security.CAPTCHA_AFTER_FAILURES - 1):
        _wrong_login(client)
    ok = client.post(
        "/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD}
    )
    assert ok.status_code == 200
    # Counter cleared: a fresh failure does not yet require a captcha.
    response = _wrong_login(client)
    assert response.status_code == 401
    assert response.json()["detail"]["captcha_required"] is False
