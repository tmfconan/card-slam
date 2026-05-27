import boto3
import os
from functools import lru_cache


@lru_cache(maxsize=1)
def _dynamodb():
    kwargs: dict = {"region_name": os.environ.get("AWS_DEFAULT_REGION", "us-east-2")}
    endpoint = os.environ.get("DYNAMODB_ENDPOINT")
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.resource("dynamodb", **kwargs)


def get_categories_table():
    return _dynamodb().Table(
        os.environ.get("CATEGORIES_TABLE", "card-slam-categories")
    )


def get_cards_table():
    return _dynamodb().Table(os.environ.get("CARDS_TABLE", "card-slam-cards"))


def get_users_table():
    return _dynamodb().Table(os.environ.get("USERS_TABLE", "card-slam-users"))


def get_feature_runs_table():
    return _dynamodb().Table(
        os.environ.get("FEATURE_RUNS_TABLE", "card-slam-feature-runs")
    )
