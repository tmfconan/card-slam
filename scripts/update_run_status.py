#!/usr/bin/env python3
"""Called by buildspec.yml at end of build to update DynamoDB with result."""
import sys
import os
import boto3
from datetime import datetime, timezone

status_arg = sys.argv[1] if len(sys.argv) > 1 else "failure"
region = os.environ.get("REGION", "us-east-2")
run_id = os.environ.get("RUN_ID", "")
card_id = os.environ.get("CARD_ID", "")
build_id = os.environ.get("CODEBUILD_BUILD_ID", "")
runs_table_name = os.environ.get("FEATURE_RUNS_TABLE", "card-slam-feature-runs")
cards_table_name = os.environ.get("CARDS_TABLE", "card-slam-cards")

dynamodb = boto3.resource("dynamodb", region_name=region)
now = datetime.now(timezone.utc).isoformat()

final_status = "completed" if status_arg == "success" else "failed"

if run_id:
    runs_table = dynamodb.Table(runs_table_name)
    runs_table.update_item(
        Key={"run_id": run_id},
        UpdateExpression="SET #s = :s, completed_at = :t, codebuild_build_id = :b",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": final_status, ":t": now, ":b": build_id},
    )

if card_id:
    cards_table = dynamodb.Table(cards_table_name)
    cards_table.update_item(
        Key={"id": card_id},
        UpdateExpression="SET feature_request_status = :s, updated_at = :t",
        ExpressionAttributeValues={":s": final_status, ":t": now},
    )

print(f"Updated run={run_id} card={card_id} -> {final_status}")
