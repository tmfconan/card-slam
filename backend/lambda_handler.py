"""
AWS Lambda entrypoint for the FastAPI app (serverless deployment).

Mangum adapts the ASGI `app` to the Lambda event/context interface. This is used
by the container-image Lambda (`Dockerfile.lambda`) fronted by a Function URL /
CloudFront. The original Fargate/uvicorn entrypoint in `main.py` is unaffected.

`lifespan="off"` because the app has no ASGI startup/shutdown work — secrets and
DynamoDB clients are loaded lazily on first request (see config.py / db.py).
"""
from mangum import Mangum

from main import app

handler = Mangum(app, lifespan="off")
