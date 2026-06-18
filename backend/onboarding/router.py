from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials

from auth.router import security, _decode

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# Ordered walkthrough that guides a signed-in user through setting up their
# first board. Sign-in / account creation steps are intentionally omitted —
# the user must already be signed in to view this tutorial. Each step
# describes what to click, where to look, and what to expect.
STEPS = [
    {
        "id": 1,
        "title": "Get oriented in the sidebar",
        "summary": "The dark sidebar on the left is your main navigation.",
        "location": "Left edge of the screen",
        "action": "Look at the sidebar. You'll see links for Kanban, List, Calendar, Categories, and Reports. Click the ◀ button at the top to collapse it, and the ☰ button to bring it back. The '?' help icon next to the Card Slam title reopens this tutorial any time.",
        "expect": "The active page is highlighted in blue. On small screens the sidebar starts collapsed — tap ☰ to open it.",
    },
    {
        "id": 2,
        "title": "Create your first category",
        "summary": "Categories color-code your cards so your board stays readable.",
        "location": "Categories page (sidebar → Categories)",
        "action": "Click 'Categories' in the sidebar. In the 'New Category' card at the top, type a name (e.g. 'Work' or 'Personal'), pick a color from the swatches, and click 'Add category'.",
        "expect": "The new category appears in the list below with the color dot you chose. You can edit or delete it later from the same page.",
    },
    {
        "id": 3,
        "title": "Add your first card with the prompt bar",
        "summary": "The prompt bar at the top of the board uses AI to break work into cards.",
        "location": "The bar across the top of the Kanban, List, and Calendar views",
        "action": "Type a sentence describing something you need to do — for example, 'plan the team offsite' — and press Enter. A confirmation dialog lists the cards the AI proposes. Pick a category and click 'Create'.",
        "expect": "The cards land in the leftmost 'Brainstorm' column of the Kanban board, color-coded by the category you chose.",
    },
    {
        "id": 4,
        "title": "Quick-add a card directly",
        "summary": "Skip the AI if you already know what you want to add.",
        "location": "Prompt bar's '+ Direct add' control",
        "action": "Click '+ Direct add' on the prompt bar. Enter a title, optional description, category, and an optional due date, then click 'Create'.",
        "expect": "The card appears in Brainstorm immediately, with no AI step in between.",
    },
    {
        "id": 5,
        "title": "Move cards across the Kanban board",
        "summary": "Drag cards between columns to reflect their status.",
        "location": "Kanban view (sidebar → Kanban, the default page)",
        "action": "Grab a card from Brainstorm and drag it to 'Ready to do'. As work progresses, drag it through 'In progress', 'Needs finishing', and finally 'Done'.",
        "expect": "The card snaps into the target column and its status persists across refreshes. Velocity reports start counting it once it leaves Brainstorm.",
    },
    {
        "id": 6,
        "title": "Open a card to add detail",
        "summary": "The detail panel is where you flesh out a card.",
        "location": "Any card on any view",
        "action": "Click a card title to open the detail panel. Edit the title, description, category, priority, due date, or estimated duration, then click 'Save'.",
        "expect": "Your changes appear immediately on the board. The 'High priority' toggle adds a flag so the card surfaces above others in lists.",
    },
    {
        "id": 7,
        "title": "Plan your day on the Calendar",
        "summary": "Time-block cards into specific days and times.",
        "location": "Calendar view (sidebar → Calendar)",
        "action": "Click 'Calendar', then click a day to switch to Day view. Drag cards from the sidebar onto a time slot, or use 15-minute handles to resize.",
        "expect": "The card now has a scheduled date and duration. The Direct-add control defaults to 8 AM on the day you've selected.",
    },
    {
        "id": 8,
        "title": "Check your velocity",
        "summary": "Reports tell you how much of your committed work is getting done.",
        "location": "Reports page (sidebar → Reports)",
        "action": "Click 'Reports'. Read the three stat cards (Total Committed, Total Done, Completion Rate) and the weekly cohort chart. Use the Prev/Next buttons to scrub through prior weeks.",
        "expect": "You'll see your completion rate as a percentage and a stacked bar chart of committed vs. done cards by week. New accounts start at 0% — that's normal.",
    },
    {
        "id": 9,
        "admin_only": True,
        "title": "Request a feature with auto-code",
        "summary": "Card Slam can build its own new features from your feature request cards.",
        "location": "Feature Requests page (sidebar → Feature Requests, admin only)",
        "action": "Create a card in the 'Feature Request' category describing what you want — e.g. 'Add a dark mode toggle to the sidebar'. An admin opens the Feature Requests page, validates the request, and queues it for the auto-code build. You can watch the status badge change from Validating → Queued → Building → Deployed.",
        "expect": "Once Deployed, the new behavior is live in the app on the next page load. If the build fails, the badge turns red and a CloudWatch log link is available for diagnosis.",
    },
    {
        "id": 10,
        "title": "You're set up",
        "summary": "From here, build the habit.",
        "location": "Anywhere in the app",
        "action": "Capture work as it comes in via the prompt bar, move cards through the Kanban columns daily, and check Reports weekly to spot patterns. Reopen this tutorial any time from the '?' icon next to the Card Slam title.",
        "expect": "Within a couple of weeks your weekly cohort chart will start filling in and Card Slam will reflect how you actually work.",
    },
]


@router.get("/steps")
def list_steps(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Return the ordered onboarding walkthrough steps.

    Steps flagged ``admin_only`` (e.g. the auto-code feature request workflow)
    are hidden from regular users, who can't reach the pages they describe.
    The flag itself is internal, so it's stripped from the response.
    """
    is_admin = _decode(credentials).get("role") == "admin"
    steps = [
        {k: v for k, v in step.items() if k != "admin_only"}
        for step in STEPS
        if is_admin or not step.get("admin_only")
    ]
    return {"steps": steps}
