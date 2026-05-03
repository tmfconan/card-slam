.PHONY: test test-backend test-frontend

test-backend:
	cd backend && python3 -m pytest tests/ -v

test-frontend:
	cd frontend && node_modules/.bin/vitest run

test: test-backend test-frontend
