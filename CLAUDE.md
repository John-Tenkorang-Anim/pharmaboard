# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.
Keep this file current as the system evolves — it is the fastest way to get
a cold agent to correct, idiomatic changes instead of plausible-looking ones.

## What this project is

PharmaBoard is a trusted communications rail for Ghana's pharmacy
profession: verified professional identity plus durable, auditable delivery
of official notices, wrapped around a directory, feed, and Rx Forum. The
full product and engineering rationale lives in
[`docs/technical-design.md`](docs/technical-design.md) — **read it before
making an architectural change**; this file is the day-to-day supplement,
not a replacement.

The one-sentence differentiator: a published notice's audience is frozen in
a single database transaction and never silently edited. Everything else
(the modular monolith, PostgreSQL-only stack, no Kafka/Redis/microservices)
exists to protect that guarantee without paying for distributed-systems
complexity the traffic volume doesn't need. See `docs/adr/` before
reaching for a new piece of infrastructure — the answer is usually "measure
first."

## Current implementation state

This is a backend MVP, not the full roadmap in section 19 of the technical
design. What exists and runs today:

- **identity**: registration, dev-mode OTP login (see "Auth in development"
  below — there is no real SMS/email provider), bearer sessions, manual
  verification/revocation with recorded evidence.
- **notices**: full state machine (draft → in_review → approved →
  published → withdrawn), the two-person approval rule, the transactional
  publish/audience-freeze, delivery reports, acknowledgement.
- **admin**: least-privilege role grants (`author`, `approver`,
  `publisher_admin`, `auditor`), a one-time bootstrap for the first
  `publisher_admin`, audit-trail reads.
- **sync**: the safe-watermark change-log page (`GET /v1/sync`) and the
  advisory-lock barrier that makes it safe (`internal/platform/changelog`).
- **messaging**: direct (2-person) and small-group (up to 20) conversations,
  append-only messages, read receipts, and brokered third-party video calls
  (Jitsi Meet room links). **Added ahead of the technical design's own
  roadmap gate — read
  [`docs/adr/0004-early-messaging-and-video.md`](docs/adr/0004-early-messaging-and-video.md)
  before touching this module.** No end-to-end encryption claim (TLS
  transport only, disclosed via `EncryptionNotice` on every response) and
  no custom video infrastructure (a public third-party room link, disclosed
  via `VideoProviderNotice`) — both are deliberate, documented decisions,
  not gaps to "fix."
- **worker**: outbox-driven dispatch to a push channel via a `Provider`
  interface, retry with backoff+jitter, dead-lettering, plus the periodic
  watermark publisher and idempotency-key janitor.
- **web console** (`web/`): a Vite + React + TypeScript SPA covering every
  module above — auth (register + dev-OTP login), notices (list, compose,
  the full approve/publish/withdraw lifecycle, live delivery report),
  messaging (two-pane conversation view, video call handoff), and admin
  (bootstrap, role grants, verification, audit trail). See "The web
  console" below.

Not implemented — do not assume these exist: **community** (feed, forum —
so there is no user directory/search; see the web console's "New
conversation" gap below), **media** (uploads, scanning), real push/SMS/
email providers, a mobile client, row-level authorization beyond "does the
caller hold this role," messaging moderation/blocking (see ADR-0004's
consequences), and any of the Gate 0 legal/compliance prerequisites in
section 21 of the technical design (those are owned outside engineering
and are not something code can satisfy).

### Known simplifications (fix before this goes near real user data)

- **OpenAPI (`api/openapi.yaml`) only covers `/healthz` and `/readyz`.**
  The new endpoints under `/v1/auth`, `/v1/notices`, `/v1/admin`, `/v1/sync`
  exist in code but not yet in the contract. Section 15 requires OpenAPI to
  be the source of truth — extend the spec before adding a generated
  client, and treat spec drift as a bug.
- **Row-level authorization is minimal.** Any authenticated user can submit
  or approve any notice; only "approver ≠ author" and role checks for admin
  actions are enforced. Production needs "is this user the notice's
  publisher/an approver for this institution" checks in `notices.Service`.
- **The canonical audience-rule hash** (section 9, step 4) is recorded in
  the audit event's metadata, not a dedicated `notices` column — there was
  no reason to add a migration for it at this scale. Revisit if audit
  metadata queries become a bottleneck.
- **Idempotency-Key enforcement** (`internal/platform/idempotency`) is
  implemented and used nowhere yet. The state-machine's optimistic-
  concurrency version check already prevents duplicate side effects on
  retry for every mutation endpoint, which is why this wasn't wired in
  first. Wire it into `POST /v1/notices` (the one mutation with no natural
  version to conflict on) before relying on it.
- **Withdrawal does not yet send a correction to the frozen audience**
  (section 9). It records the withdrawal and reason; building the
  correction-notice flow is a straightforward follow-on using the same
  publish path.
- Sequence/UUID note: `delivery_attempts.id` and `outbox_jobs.id` are
  generated by Postgres (`gen_random_uuid()` / `IDENTITY`), not the
  application. Section 15's UUIDv7 requirement applies to *externally
  visible* IDs — `notices.id`, `users.id` — which are generated in Go via
  `uuid.NewV7()`. Keep that distinction if you add new tables.

## Module boundaries — this is enforced, not a suggestion

`scripts/check-boundaries.sh` (run by `make check` and CI) greps every
module's imports against an explicit allowlist and fails the build on any
edge not listed. The current allowed graph:

| Module | May import |
|---|---|
| `identity` | (nothing — platform only) |
| `notices` | `identity` |
| `community` | `identity` |
| `sync` | (nothing — reads shared platform tables only) |
| `media` | `identity` |
| `messaging` | `identity` |
| `admin` | `identity`, `notices`, `community` |

If you need a dependency not on this list, that's a design decision, not a
script to bypass: either the target module should expose an interface the
caller can use per the existing pattern (see `identity.AudienceSource`,
which `notices` depends on to resolve a targeting rule *inside its own
transaction* without ever touching the `users` table), or the capability
belongs in `internal/platform` instead of a business module. Update the
table in both this file and the script together.

Generic infrastructure — the outbox, the audit trail, the change log/
watermark barrier, idempotency-key storage — lives under
`internal/platform/*`, not inside a business module, even though sections
8–9 of the technical design describe them near specific modules. They are
mechanisms every module needs, not business rules any one module owns.

## Running it locally

### If you have Docker

```
make bootstrap   # copy .env.example -> .env
make up          # postgres via docker compose
make migrate     # apply db/migrations/*.up.sql with psql
make run         # serve API on :8080
make worker      # in a second terminal: dispatch + watermark publisher
```

### If you don't have Docker (or Go) installed

This exact situation came up building this MVP — the dev machine had
neither Go nor Docker nor Homebrew. Rather than block on that, both were
installed user-local, no sudo, no Homebrew:

- **Go**: downloaded straight from `go.dev/dl` (JSON API gives the current
  version + sha256), extracted to `~/.local/pharmaboard-toolchain/go`.
- **PostgreSQL**: via [Postgres.app](https://postgresapp.com) — its
  release `.dmg` mounts, and the `.app` bundle itself contains fully
  relocatable binaries (`initdb`, `pg_ctl`, `postgres`, `psql`) under
  `Contents/Versions/16/bin`. Copied out of the mounted volume into the
  same toolchain directory; no `/Applications` install, no admin prompt.
- **Node.js**: the official `nodejs.org/dist` tarball for the platform,
  extracted the same way, for the web console.

All three are on `PATH` via a block appended to `~/.zprofile` — open a new
terminal and `go version` / `psql --version` / `node --version` should just
work. If they don't (e.g. a non-login shell), source
`~/.local/pharmaboard-toolchain/env.sh` directly.

To run a Postgres cluster this way instead of `make up`:

```
DATA_DIR="$HOME/.local/pharmaboard-toolchain/pgdata"
initdb --auth=trust --username=postgres -D "$DATA_DIR"   # once
pg_ctl -D "$DATA_DIR" -l "$HOME/.local/pharmaboard-toolchain/postgres.log" \
  -o "-p 5544 -k $HOME/.local/pharmaboard-toolchain" start
psql -h "$HOME/.local/pharmaboard-toolchain" -p 5544 -U postgres -d postgres \
  -c "CREATE ROLE pharmaboard LOGIN SUPERUSER PASSWORD 'pharmaboard';" \
  -c "CREATE DATABASE pharmaboard OWNER pharmaboard;"
```

Then point `PHARMABOARD_DATABASE_URL` in `.env` at
`postgres://pharmaboard:pharmaboard@localhost:5544/pharmaboard?sslmode=disable`
and run `make migrate`, `make run`, `make worker` as above.

### The web console

`web/` is a Vite + React + TypeScript SPA (TanStack Query for server
state, React Router, Tailwind). It talks to the API over plain HTTP with
CORS — see `internal/platform/httpserver/server.go`'s `cors` middleware,
which reflects `Origin` in development and requires an explicit
`PHARMABOARD_ALLOWED_ORIGINS` allowlist in production.

```
cd web
npm install                # first time only
cp .env.example .env       # VITE_API_BASE_URL defaults to localhost:8080/v1
npm run dev                # http://localhost:5173
```

The backend must already be running (`make run` + `make worker`). The
login screen combines registration and dev-OTP login into one flow — see
"Auth in development" below; there's no separate sign-up screen because
the backend doesn't need one.

**There is no user directory/search endpoint** (the `community` module
isn't built), so starting a conversation in Messaging requires pasting the
other person's exact user ID. Each user's own ID is shown, copyable, at
the bottom of the sidebar — that's the only way two people can currently
find each other to message.

**The design language is editorial/institutional, and it is deliberate.**
The governing idea: a notice is a *published document from an authority*,
not a row in a SaaS table. Concretely:

- **Type carries the design.** Newsreader (editorial serif) for display and
  notice body, IBM Plex Sans for chrome, IBM Plex Mono for IDs, timestamps
  and audit data. Tracked-out caps ("kickers") label sections the way a
  newspaper does.
- **Severity is structural, not decorative.** A critical notice gets a
  3px rule, a larger and heavier headline, and an oxblood kicker; an
  informational one gets a hairline and regular weight. See
  `severityRule()` and `SeverityKicker` in `components/ui/Badge.tsx` —
  they are a pair and must stay in sync. Do **not** reduce severity to a
  colored pill: for a product whose whole thesis is that some messages
  must land with force, making a drug recall look like a UI chip is a
  failure of the core idea, not a style preference.
- **Ink on warm paper, hairline rules, no elevation.** Structure comes
  from rules and spacing. There are no drop shadows outside true overlays
  (`shadow-overlay`), and corners are square. If you find yourself adding
  `rounded-2xl` and `shadow-card`, you're drifting back to the generic
  admin template this replaced.
- **No icon library.** Navigation and labels are typographic. `lucide-react`
  was removed once nothing used it — don't reintroduce an icon set to
  decorate something that reads fine as words.

Known frontend gaps, tracked but not yet fixed:
- `npm audit` flags `react-router-dom` (open-redirect/SSR-hydration CVEs)
  and the `vite`/`esbuild` dev-server request-origin advisory. Both fixes
  require major-version bumps (React Router v7, Vite v8); neither
  advisory applies to this app's actual usage today (no SSR, no
  user-controlled redirect targets, dev server never exposed beyond
  localhost) — deferred rather than rushed, but don't let this go stale
  if the app's usage changes.
- Conversation list items show "Direct message" / the group title, not
  the other participant's name — resolving that needs the same missing
  directory.

**Visually verifying a UI change**: use the `run-web-console` project
skill (`.claude/skills/run-web-console/SKILL.md`) — it launches a real
headless Chromium via Playwright, drives the actual login form, and
screenshots every main screen. `tsc`/`vite build` passing proves the code
compiles; it proves nothing about whether Tailwind loaded or a layout is
broken. Use the skill instead of declaring a frontend change done on the
strength of a green build.

### Exercising the notice lifecycle end to end

The web console covers this interactively now, but curl is still the
fastest way to sanity-check a change to the publish path directly:

```
BASE=http://localhost:8080/v1

# Register + dev-mode login (no real SMS provider — see below)
curl -s -X POST $BASE/auth/register -d '{"account_kind":"pharmacist","display_name":"Ama Author","phone_e164":"+233200000001"}'
curl -s -X POST $BASE/auth/otp/request -d '{"channel":"phone","contact":"+233200000001"}'   # returns dev_only_code
curl -s -X POST $BASE/auth/otp/verify -d '{"channel":"phone","contact":"+233200000001","code":"<code>"}'  # returns access_token

# First publisher_admin (closes permanently once any exists)
curl -s -X POST $BASE/admin/bootstrap -H "Authorization: Bearer <token>" -d '{"token":"<PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN>"}'

# Draft -> submit -> approve (must be a different user than the author) -> publish
curl -s -X POST $BASE/notices -H "Authorization: Bearer <token>" -d '{"title":"...","body_markdown":"...","severity":"urgent","audience_rule":{"all_verified":true}}'
curl -s -X POST $BASE/notices/<id>/submit  -H "Authorization: Bearer <token>" -d '{"version":1}'
curl -s -X POST $BASE/notices/<id>/approve -H "Authorization: Bearer <approver_token>" -d '{"version":2}'
curl -s -X POST $BASE/notices/<id>/publish -H "Authorization: Bearer <token>" -d '{"version":3}'
curl -s $BASE/notices/<id>/report -H "Authorization: Bearer <token>"   # watch delivered/read/acknowledged counts move
```

### Auth in development

`identity.Service` runs in "dev mode" whenever `PHARMABOARD_ENV !=
"production"`: the OTP endpoint returns the generated code directly in the
JSON response (`dev_only_code`) instead of sending it through a real
SMS/email provider, because there is no contracted provider yet (see
technical design section 11 — phone-first OTP is explicitly a hypothesis,
not a commitment). Never let this code path run with `PHARMABOARD_ENV=production`.

## Testing

- `make smoke` (`scripts/smoke-test.sh`) — drives the running API over real
  HTTP through the full lifecycle: register/login three personas,
  bootstrap the first `publisher_admin`, verify a recipient, draft →
  submit → approve (rejecting self-approval) → publish, wait for the
  worker to dispatch, acknowledge, and confirm the notice reaches
  `/v1/sync`. Requires `make run` and `make worker` already up. This is
  the fastest way to answer "is the backend actually working" as a whole
  — the unit/integration suite below checks components in isolation, this
  checks that they're wired together correctly over the wire. Safe to
  re-run against a persistent dev DB (fixed phone numbers, register 409s
  ignored); `make db-reset` gives a clean slate if the one-time admin
  bootstrap has already been claimed by an account you don't have a token
  for.
- `make test` — unit tests, no database required. DB-backed tests detect
  a missing `PHARMABOARD_TEST_DATABASE_URL` and skip themselves; this is
  intentional so `go test ./...` never silently requires infrastructure.
- `make test-integration` — the same suite with
  `PHARMABOARD_TEST_DATABASE_URL` set from `.env`, so the DB-backed tests
  actually run. These hit a **real** PostgreSQL, per section 18 ("real
  PostgreSQL; constraints, locking, idempotency, retries" — a mock
  connection cannot exercise `FOR UPDATE SKIP LOCKED`, advisory locks, or
  CHECK constraints).
- The two tests worth reading before touching the publish path:
  `internal/modules/notices/postgres_test.go`
  (`TestPublish_AudienceSizeMatchesFrozenRecipientCount`,
  `TestPublish_CannotDoublePublish`) encode the two invariants section 18
  names as the highest-value ones in the whole system. If a change makes
  either test hard to keep passing, that's a signal to stop and reconsider
  the change, not to loosen the test.
- `internal/platform/changelog/changelog_test.go` reproduces the exact
  late-commit bug the safe-watermark barrier exists to prevent (a
  transaction that allocates a lower sequence number but commits after a
  higher one) and asserts the barrier blocks until it resolves. If you
  touch `changelog.go`, run this test with `-race`.
- Integration tests generate unique phone numbers and a random
  `practice_area` tag per run (see `uniquePhone`/`newTestAudience` in
  `postgres_test.go`) so they're safe to run repeatedly against a
  persistent, non-empty dev database without truncating it first.

## Conventions worth preserving

- **No ORM.** Hand-written SQL via `pgx` in each module's `postgres.go`.
  This was a deliberate ADR-0003 choice, not an oversight — locking
  (`FOR UPDATE SKIP LOCKED`), idempotent upserts (`ON CONFLICT DO NOTHING`),
  and set-based inserts (`INSERT ... SELECT ... unnest(...)`) are exactly
  the operations an ORM makes awkward and this system depends on them for
  correctness.
- **Optimistic concurrency, not locking, at the API layer.** Every mutable
  resource carries a `version`; transition endpoints take the caller's
  expected version and fail with 409 on mismatch. This is also what makes
  most mutation endpoints safe to retry without an idempotency key — a
  retried request either lands on the same version (harmless no-op state)
  or a stale one (rejected).
- **A module's `Service` always re-fetches after a write** before
  returning a response, rather than returning the in-memory struct it
  built. Two of these were bugs found and fixed while building this MVP
  (`identity.Service.Register`, `notices.Service.CreateDraft` both
  returned zero-value `created_at`/`version` until fixed to re-fetch) —
  don't reintroduce the pattern.
- **RFC 9457 problem details for every error response**
  (`internal/platform/problem`), never a bare `{"error": "..."}` shape.
- **Package-level `doc.go` states what a module owns.** Keep it accurate;
  it's the fastest orientation for both humans and agents.
- **Web console: feature folders, not layer folders.** `web/src/features/
  {auth,notices,messaging,admin}/` each own their `api.ts` (TanStack Query
  hooks) and pages together, mirroring the backend's module boundaries —
  a feature is easy to find in one place instead of split across
  `pages/`, `hooks/`, `services/` siblings. `web/src/components/` is only
  for things genuinely shared across features (the UI kit, `AppShell`).
  Types in `lib/types.ts` are hand-written to match the API's *actual*
  response shapes (verified live), not generated — the OpenAPI spec is a
  known gap (see above); if it's ever completed, generate from it instead
  and delete the hand-written types.

## Extending this file with skills

This file is what a fresh Claude Code session reads first — treat it as
living documentation, not a one-time deliverable. Update it whenever you:

- change what's implemented vs. deferred (keep "Current implementation
  state" honest — an agent that trusts a stale claim here will build on
  a module that doesn't exist),
- change the module dependency table (keep it and
  `scripts/check-boundaries.sh` in sync),
- fix a "known simplification" (delete the bullet), or
- establish a new convention worth an agent following without being told
  twice.

For repeatable workflows specific to this repo (e.g. "run the full notice
lifecycle against a fresh DB and print the delivery report," "diff the
OpenAPI spec against the handlers and list missing paths"), add a project
skill under `.claude/skills/<name>/SKILL.md` rather than growing this file
into a script library — this file should stay oriented toward "what an
agent needs to know," and skills toward "what an agent should run." Point
to them from here once they exist:

- [`run-web-console`](.claude/skills/run-web-console/SKILL.md) — launch the
  web console and the backend it needs, then visually verify it with a
  real headless browser (Playwright) instead of trusting a green build.
