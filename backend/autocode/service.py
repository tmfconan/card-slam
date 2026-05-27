import json
import os
import uuid
import boto3
from datetime import datetime, timezone

import anthropic
from boto3.dynamodb.conditions import Attr

from config import get_anthropic_key
from db import get_cards_table, get_feature_runs_table

_CODEBUILD_PROJECT = os.environ.get("CODEBUILD_PROJECT", "card-slam-auto-code")
_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-2")


def validate_feature_request(title: str, description: str) -> dict:
    client = anthropic.Anthropic(api_key=get_anthropic_key())
    prompt = f"""You are reviewing a feature request for Card Slam — a personal work management web app (React + FastAPI + DynamoDB, single Fargate container).

Evaluate whether this is a reasonable, safe, and implementable software feature:

Title: {title}
Description: {description}

Respond with valid JSON only (no markdown): {{"valid": true/false, "reason": "brief explanation"}}

valid=true if:
- It is a legitimate UI/UX improvement or backend feature for a work management app
- The description is clear enough to implement
- No security risks, auth bypass, or mass data destruction

valid=false if:
- The request is unclear, nonsensical, or not a software feature
- It would compromise security or destroy data
- It references external systems this app does not have"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    # Strip accidental markdown fences
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def flag_card_as_feature_request(card_id: str, username: str) -> dict:
    table = get_cards_table()
    item = table.get_item(Key={"id": card_id}).get("Item")
    if not item:
        return {"error": "Card not found"}

    now = datetime.now(timezone.utc).isoformat()

    # Set pending_validation immediately so UI updates
    table.update_item(
        Key={"id": card_id},
        UpdateExpression="SET is_feature_request = :t, feature_request_status = :s, updated_at = :n",
        ExpressionAttributeValues={":t": True, ":s": "pending_validation", ":n": now},
    )

    title = item.get("title", "")
    description = item.get("description", "")

    result = validate_feature_request(title, description)

    new_status = "queued" if result["valid"] else "validation_failed"
    table.update_item(
        Key={"id": card_id},
        UpdateExpression="SET feature_request_status = :s, updated_at = :n",
        ExpressionAttributeValues={":s": new_status, ":n": datetime.now(timezone.utc).isoformat()},
    )

    return {"valid": result["valid"], "reason": result["reason"], "status": new_status}


def unflag_card(card_id: str) -> bool:
    table = get_cards_table()
    item = table.get_item(Key={"id": card_id}).get("Item")
    if not item:
        return False
    if item.get("feature_request_status") == "in_progress":
        return False  # can't unflag while building
    now = datetime.now(timezone.utc).isoformat()
    table.update_item(
        Key={"id": card_id},
        UpdateExpression="SET is_feature_request = :f, feature_request_status = :n, updated_at = :t",
        ExpressionAttributeValues={":f": False, ":n": None, ":t": now},
    )
    return True


def get_queue() -> list:
    table = get_cards_table()
    items = table.scan(
        FilterExpression=Attr("is_feature_request").eq(True)
        & Attr("feature_request_status").is_in(["queued", "in_progress", "pending_validation"])
    ).get("Items", [])
    for item in items:
        item["priority"] = int(item.get("priority", 0))
        item["duration"] = int(item.get("duration", 30))
    return sorted(items, key=lambda c: (c["priority"], c.get("created_at", "")))


def get_history() -> list:
    table = get_feature_runs_table()
    items = table.scan().get("Items", [])
    return sorted(items, key=lambda r: r.get("started_at", ""), reverse=True)
