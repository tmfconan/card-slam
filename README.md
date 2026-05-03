# card-slam

Work organizer powered by AI. Kanban-style task management with Claude-assisted card creation — describe work in plain text and let the AI break it into actionable items.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | FastAPI (Python 3.12) + Uvicorn |
| Storage | DynamoDB |
| AI | Claude Sonnet 4.6 via Anthropic API |
| Auth | Single-user, bcrypt hash in Secrets Manager, JWT |
| Infra | AWS CDK — single Fargate container, ALB, ECR |

The container serves both the API (`/api/*`) and the React static build from the same origin.

## Local Development

### Prerequisites

- Python 3.12+
- Node 20+
- Docker (for local DynamoDB)

### Start the backend

```bash
bash scripts/dev.sh
```

The script installs Python dependencies, starts DynamoDB Local on port 8002, creates tables, and runs FastAPI on `http://localhost:8000`. On first run it will prompt for `ANTHROPIC_API_KEY` and `PASSWORD_HASH` and write them to `.env`.

To generate a `PASSWORD_HASH`:

```python
python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

### Start the frontend dev server

In a separate terminal:

```bash
cd frontend && npm install && npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to `localhost:8000`.

### Environment variables (`.env`)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `PASSWORD_HASH` | Bcrypt hash of admin password |
| `JWT_SECRET` | JWT signing key (auto-generated if absent) |
| `DYNAMODB_ENDPOINT` | `http://localhost:8002` for local dev |
| `CATEGORIES_TABLE` | DynamoDB table name for categories |
| `CARDS_TABLE` | DynamoDB table name for cards |
| `AWS_DEFAULT_REGION` | `us-east-2` |

### API docs

FastAPI auto-generates docs at `http://localhost:8000/api/docs`.

## Testing

```bash
make test            # run all tests (backend + frontend)
make test-backend    # Python only  — pytest with moto (mocked DynamoDB)
make test-frontend   # React only   — Vitest + Testing Library + MSW
```

Backend tests live in `backend/tests/` and require no running services — DynamoDB is fully mocked with moto. Frontend tests live in `frontend/src/__tests__/` and mock all API calls with MSW.

Coverage report:

```bash
cd frontend && node_modules/.bin/vitest --coverage
```

## Deployment

### First time

1. Log in to AWS SSO:
   ```bash
   export AWS_PROFILE=<your-profile>
   aws sso login --profile $AWS_PROFILE
   ```
2. Run bootstrap (creates the Secrets Manager secret, bootstraps CDK, deploys the stack):
   ```bash
   bash scripts/bootstrap.sh
   ```
   The script prompts for your admin password and Anthropic API key.

### Subsequent deploys

```bash
bash scripts/deploy.sh
```

Builds a `linux/amd64` Docker image, pushes to ECR, and triggers a rolling ECS deployment. The new version is live in ~2 minutes.

### Infrastructure

Defined in `cdk/`. Key resources:

- **ECS Fargate** — single container serving API + static frontend
- **ALB** — port 80, DNS output as `AppURL`
- **DynamoDB** — pay-per-request, two tables
- **Secrets Manager** — `card-slam/config` holds `jwt_secret`, `password_hash`, `anthropic_api_key`
- **ECR** — image registry, URI output as `ECRRepository`
- **CloudWatch Logs** — 1-week retention

## Make Commands

| Command | Description |
|---|---|
| `make test` | Run all tests |
| `make test-backend` | Backend tests only |
| `make test-frontend` | Frontend tests only |

## Project Structure

```
card-slam/
├── frontend/          # React app
├── backend/           # FastAPI — auth, cards, categories, ai modules
├── cdk/               # AWS CDK stack (Python)
├── scripts/           # dev.sh, bootstrap.sh, deploy.sh
├── Dockerfile         # Multi-stage: Node builds React, Python runtime copies dist/
└── docker-compose.yml # Local DynamoDB only
```
