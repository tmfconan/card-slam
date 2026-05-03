import os
import sys

# Set environment variables before any imports that might read them
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("CATEGORIES_TABLE", "card-slam-categories")
os.environ.setdefault("CARDS_TABLE", "card-slam-cards")

# Make backend modules importable
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _backend_dir)

import bcrypt
import pytest
from moto import mock_aws
from unittest.mock import patch
from starlette.testclient import TestClient

TEST_PASSWORD = "test-password-123"
_hash = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

MOCK_SECRET = {
    "jwt_secret": "test-jwt-secret-for-testing-only",
    "password_hash": _hash,
    "anthropic_api_key": "test-anthropic-key",
}


@pytest.fixture(scope="function")
def dynamo_tables():
    with mock_aws():
        import boto3
        import db

        # Clear the cached DynamoDB resource so moto intercepts calls
        db._dynamodb.cache_clear()

        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

        # Create categories table
        dynamodb.create_table(
            TableName="card-slam-categories",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Create cards table
        dynamodb.create_table(
            TableName="card-slam-cards",
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        yield dynamodb

        db._dynamodb.cache_clear()


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
    response = client.post(
        "/api/auth/login", json={"password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
