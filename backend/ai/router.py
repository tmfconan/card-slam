from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from boto3.dynamodb.conditions import Attr
import anthropic
import json

from auth.router import verify_token
from config import get_anthropic_key
from db import get_cards_table

router = APIRouter(prefix="/ai", tags=["ai"])

# Work in these statuses is unplanned-but-committed: candidates for the weekly
# plan assist to schedule onto specific days and times.
PLANNABLE_STATUSES = {"intent_to_do", "ready_to_do"}


class ParseRequest(BaseModel):
    prompt: str
    category_id: str


class WorkItem(BaseModel):
    title: str
    description: str


class ParseResponse(BaseModel):
    items: list[WorkItem]


class PlanRequest(BaseModel):
    week_start: str       # YYYY-MM-DD — first day of the planning window
    days: int = 7         # number of days to spread the work across


class PlanItem(BaseModel):
    card_id: str
    title: str
    todo_date: str        # YYYY-MM-DD
    todo_time: str        # HH:MM
    reason: str = ""


class PlanResponse(BaseModel):
    items: list[PlanItem]


@router.post("/parse", response_model=ParseResponse)
def parse_work_items(body: ParseRequest, user: str = Depends(verify_token)):
    client = anthropic.Anthropic(api_key=get_anthropic_key())

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a work item parser. Break the following work description into "
                    "discrete, actionable work items.\n\n"
                    "Return ONLY a JSON array. Each element must have:\n"
                    '  "title": concise label (under 10 words)\n'
                    '  "description": 1-2 sentences explaining the specific task\n\n'
                    f"Work description: {body.prompt}\n\n"
                    "Respond with valid JSON only, no markdown fences:\n"
                    '[{"title": "...", "description": "..."}]'
                ),
            }
        ],
    )

    raw = message.content[0].text.strip()
    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        items_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Claude returned invalid JSON")

    return ParseResponse(items=[WorkItem(**i) for i in items_data])


def _build_window(week_start: str, days: int) -> list[str]:
    """Return the list of YYYY-MM-DD dates in the planning window."""
    from datetime import datetime, timedelta

    start = datetime.strptime(week_start, "%Y-%m-%d").date()
    span = max(1, min(days, 31))
    return [(start + timedelta(days=i)).isoformat() for i in range(span)]


@router.post("/suggest-plan", response_model=PlanResponse)
def suggest_plan(body: PlanRequest, username: str = Depends(verify_token)):
    """
    Examine the user's committed-but-unscheduled work ("Intent to do" and
    "Ready to do") and ask Claude to suggest a day and time for each piece.
    Returns a plan the user can review, then approve or reject on the frontend.
    """
    try:
        window = _build_window(body.week_start, body.days)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start; expected YYYY-MM-DD")

    table = get_cards_table()
    items = table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    # Include legacy records (no username) for admin, mirroring cards listing.
    if username == "admin":
        items += [i for i in table.scan().get("Items", []) if "username" not in i]

    plannable = [
        i for i in items
        if i.get("status") in PLANNABLE_STATUSES and not bool(i.get("archived", False))
    ]
    if not plannable:
        return PlanResponse(items=[])

    by_id = {c["id"]: c for c in plannable}
    card_summaries = [
        {
            "id": c["id"],
            "title": c.get("title", ""),
            "description": c.get("description", ""),
            "status": c.get("status"),
            "duration": int(c.get("duration", 30)),
            "current_date": c.get("todo_date"),
            "current_time": c.get("todo_time"),
        }
        for c in plannable
    ]

    client = anthropic.Anthropic(api_key=get_anthropic_key())
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a personal planning assistant. Schedule each of the work "
                    "items below onto a specific day and time.\n\n"
                    f"The planning window covers these days: {', '.join(window)}.\n"
                    "Working hours run 06:00 to 18:00. Every time must be HH:MM on a "
                    "15-minute boundary between 06:00 and 17:45.\n"
                    "Each item has a duration in minutes. Do not overlap two items on the "
                    "same day, and leave the time slot free for the item's full duration. "
                    "Spread the work sensibly across the days; favor scheduling "
                    "'ready_to_do' items earlier than 'intent_to_do' items.\n\n"
                    "Return ONLY a JSON array. Each element must have:\n"
                    '  "card_id": the id of the work item (copy it exactly)\n'
                    '  "todo_date": chosen day as YYYY-MM-DD (from the window)\n'
                    '  "todo_time": chosen time as HH:MM\n'
                    '  "reason": one short sentence on why this slot\n\n'
                    f"Work items: {json.dumps(card_summaries)}\n\n"
                    "Respond with valid JSON only, no markdown fences:\n"
                    '[{"card_id": "...", "todo_date": "...", "todo_time": "...", "reason": "..."}]'
                ),
            }
        ],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        plan_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Claude returned invalid JSON")

    plan_items: list[PlanItem] = []
    for entry in plan_data:
        card = by_id.get(entry.get("card_id"))
        if not card:
            continue  # ignore hallucinated ids
        plan_items.append(
            PlanItem(
                card_id=card["id"],
                title=card.get("title", ""),
                todo_date=entry.get("todo_date", ""),
                todo_time=entry.get("todo_time", ""),
                reason=entry.get("reason", ""),
            )
        )

    return PlanResponse(items=plan_items)
