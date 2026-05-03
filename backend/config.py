import boto3
import json
import os
from functools import lru_cache


@lru_cache(maxsize=1)
def get_secret() -> dict:
    secret_name = os.environ.get("SECRET_NAME")

    # Local dev: fall back to env vars
    if not secret_name:
        return {
            "jwt_secret": os.environ.get("JWT_SECRET", "dev-only-secret"),
            "password_hash": os.environ.get("PASSWORD_HASH", ""),
            "anthropic_api_key": os.environ.get("ANTHROPIC_API_KEY", ""),
        }

    client = boto3.client(
        "secretsmanager",
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-2"),
    )
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])


def get_jwt_secret() -> str:
    return get_secret()["jwt_secret"]


def get_password_hash() -> str:
    return get_secret()["password_hash"]


def get_anthropic_key() -> str:
    return get_secret()["anthropic_api_key"]
