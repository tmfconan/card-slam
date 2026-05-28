import os
import sys

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("CATEGORIES_TABLE", "card-slam-categories")
os.environ.setdefault("CARDS_TABLE", "card-slam-cards")
os.environ.setdefault("USERS_TABLE", "card-slam-users")

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _backend_dir)

import bcrypt
import pytest
import boto3
from moto import mock_aws
from unittest.mock import patch
from starlette.testclient import TestClient

TEST_PASSWORD = "test-password-123"
TEST_PASSWORD_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

REGULAR_USER = "testuser"
REGULAR_PASSWORD = "user-password-456"
REGULAR_PASSWORD_HASH = bcrypt.hashpw(REGULAR_PASSWORD.encode(), bcrypt.gensalt()).decode()

# password_hash removed — passwords now live in DynamoDB users table
MOCK_SECRET = {
    "jwt_secret": "test-jwt-secret-for-testing-only",
    "anthropic_api_key": "test-anthropic-key",
}


@pytest.fixture(scope="function")
def dynamo_tables():
    with mock_aws():
        import db
        db._dynamodb.cache_clear()

        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

        dynamodb.create_table(
            TableName="card-slam-categories",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="card-slam-cards",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="card-slam-users",
            KeySchema=[{"AttributeName": "username", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "username", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Seed admin user
        users_table = dynamodb.Table("card-slam-users")
        users_table.put_item(Item={
            "username": "admin",
            "password_hash": TEST_PASSWORD_HASH,
            "role": "admin",
            "created_at": "2024-01-01T00:00:00Z",
        })

        yield dynamodb

        db._dynamodb.cache_clear()


@pytest.fixture(autouse=True)
def reset_login_security():
    """Clear the in-memory rate-limiter/CAPTCHA state between tests."""
    from auth import security
    security.reset()
    yield
    security.reset()


@pytest.fixture(scope="function")
def client(dynamo_tables):
    import config
    config.get_secret.cache_clear()

    with patch("config.get_secret", return_value=MOCK_SECRET):
        from main import app
        yield TestClient(app)

    config.get_secret.cache_clear()


@pytest.fixture(scope="function")
def auth_headers(client):
    """Admin auth headers."""
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="function")
def user_auth_headers(client, auth_headers, dynamo_tables):
    """Auth headers for a regular (non-admin) user, created via admin."""
    client.post(
        "/api/admin/users",
        json={"username": REGULAR_USER, "password": REGULAR_PASSWORD},
        headers=auth_headers,
    )
    response = client.post(
        "/api/auth/login", json={"username": REGULAR_USER, "password": REGULAR_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
