#!/usr/bin/env bash
# Start the local development environment.
# Run from repo root: bash scripts/dev.sh
#
# Requires: docker, python3, pip3
# In a second terminal: cd frontend && npm run dev
set -euo pipefail

DYNAMO_ENDPOINT="http://localhost:8002"

echo "=== Card Slam Dev ==="

# ── Install backend deps first (boto3 needed for table setup below) ───────────
echo "Installing backend dependencies…"
pip3 install -q -r backend/requirements.txt

# ── Load .env safely (handles $2b$ bcrypt hashes without bash expanding them) ─
if [[ -f .env ]]; then
  echo "Loading .env"
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    # Strip surrounding single or double quotes if present
    [[ "$value" == \'*\' ]] && value="${value:1:${#value}-2}"
    [[ "$value" == \"*\" ]] && value="${value:1:${#value}-2}"
    export "${key}=${value}"
  done < .env
fi

# ── Prompt for any missing secrets ───────────────────────────────────────────
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo -n "Anthropic API key: "
  read -rs ANTHROPIC_API_KEY; echo
  export ANTHROPIC_API_KEY
fi

if [[ -z "${PASSWORD_HASH:-}" ]]; then
  echo -n "Set local dev password: "
  read -rs _PW; echo
  PASSWORD_HASH=$(python3 -c "import bcrypt,sys; print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt()).decode())" "$_PW")
  export PASSWORD_HASH
  echo "Add this to .env to skip next time:"
  echo "  PASSWORD_HASH=${PASSWORD_HASH}"
fi

export JWT_SECRET="${JWT_SECRET:-local-dev-jwt-secret}"
export DYNAMODB_ENDPOINT="$DYNAMO_ENDPOINT"
export AWS_DEFAULT_REGION="us-east-2"
# DynamoDB Local doesn't validate credentials, but boto3 requires non-empty values
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"

# ── DynamoDB Local ────────────────────────────────────────────────────────────
echo "Starting DynamoDB Local…"
# --env-file /dev/null prevents docker compose from reading root .env
# (which confuses it because bcrypt hashes contain $ signs)
docker compose --env-file /dev/null up -d dynamodb-local

echo -n "Waiting for DynamoDB Local to be ready"
for i in {1..30}; do
  if python3 -c "
import boto3
boto3.client('dynamodb', endpoint_url='http://localhost:8001',
    region_name='us-east-2', aws_access_key_id='local',
    aws_secret_access_key='local').list_tables()
" 2>/dev/null; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 1
done

echo "Creating tables if needed…"
python3 - <<'PYEOF'
import boto3, os

db = boto3.client(
    "dynamodb",
    endpoint_url=os.environ["DYNAMODB_ENDPOINT"],
    region_name="us-east-2",
    aws_access_key_id="local",
    aws_secret_access_key="local",
)

existing = db.list_tables()["TableNames"]

tables = [
    dict(
        TableName="card-slam-categories",
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    ),
    dict(
        TableName="card-slam-cards",
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    ),
]

for t in tables:
    if t["TableName"] not in existing:
        db.create_table(**t)
        print(f"  Created {t['TableName']}")
    else:
        print(f"  {t['TableName']} already exists")
PYEOF

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "=== FastAPI running at http://localhost:8000 ==="
echo "Run in another terminal: cd frontend && npm run dev"
echo ""

cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
