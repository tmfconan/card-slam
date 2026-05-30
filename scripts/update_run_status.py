#!/usr/bin/env python3
"""Called by buildspec.yml at end of build to update DynamoDB with result.

When a feature request card opted into auto-merge, a successful build also
merges its branch into main (via the GitHub API, after the post_build git push)
and records the card as "merged" — instead of waiting for a manual click.
"""
import sys
import os
import boto3
import httpx
from datetime import datetime, timezone

_GITHUB_REPO = os.environ.get("GITHUB_REPO", "tmfconan/card-slam")


def auto_merge(card_id: str, title: str) -> bool:
    """Merge the card's auto-code branch into main via the GitHub API.

    Returns True only when GitHub reports the merge succeeded. Any other
    outcome (no token, conflict, request error) returns False so the card
    falls back to "completed" and can be merged manually.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("auto-merge skipped: GITHUB_TOKEN not set")
        return False

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        response = httpx.post(
            f"https://api.github.com/repos/{_GITHUB_REPO}/merges",
            headers=headers,
            json={
                "base": "main",
                "head": f"auto-code/{card_id}",
                "commit_message": f"Merge auto-code feature: {title}",
            },
            timeout=30,
        )
    except httpx.RequestError as exc:
        print(f"auto-merge failed: {exc}")
        return False

    if response.status_code in (201, 204):
        print(f"auto-merged auto-code/{card_id} into main")
        return True
    print(f"auto-merge failed: GitHub API {response.status_code}")
    return False


def main(status_arg: str) -> None:
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
        card_status = final_status
        # On a successful build, auto-merge opted-in feature requests now (the
        # branch was already pushed in post_build) and record them as merged.
        if final_status == "completed":
            item = cards_table.get_item(Key={"id": card_id}).get("Item") or {}
            if item.get("auto_merge"):
                if auto_merge(card_id, item.get("title", "")):
                    card_status = "merged"
        cards_table.update_item(
            Key={"id": card_id},
            UpdateExpression="SET feature_request_status = :s, updated_at = :t",
            ExpressionAttributeValues={":s": card_status, ":t": now},
        )
        print(f"Updated run={run_id} card={card_id} -> {card_status}")
    else:
        print(f"Updated run={run_id} -> {final_status}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "failure")
