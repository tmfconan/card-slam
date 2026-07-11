"""
AWS Lambda entrypoint for the FastAPI app (serverless deployment).

Mangum adapts the ASGI `app` to the Lambda event/context interface. This is used
by the container-image Lambda (`Dockerfile.lambda`) fronted by a Function URL /
CloudFront. The original Fargate/uvicorn entrypoint in `main.py` is unaffected.

`lifespan="off"` because the app has no ASGI startup/shutdown work — secrets and
DynamoDB clients are loaded lazily on first request (see config.py / db.py).

Trailing-slash fix: Lambda Function URLs normalize the request path and strip a
trailing slash before it reaches the app. FastAPI routes registered with a
trailing slash (e.g. `/api/cards/`) then 307-redirect to add it back; the client
re-requests, the slash is stripped again — an infinite redirect loop. The
`RestoreTrailingSlash` shim re-adds the slash for exactly the paths whose only
registered route is the trailing-slash form. The set is derived from the app's
own routes at import time, so it stays correct as routes are added or removed.
This lives only in the Lambda entrypoint — no app/router code changes, and the
Fargate deployment (where slashes are preserved) is unaffected.
"""
from mangum import Mangum
from starlette.types import ASGIApp, Receive, Scope, Send

from main import app

# Registered paths, taken from the OpenAPI schema. We can't read `app.routes`
# directly: recent FastAPI stores included routers as lazy `_IncludedRouter`
# placeholders whose sub-routes aren't flattened (and have no `.path`) until the
# schema is built. `app.openapi()` forces that materialization and is stable
# public API. Includes templated paths (e.g. `/api/cards/{card_id}`), which is
# harmless — a concrete request never equals a template string.
_EXACT_PATHS = set(app.openapi().get("paths", {}).keys())
# Paths whose canonical form ends in a slash — the ones the Function URL breaks.
_SLASHED_PATHS = {p for p in _EXACT_PATHS if p.endswith("/")}


class RestoreTrailingSlash:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope["path"]
            if (
                not path.endswith("/")
                and path not in _EXACT_PATHS
                and f"{path}/" in _SLASHED_PATHS
            ):
                scope = dict(scope)
                scope["path"] = f"{path}/"
                scope["raw_path"] = scope["path"].encode("utf-8")
        await self.app(scope, receive, send)


handler = Mangum(RestoreTrailingSlash(app), lifespan="off")
