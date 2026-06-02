import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from auth.router import router as auth_router
from categories.router import router as categories_router
from cards.router import router as cards_router
from ai.router import router as ai_router
from users.router import router as users_router
from reports.router import router as reports_router
from autocode.router import router as autocode_router
from onboarding.router import router as onboarding_router
from integrations.router import router as integrations_router
from dayclose.router import router as dayclose_router

app = FastAPI(title="Card Slam", docs_url="/api/docs", redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(cards_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(autocode_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(integrations_router, prefix="/api")
app.include_router(dayclose_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve React static build (only present in Docker image)
_static = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static):
    # JS/CSS bundles from the Vite build
    _assets = os.path.join(_static, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    # SPA fallback: serve index.html for every other GET request so that
    # refreshing /list, /calendar, etc. works without a 404.
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str = ""):
        return FileResponse(os.path.join(_static, "index.html"))
