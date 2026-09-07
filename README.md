# PharmaBoard

PharmaBoard is a trusted digital platform for Ghana's pharmacy profession. Its first responsibility is reliable, auditable delivery of official notices to verified professionals. The feed, Rx Forum, directory, and later messaging features keep that professional network useful between critical events.

> Status: functional development platform with official notices, community feed, professional profiles and follows, Rx Forum, group messaging, video call handoff, and a persistent learning/careers/session workspace. See [workspace capabilities and setup](docs/workspace.md) for supported integrations and remaining launch requirements.

Authentication now supports **email/password or Google sign-in**, without SMS. See [deployment and existing-account guidance](docs/authentication.md); apply migration 000011 before deploying this update.

## Architecture at a glance

- **Go modular monolith** for the API and asynchronous worker
- **PostgreSQL** for transactional data, durable jobs, and search
- **TypeScript** for future web and React Native clients
- **OpenAPI** as the client/server contract
- **Transactional outbox** and idempotent workers for notice delivery
- **Offline-first sync** designed for intermittent connectivity

The deliberate language choice is documented in [ADR-003](docs/adr/0003-language-and-runtime.md).

## Start locally

Requirements: Go 1.23+, PostgreSQL 16, and `make`. Docker Compose is the
default way to get Postgres. An existing PostgreSQL instance can also be used by setting `PHARMABOARD_DATABASE_URL`.

```bash
make bootstrap
make up          # or your existing PostgreSQL instance
make migrate
make run         # API on :8080
make worker      # in a second terminal: notice dispatch + sync watermark
```

Then check the service:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

Then start the web console (needs the API above already running):

```bash
cd web
npm install && cp .env.example .env
npm run dev      # http://localhost:5173
```

Use `scripts/smoke-test.sh` to exercise the notice lifecycle against the local API. There is no mobile client yet.

Run the quality gate:

```bash
make check              # unit tests only; DB-backed tests skip themselves
make test-integration   # same suite, against a real Postgres
```

## Deploying

`render.yaml` provisions the database, API, and worker on Render as a
Blueprint. See [docs/deploy-render.md](docs/deploy-render.md) — in
particular, migrations are applied manually there too (same reason as
above), and the background worker has no free tier on Render, unlike the
API and database.

## Repository map

```text
cmd/pharmaboard/       process entry point: serve, worker, migrate
internal/modules/      business modules and their owned boundaries
internal/platform/     infrastructure shared by modules
db/migrations/         append-only database migrations
api/                   OpenAPI contract
web/                   web console (Vite + React + TypeScript)
docs/                  product architecture, ADRs, and runbooks
scripts/               deterministic repository checks
```

## Delivery principles

1. Correctness and trust outrank feature count.
2. No patient data enters the system.
3. Critical publication uses two-person approval.
4. Every mutating API operation is idempotent.
5. Module boundaries are enforced before scale makes them expensive to recover.
6. Operational complexity is added only after a measured threshold is crossed.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [technical design](docs/technical-design.md) before opening a pull request. This repository intentionally has no open-source license yet; ownership and licensing must be agreed in writing during Phase 0.
