from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import anthropic
import json

from auth.router import verify_token
from config import get_anthropic_key

router = APIRouter(prefix="/ai", tags=["ai"])


class ParseRequest(BaseModel):
    prompt: str
    category_id: str


class WorkItem(BaseModel):
    title: str
    description: str


class ParseResponse(BaseModel):
    items: list[WorkItem]


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
