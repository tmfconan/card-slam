#!/usr/bin/env bash
# Build the Docker image and deploy to ECS Fargate.
# Run from repo root: bash scripts/deploy.sh
#
# Set your SSO profile before running:
#   export AWS_PROFILE=AdministratorAccess-366258938689
set -euo pipefail

REGION="us-east-2"

echo "=== Card Slam Deploy ==="

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

echo "Logging in to ECR…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REPO_URI"

echo "Building Docker image…"
docker build --platform linux/amd64 -t card-slam:latest .

echo "Tagging and pushing to ECR…"
docker tag card-slam:latest "$REPO_URI:latest"
docker push "$REPO_URI:latest"

echo "Triggering ECS rolling deployment…"
SERVICE=$(aws ecs list-services \
  --cluster card-slam \
  --region "$REGION" \
  --query "serviceArns[0]" \
  --output text | awk -F/ '{print $NF}')

if [[ -z "$SERVICE" || "$SERVICE" == "None" ]]; then
  echo "ERROR: No ECS service found in cluster 'card-slam'."
  echo "Make sure bootstrap.sh has been run and the CDK stack is deployed."
  exit 1
fi

aws ecs update-service \
  --cluster card-slam \
  --service "$SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --query "service.serviceName" \
  --output text

echo ""
echo "=== Deploy triggered ==="
echo "Check the ALB URL in the CloudFormation outputs (AppURL) for your app."
echo "The service will be live in ~2 minutes."
