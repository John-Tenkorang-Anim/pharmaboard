.DEFAULT_GOAL := help

.PHONY: help bootstrap build test test-integration check run worker migrate migrate-down up down smoke db-reset web web-install

help: ## Show available commands

	@awk 'BEGIN {FS = ":.*## "; printf "PharmaBoard development commands:\n"} /^[a-zA-Z_-]+:.*?## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Create a local environment file
	@test -f .env || cp .env.example .env

build: ## Compile all Go packages
	go build ./...

test: ## Run unit tests with race detection (DB-backed tests skip automatically)
	go test -race -cover ./...

test-integration: ## Run the full suite including real-Postgres integration tests
	@set -a; [ -f .env ] && . ./.env; set +a; \
	PHARMABOARD_TEST_DATABASE_URL="$$PHARMABOARD_DATABASE_URL" go test -race -cover ./...

check: ## Run formatting, static analysis, tests, and repository checks
	@test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)
	go vet ./...
	go test -race -cover ./...
	./scripts/check-boundaries.sh

run: ## Run the API locally
	go run ./cmd/pharmaboard serve

worker: ## Run the notice dispatch worker and sync watermark publisher locally
	go run ./cmd/pharmaboard worker

migrate: ## Apply all database migrations in order
	@set -a; [ -f .env ] && . ./.env; set +a; \
	for f in db/migrations/*.up.sql; do \
		echo "applying $$f"; \
		psql "$$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$$f"; \
	done

migrate-down: ## Roll back all database migrations in reverse order
	@set -a; [ -f .env ] && . ./.env; set +a; \
	for f in $$(ls -r db/migrations/*.down.sql); do \
		echo "reverting $$f"; \
		psql "$$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$$f"; \
	done

up: ## Start local dependencies (requires Docker; see CLAUDE.md for a no-Docker alternative)
	docker compose up -d --wait

down: ## Stop local dependencies
	docker compose down

smoke: ## Exercise the running API end to end (requires `make run` + `make worker` up)
	./scripts/smoke-test.sh

db-reset: ## Wipe all application data in the dev database (destructive, dev only)
	@set -a; [ -f .env ] && . ./.env; set +a; \
	psql "$$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 \
		-c "TRUNCATE users, outbox_jobs, change_log, sync_watermarks RESTART IDENTITY CASCADE;"

web-install: ## Install web console dependencies (first time only)
	cd web && npm install
	@test -f web/.env || cp web/.env.example web/.env

web: ## Run the web console locally (requires `make run` + `make worker` up)
	cd web && npm run dev
