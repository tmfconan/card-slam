#!/usr/bin/env bash
# Deploy application code to the SERVERLESS stack (Lambda API + S3/CloudFront SPA).
# Run from repo root: bash scripts/deploy-serverless.sh
#
# During migration the legacy ECS app is still deployed with scripts/deploy.sh;
# this script targets CardSlamServerlessStack. At cutover (Phase 5) this becomes
# the canonical deploy.sh.
#
# Set your SSO profile before running:
#   export AWS_PROFILE=AdministratorAccess-366258938689
#
# IMPORTANT: this ships application code only. Infra changes (anything in cdk/)
# require deploying the CDK stack FIRST:
#   (cd cdk && cdk deploy CardSlamServerlessStack --require-approval never)
set -euo pipefail

# Disable the AWS CLI v2 pager so the script doesn't leave the terminal in `less`.
export AWS_PAGER=""

REGION="us-east-2"
STACK="CardSlamServerlessStack"
API_FUNCTION="card-slam-api"
IMAGE_TAG="lambda-latest"

echo "=== Card Slam Serverless Deploy (application code only) ==="
echo "Note: infra changes (cdk/) require 'cd cdk && cdk deploy $STACK' FIRST."

# Verify AWS credentials before doing anything else
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
REPO_URI="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/card-slam"
echo "Account: $ACCOUNT  Region: $REGION"

# Read stack outputs (bucket + distribution) needed to publish the SPA.
get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}
SPA_BUCKET=$(get_output SpaBucketName)
CF_DIST_ID=$(get_output DistributionId)
if [[ -z "$SPA_BUCKET" || "$SPA_BUCKET" == "None" ]]; then
  echo "ERROR: could not read SpaBucketName from stack '$STACK'."
  echo "Make sure the CDK stack is deployed: cd cdk && cdk deploy $STACK"
  exit 1
fi
echo "SPA bucket: $SPA_BUCKET   CloudFront: $CF_DIST_ID"

# ── 1. API Lambda image ──────────────────────────────────────────────────────
echo "Logging in to ECR…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REPO_URI"

echo "Building API image (Dockerfile.lambda)…"
docker build --platform linux/amd64 -f Dockerfile.lambda -t card-slam-api:latest .

echo "Pushing image to ECR (${IMAGE_TAG})…"
docker tag card-slam-api:latest "${REPO_URI}:${IMAGE_TAG}"
docker push "${REPO_URI}:${IMAGE_TAG}"

echo "Updating Lambda function code…"
aws lambda update-function-code \
  --function-name "$API_FUNCTION" \
  --image-uri "${REPO_URI}:${IMAGE_TAG}" \
  --region "$REGION" \
  --query "LastUpdateStatus" --output text

# ── 2. Frontend SPA ──────────────────────────────────────────────────────────
echo "Building frontend…"
(cd frontend && npm ci && npm run build)

echo "Syncing SPA to s3://$SPA_BUCKET…"
aws s3 sync frontend/dist "s3://$SPA_BUCKET" --delete

echo "Invalidating CloudFront cache…"
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query "Invalidation.Status" --output text

echo ""
echo "=== Deploy complete ==="
echo "App URL: $(get_output AppURL)"
