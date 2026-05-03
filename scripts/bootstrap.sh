#!/usr/bin/env bash
# First-time setup: creates secrets, bootstraps CDK, and deploys.
# Run once from the repo root: bash scripts/bootstrap.sh
#
# Set your SSO profile before running:
#   export AWS_PROFILE=AdministratorAccess-366258938689
set -euo pipefail

REGION="us-east-2"
SECRET_NAME="card-slam/config"

echo "=== Card Slam Bootstrap ==="

# Check AWS access
if ! ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null); then
  echo ""
  echo "ERROR: AWS credentials are missing or expired."
  echo "Run the following and try again:"
  echo "  export AWS_PROFILE=AdministratorAccess-366258938689"
  echo "  aws sso login --profile AdministratorAccess-366258938689"
  echo ""
  exit 1
fi

echo "Using profile: ${AWS_PROFILE:-default}"
echo "Account: $ACCOUNT  Region: $REGION"

# Ensure bcrypt is available
python3 -c "import bcrypt" 2>/dev/null || pip3 install -q bcrypt

# Admin password
echo -n "Set admin password: "
read -rs PASSWORD; echo
PASSWORD_HASH=$(python3 -c "import bcrypt, sys; print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt()).decode())" "$PASSWORD")

# Anthropic API key
echo -n "Anthropic API key: "
read -rs ANTHROPIC_KEY; echo

# JWT secret (auto-generated)
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

SECRET_JSON=$(python3 -c "
import json, sys
print(json.dumps({
  'jwt_secret': sys.argv[1],
  'password_hash': sys.argv[2],
  'anthropic_api_key': sys.argv[3],
}))" "$JWT_SECRET" "$PASSWORD_HASH" "$ANTHROPIC_KEY")

echo "Creating/updating secret in Secrets Manager…"
aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1 \
  && aws secretsmanager update-secret \
       --secret-id "$SECRET_NAME" \
       --secret-string "$SECRET_JSON" \
       --region "$REGION" >/dev/null \
  || aws secretsmanager create-secret \
       --name "$SECRET_NAME" \
       --secret-string "$SECRET_JSON" \
       --region "$REGION" >/dev/null
echo "Secret saved."

# CDK bootstrap + deploy
echo "Installing CDK dependencies…"
pip3 install -q -r cdk/requirements.txt

echo "Bootstrapping CDK environment…"
(cd cdk && cdk bootstrap "aws://$ACCOUNT/$REGION" --require-approval never)

echo "Deploying CDK stack…"
(cd cdk && cdk deploy --require-approval never)

echo ""
echo "=== Stack deployed! ==="
echo "Next: build and push the Docker image with:  bash scripts/deploy.sh"
