from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from boto3.dynamodb.conditions import Attr
from fastapi import APIRouter, Depends, Query

from auth.router import verify_token
from db import get_cards_table, get_categories_table

router = APIRouter(prefix="/reports", tags=["reports"])

INTENDED = {"intent_to_do", "ready_to_do", "in_progress", "needs_finishing", "done"}
WEEKS_BACK = 16


def _week_key(dt_str: str) -> tuple[int, int]:
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    cal = dt.isocalendar()
    return (cal[0], cal[1])


def _week_label(year: int, week: int) -> str:
    d = datetime.fromisocalendar(year, week, 1)
    return d.strftime("%-m/%-d")


@router.get("/velocity")
def get_velocity(
    ref_date: Optional[str] = Query(None, description="Anchor date YYYY-MM-DD; defaults to today"),
    username: str = Depends(verify_token),
):
    table = get_cards_table()
    items = table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    if username == "admin":
        legacy = [i for i in table.scan().get("Items", []) if "username" not in i]
        items = items + legacy

    # Lifetime stats
    total_intended = sum(1 for i in items if i.get("status") in INTENDED)
    total_done = sum(1 for i in items if i.get("status") == "done")
    completion_rate = total_done / total_intended if total_intended > 0 else 0.0

    # Build ordered list of the last WEEKS_BACK ISO weeks
    if ref_date:
        try:
            now = datetime.fromisoformat(ref_date).replace(tzinfo=timezone.utc)
        except ValueError:
            now = datetime.now(timezone.utc)
    else:
        now = datetime.now(timezone.utc)
    weeks: list[tuple[int, int]] = []
    for w in range(WEEKS_BACK - 1, -1, -1):
        d = now - timedelta(weeks=w)
        cal = d.isocalendar()
        weeks.append((cal[0], cal[1]))
    weeks_set = set(weeks)

    # Weekly cohort: cards keyed by created_at week, intended vs done (current status)
    cohort_intended: dict[tuple[int, int], int] = defaultdict(int)
    cohort_done: dict[tuple[int, int], int] = defaultdict(int)
    for item in items:
        created = item.get("created_at", "")
        if not created:
            continue
        yw = _week_key(created)
        if yw not in weeks_set:
            continue
        if item.get("status") in INTENDED:
            cohort_intended[yw] += 1
        if item.get("status") == "done":
            cohort_done[yw] += 1

    weekly_cohort = []
    for year, week in weeks:
        yw = (year, week)
        label = _week_label(year, week)
        key = f"{year}-W{week:02d}"
        ci = cohort_intended.get(yw, 0)
        cd = cohort_done.get(yw, 0)
        weekly_cohort.append({
            "week": key,
            "week_label": label,
            "intended": ci,
            "done": cd,
            "not_done": ci - cd,
            "rate": round(cd / ci, 3) if ci > 0 else 0.0,
        })

    return {
        "lifetime": {
            "total_intended": total_intended,
            "total_done": total_done,
            "completion_rate": round(completion_rate, 3),
        },
        "weekly_cohort": weekly_cohort,
    }


UNCATEGORIZED_COLOR = "#9ca3af"


@router.get("/by-category")
def get_by_category(username: str = Depends(verify_token)):
    """Card counts grouped by category for three pies: total, complete, incomplete.
    A card is complete when its status is 'done'; everything else is incomplete."""
    cards_table = get_cards_table()
    items = cards_table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    if username == "admin":
        legacy = [i for i in cards_table.scan().get("Items", []) if "username" not in i]
        items = items + legacy

    cats_table = get_categories_table()
    cats = cats_table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    if username == "admin":
        legacy_cats = [c for c in cats_table.scan().get("Items", []) if "username" not in c]
        cats = cats + legacy_cats
    cat_map = {c["id"]: c for c in cats}

    total: dict[str, int] = defaultdict(int)
    complete: dict[str, int] = defaultdict(int)
    incomplete: dict[str, int] = defaultdict(int)
    for item in items:
        cid = item.get("category_id") or ""
        total[cid] += 1
        if item.get("status") == "done":
            complete[cid] += 1
        else:
            incomplete[cid] += 1

    def build(counts: dict[str, int]) -> list[dict]:
        out = []
        for cid, value in counts.items():
            cat = cat_map.get(cid)
            out.append({
                "category_id": cid,
                "name": cat["name"] if cat else "Uncategorized",
                "color": cat["color"] if cat else UNCATEGORIZED_COLOR,
                "value": value,
            })
        return sorted(out, key=lambda x: x["name"])

    return {
        "total": build(total),
        "complete": build(complete),
        "incomplete": build(incomplete),
    }
