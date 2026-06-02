from pydantic import BaseModel


class DayCloseSummaryRequest(BaseModel):
    date: str  # YYYY-MM-DD — the day being closed out


class DayCloseSummaryResponse(BaseModel):
    summary: str
    completed: list[str] = []     # titles of cards finished that day
    incomplete: list[str] = []    # titles of cards scheduled but not finished


class DayCloseSaveRequest(BaseModel):
    date: str             # YYYY-MM-DD
    learning: str         # required — what the user learned that day
    ai_summary: str = ""  # the generated summary the user reviewed (optional)


class DayClose(BaseModel):
    date: str
    ai_summary: str = ""
    learning: str
    created_at: str
    updated_at: str
