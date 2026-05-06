#!/usr/bin/env bash
# One-time migration: create the admin user in DynamoDB and attribute all
# existing cards/categories to them.
#
# Run AFTER deploying the new CDK stack (which creates card-slam-users):
#   export AWS_PROFILE=<your-profile>
#   bash scripts/migrate-users.sh
set -euo pipefail

REGION="us-east-2"
SECRET_NAME="card-slam/config"
USERS_TABLE="card-slam-users"

echo "=== Card Slam User Migration ==="

aws sts get-caller-identity --query "Account" --output text >/dev/null \
  || { echo "ERROR: AWS credentials not configured."; exit 1; }

echo "Using profile: ${AWS_PROFILE:-default}"

# ── 1. Pull existing password hash from Secrets Manager ──────────────────────
echo "Fetching existing password hash from Secrets Manager…"
HASH=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query "SecretString" \
    --output text | python3 -c "import json,sys; print(json.load(sys.stdin).get('password_hash',''))")

if [[ -z "$HASH" ]]; then
    echo "ERROR: No password_hash found in Secrets Manager."
    echo "       Have you run bootstrap.sh on the old version?"
    exit 1
fi

# ── 2. Create admin user in DynamoDB (idempotent) ────────────────────────────
echo "Creating admin user in DynamoDB (skips if already exists)…"
aws dynamodb put-item \
    --table-name "$USERS_TABLE" \
    --region "$REGION" \
    --item "{
        \"username\": {\"S\": \"admin\"},
        \"password_hash\": {\"S\": \"$HASH\"},
        \"role\": {\"S\": \"admin\"},
        \"created_at\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
    }" \
    --condition-expression "attribute_not_exists(username)" 2>/dev/null \
  && echo "  Admin user created." \
  || echo "  Admin user already exists — skipped."

# ── 3. Back-fill username="admin" on all existing cards/categories ────────────
echo "Attributing legacy cards and categories to admin…"
python3 - <<'PYEOF'
import boto3, os
from boto3.dynamodb.conditions import Attr

region = "us-east-2"
db = boto3.resource("dynamodb", region_name=region)

for table_name, pk in [("card-slam-cards", "id"), ("card-slam-categories", "id")]:
    table = db.Table(table_name)
    items = table.scan(
        FilterExpression=Attr("username").not_exists()
    ).get("Items", [])
    for item in items:
        table.update_item(
            Key={pk: item[pk]},
            UpdateExpression="SET username = :u",
            ExpressionAttributeValues={":u": "admin"},
        )
    print(f"  {table_name}: updated {len(items)} records")
PYEOF

echo ""
echo "=== Migration complete ==="
echo "You can now deploy the new application code."
