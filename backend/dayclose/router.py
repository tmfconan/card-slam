from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from boto3.dynamodb.conditions import Attr
import anthropic
import json

from auth.router import verify_token
from config import get_anthropic_key
from db import get_cards_table
from .models import (
    DayCloseSummaryRequest,
    DayCloseSummaryResponse,
    DayCloseSaveRequest,
    DayClose,
)
from . import store

router = APIRouter(prefix="/dayclose", tags=["dayclose"])

# Cards in this status are finished work; everything else scheduled for the day
# counts as "not completed" when closing out.
_DONE_STATUS = "done"


def _validate_date(date: str) -> None:
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date; expected YYYY-MM-DD")


def _cards_for_day(username: str, date: str) -> list[dict]:
    """Owned, non-archived cards scheduled for the given day."""
    table = get_cards_table()
    items = table.scan(FilterExpression=Attr("username").eq(username)).get("Items", [])
    # Include legacy records (no username) for admin, mirroring cards listing.
    if username == "admin":
        items += [i for i in table.scan().get("Items", []) if "username" not in i]
    return [
        i for i in items
        if i.get("todo_date") == date and not bool(i.get("archived", False))
    ]


@router.post("/summary", response_model=DayCloseSummaryResponse)
def generate_summary(body: DayCloseSummaryRequest, username: str = Depends(verify_token)):
    """Generate an AI summary of a day's work, including what was left unfinished.
    The completed/incomplete breakdown is computed from the card data; Claude only
    writes the prose."""
    _validate_date(body.date)

    day_cards = _cards_for_day(username, body.date)
    completed = [c.get("title", "") for c in day_cards if c.get("status") == _DONE_STATUS]
    incomplete = [c.get("title", "") for c in day_cards if c.get("status") != _DONE_STATUS]

    if not day_cards:
        return DayCloseSummaryResponse(
            summary=(
                "Nothing was scheduled for this day, so there's no work to summarize. "
                "Jot down any learnings below before closing it out."
            ),
            completed=[],
            incomplete=[],
        )

    card_summaries = [
        {
            "title": c.get("title", ""),
            "description": c.get("description", ""),
            "status": c.get("status"),
            "completed": c.get("status") == _DONE_STATUS,
        }
        for c in day_cards
    ]

    client = anthropic.Anthropic(api_key=get_anthropic_key())
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a personal work assistant for a task manager called Card Slam. "
                    f"The user is closing out their day ({body.date}). Below are the cards that "
                    "were scheduled for that day, each marked completed or not. Write a brief, "
                    "friendly summary (one or two short paragraphs) of what they accomplished and "
                    "what was left unfinished. Be encouraging but honest about what didn't get done.\n\n"
                    "Return ONLY a JSON object, no markdown fences:\n"
                    '{"summary": "..."}\n\n'
                    f"Cards for the day: {json.dumps(card_summaries)}"
                ),
            }
        ],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Claude returned invalid JSON")

    return DayCloseSummaryResponse(
        summary=data.get("summary", ""),
        completed=completed,
        incomplete=incomplete,
    )


@router.get("/{date}", response_model=DayClose)
def get_day_close(date: str, username: str = Depends(verify_token)):
    """Return a previously saved closure so the modal can prefill it."""
    _validate_date(date)
    record = store.get_day_close(username, date)
    if not record:
        raise HTTPException(status_code=404, detail="Day not closed yet")
    return record


@router.post("", response_model=DayClose, status_code=201)
def save_day_close(body: DayCloseSaveRequest, username: str = Depends(verify_token)):
    """Close the day: persist the required learning plus the reviewed summary."""
    _validate_date(body.date)
    if not body.learning.strip():
        raise HTTPException(status_code=422, detail="Learning is required")
    return store.save_day_close(
        username, body.date, body.learning.strip(), body.ai_summary
    )
