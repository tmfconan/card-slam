import json
import os
import uuid
import boto3
import httpx
from datetime import datetime, timezone

import anthropic
from boto3.dynamodb.conditions import Attr

from config import get_anthropic_key, get_github_pat
from db import get_cards_table, get_feature_runs_table
from .models import FeatureRunStatus

_GITHUB_REPO = os.environ.get("GITHUB_REPO", "tmfconan/card-slam")

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


def merge_to_main(card_id: str) -> dict:
    table = get_cards_table()
    item = table.get_item(Key={"id": card_id}).get("Item")
    if not item:
        return {"error": "Card not found"}
    if item.get("feature_request_status") != "completed":
        return {"error": "Card must be in completed state to merge"}

    pat = get_github_pat()
    if not pat:
        return {"error": "GitHub PAT not configured in Secrets Manager"}

    branch = f"auto-code/{card_id}"
    title = item.get("title", "")

    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        response = httpx.post(
            f"https://api.github.com/repos/{_GITHUB_REPO}/merges",
            headers=headers,
            json={
                "base": "main",
                "head": branch,
                "commit_message": f"Merge auto-code feature: {title}",
            },
            timeout=30,
        )
    except httpx.RequestError as exc:
        return {"error": f"GitHub API request failed: {exc}"}

    if response.status_code in (201, 204):
        now = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={"id": card_id},
            UpdateExpression="SET feature_request_status = :s, updated_at = :t",
            ExpressionAttributeValues={":s": "merged", ":t": now},
        )
        return {"merged": True}
    elif response.status_code == 409:
        return {
            "merged": False,
            "conflict": True,
            "message": f"Merge conflict detected — please merge 'auto-code/{card_id}' into main manually.",
        }
    elif response.status_code == 404:
        return {
            "merged": False,
            "conflict": False,
            "message": f"Branch 'auto-code/{card_id}' not found on GitHub.",
        }
    else:
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        return {
            "merged": False,
            "conflict": False,
            "message": body.get("message", f"GitHub API error {response.status_code}"),
        }


def _apply_merged_status(items: list[dict]) -> None:
    """Present a completed run as "merged" (in place) when its card's feature
    request has been merged into main. Merge state lives on the card, so the
    history reflects it presentationally — the stored run status is unchanged."""
    cards_table = get_cards_table()
    merged_by_card: dict[str, bool] = {}
    for run in items:
        if run.get("status") != FeatureRunStatus.completed.value:
            continue
        card_id = run.get("card_id")
        if not card_id:
            continue
        if card_id not in merged_by_card:
            card = cards_table.get_item(Key={"id": card_id}).get("Item")
            merged_by_card[card_id] = bool(
                card and card.get("feature_request_status") == "merged"
            )
        if merged_by_card[card_id]:
            run["status"] = FeatureRunStatus.merged.value


def get_history() -> list:
    table = get_feature_runs_table()
    items = table.scan().get("Items", [])
    _apply_merged_status(items)
    return sorted(items, key=lambda r: r.get("started_at", ""), reverse=True)
