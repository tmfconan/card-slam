# card-slam

Work organizer powered by AI. Kanban-style task management with Claude-assisted card creation — describe work in plain text and let the AI break it into actionable items.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | FastAPI (Python 3.12) + Uvicorn |
| Storage | DynamoDB |
| AI | Claude Sonnet 4.6 via Anthropic API |
| Auth | Single-user, bcrypt hash in Secrets Manager, JWT, captcha + brute-force lockout |
| Infra | AWS CDK — Lambda (container image) behind a Function URL, CloudFront + S3, DynamoDB, ECR |

In production, CloudFront serves the React build from a private S3 bucket and routes `/api/*` to the FastAPI Lambda — so the SPA and API share one origin. Locally, Uvicorn serves both from `http://localhost:8000`.

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

## Auto-Code Feature

Card Slam includes an automated feature implementation pipeline powered by Claude Code:

1. **Request** — Mark a card with a feature description and submit it as a feature request
2. **Build** — AWS CodeBuild spins up, creates a branch, and invokes Claude Code CLI to implement the feature
3. **Test** — All tests run automatically (backend + frontend)
4. **Deploy** — On success, the API Lambda container image is rebuilt and the function is updated, and the SPA is republished to S3 + CloudFront
5. **Merge** — Review the auto-code branch and merge from the card detail view, or enable auto-merge to merge automatically once the build passes; the card shows a **Merged** status when complete

The pipeline is defined in the CDK stack's inline buildspec (`cdk/card_slam/serverless_stack.py`) and requires these environment variables (configured in CDK):
- `ANTHROPIC_API_KEY` — For Claude Code
- `GITHUB_TOKEN` — For pushing branches
- Infrastructure details (ECR repo, S3 bucket, CloudFront distribution, DynamoDB tables)

The pipeline is provisioned only when the stack is deployed with `-c enable_autocode=true`.

**Note:** The auto-code system is self-aware and won't modify its own implementation files (`backend/autocode/`, `buildspec.yml`, `cdk/`).

## Other Features

- **Dark Mode** — Light/dark theme toggle, persisted per-user (`PUT /api/auth/me/theme`) so your preference follows you across sessions
- **What's Goin' On** — AI-generated summary of your current workload plus suggested next cards (`POST /api/ai/whats-goin-on`)
- **Weekly Plan Assist** — Let Claude propose a week's schedule from the calendar view, then review and apply it
- **Onboarding Walkthrough** — Guided first-run steps for new users
- **Login Security** — Captcha and anti-brute-force lockout on the login flow
- **Bulk Actions** — Multi-select cards on the List view to delete or archive in one go
- **Archived Cards** — Archive cards and view/restore them from a dedicated Archive view
- **This Week Filter** — Filter the Kanban board to cards due this week
- **Reports** — Pie chart breakdown of work
- **Auto-Code** — Submit feature requests from cards; auto-merge and a "Merged" status close the loop after CodeBuild finishes

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

### Infrastructure changes

Apply any change under `cdk/` before shipping application code:

```bash
cd cdk && cdk deploy CardSlamServerlessStack --require-approval never
# add -c enable_autocode=true to (re)provision the auto-code pipeline
```

### Subsequent deploys (application code)

```bash
bash scripts/deploy.sh
```

Rebuilds the API Lambda container image (`Dockerfile.lambda`) and updates the function, then rebuilds the SPA and syncs it to S3 + invalidates CloudFront. The bucket and distribution id are read from the `CardSlamServerlessStack` outputs. Live in ~1–2 minutes.

### Infrastructure

Defined in `cdk/` (`CardSlamServerlessStack`). Key resources:

- **Lambda** — FastAPI served via Mangum as a container image, invoked through a Function URL
- **CloudFront + S3** — private S3 bucket (OAC) holds the React build; CloudFront serves it and routes `/api/*` to the Lambda Function URL. App URL is output as `AppURL`
- **DynamoDB** — pay-per-request, five tables (categories, cards, users, feature-runs, integrations); `RETAIN` removal policy
- **Secrets Manager** — `card-slam/config` holds `jwt_secret`, `password_hash`, `anthropic_api_key`, `github_pat`
- **ECR** — Lambda container image registry (the repo has a policy allowing the Lambda service to pull)
- **CodeBuild + EventBridge + queue-processor Lambda** — the auto-code pipeline (only when deployed with `-c enable_autocode=true`)
- **CloudWatch Logs**

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
├── cdk/               # AWS CDK stack (Python) — CardSlamServerlessStack
├── scripts/           # dev.sh, bootstrap.sh, deploy.sh
├── Dockerfile         # Multi-stage local/container image (Uvicorn; Node builds React)
├── Dockerfile.lambda  # API-only Lambda container image (Mangum); SPA served from S3
└── docker-compose.yml # Local DynamoDB only
```
