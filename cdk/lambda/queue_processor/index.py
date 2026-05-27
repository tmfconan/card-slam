"""
EventBridge-triggered Lambda that picks the next queued feature request card
and starts a CodeBuild build. Runs every 5 minutes via a scheduled rule.
"""
import os
import uuid
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr

REGION = os.environ.get("AWS_REGION", "us-east-2")
CARDS_TABLE = os.environ.get("CARDS_TABLE", "card-slam-cards")
FEATURE_RUNS_TABLE = os.environ.get("FEATURE_RUNS_TABLE", "card-slam-feature-runs")
CODEBUILD_PROJECT = os.environ.get("CODEBUILD_PROJECT", "card-slam-auto-code")


def handler(event, context):
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    cards_table = dynamodb.Table(CARDS_TABLE)
    runs_table = dynamodb.Table(FEATURE_RUNS_TABLE)
    cb = boto3.client("codebuild", region_name=REGION)

    # Skip if a build is already running
    in_progress = cards_table.scan(
        FilterExpression=Attr("feature_request_status").eq("in_progress")
    ).get("Items", [])
    if in_progress:
        print(f"Skipping: {len(in_progress)} card(s) already in progress")
        return {"status": "busy"}

    # Find highest-priority queued card (lowest priority number)
    queued = cards_table.scan(
        FilterExpression=Attr("feature_request_status").eq("queued")
    ).get("Items", [])
    if not queued:
        print("No queued feature requests")
        return {"status": "empty"}

    card = min(queued, key=lambda c: (int(c.get("priority", 0)), c.get("created_at", "")))
    now = datetime.now(timezone.utc).isoformat()
    run_id = str(uuid.uuid4())

    # Create run record
    runs_table.put_item(Item={
        "run_id": run_id,
        "card_id": card["id"],
        "card_title": card.get("title", ""),
        "card_description": card.get("description", ""),
        "status": "in_progress",
        "started_at": now,
    })

    # Mark card in_progress
    cards_table.update_item(
        Key={"id": card["id"]},
        UpdateExpression="SET feature_request_status = :s, updated_at = :t",
        ExpressionAttributeValues={":s": "in_progress", ":t": now},
    )

    # Start CodeBuild
    response = cb.start_build(
        projectName=CODEBUILD_PROJECT,
        environmentVariablesOverride=[
            {"name": "CARD_ID", "value": card["id"], "type": "PLAINTEXT"},
            {"name": "FEATURE_TITLE", "value": card.get("title", ""), "type": "PLAINTEXT"},
            {"name": "FEATURE_DESCRIPTION", "value": card.get("description", ""), "type": "PLAINTEXT"},
            {"name": "RUN_ID", "value": run_id, "type": "PLAINTEXT"},
        ],
    )
    build_id = response["build"]["id"]

    # Store build ID on the run
    runs_table.update_item(
        Key={"run_id": run_id},
        UpdateExpression="SET codebuild_build_id = :b",
        ExpressionAttributeValues={":b": build_id},
    )

    print(f"Started build {build_id} for card '{card.get('title')}' (run {run_id})")
    return {"status": "started", "build_id": build_id, "run_id": run_id}
