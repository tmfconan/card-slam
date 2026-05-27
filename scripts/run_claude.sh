#!/usr/bin/env bash
# Runs Claude Code as a non-root user.
# CodeBuild runs as root, but claude --dangerously-skip-permissions is blocked as root.
set -euo pipefail

# Create a non-root builder user (idempotent)
adduser --disabled-password --gecos "" builder 2>/dev/null \
  || useradd -m builder 2>/dev/null \
  || true

# Hand over ownership of the source tree and npm cache
chown -R builder "${CODEBUILD_SRC_DIR}"
[ -d /root/.npm ] && cp -r /root/.npm /home/builder/.npm && chown -R builder /home/builder/.npm || true

# Write prompt to a file to avoid shell quoting issues
cat > /tmp/claude_prompt << PROMPTEOF
Implement the following feature for the Card Slam work management app.

Card Slam is a personal task manager:
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS (in /frontend/src/)
- Backend: FastAPI + Python + DynamoDB (in /backend/)
- Both served from a single Fargate container

Feature to implement:
Title: ${FEATURE_TITLE}
Description:
${FEATURE_DESCRIPTION}

Requirements:
- Make all changes needed across frontend and backend
- Follow existing code patterns and conventions
- Add or update tests in backend/tests/ and frontend/src/__tests__/ as appropriate
- Ensure all existing tests still pass after your changes
- Do not modify the auto-code feature itself (backend/autocode/, cdk/)
PROMPTEOF

chown builder /tmp/claude_prompt

# Run Claude Code as non-root
sudo -u builder \
  env ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
      HOME="/home/builder" \
      PATH="${PATH}" \
  sh -c "cd '${CODEBUILD_SRC_DIR}' && claude --dangerously-skip-permissions -p \"\$(cat /tmp/claude_prompt)\""
