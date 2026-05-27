.PHONY: test test-backend test-frontend

test-backend:
	cd backend && \
	  AWS_ACCESS_KEY_ID=testing \
	  AWS_SECRET_ACCESS_KEY=testing \
	  AWS_SESSION_TOKEN=testing \
	  AWS_DEFAULT_REGION=us-east-1 \
	  python3 -m pytest tests/ -v

test-frontend:
	cd frontend && node_modules/.bin/vitest run

test: test-backend test-frontend
