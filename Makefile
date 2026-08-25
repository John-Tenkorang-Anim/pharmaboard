.DEFAULT_GOAL := help

.PHONY: help bootstrap build test check run up down

help: ## Show available commands

	@awk 'BEGIN {FS = ":.*## "; printf "PharmaBoard development commands:\n"} /^[a-zA-Z_-]+:.*?## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Create a local environment file
	@test -f .env || cp .env.example .env

build: ## Compile all Go packages
	go build ./...

test: ## Run tests with race detection
	go test -race -cover ./...

check: ## Run formatting, static analysis, tests, and repository checks
	@test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)
	go vet ./...
	go test -race -cover ./...
	./scripts/check-boundaries.sh

run: ## Run the API locally
	go run ./cmd/pharmaboard serve

up: ## Start local dependencies
	docker compose up -d --wait

down: ## Stop local dependencies
	docker compose down
