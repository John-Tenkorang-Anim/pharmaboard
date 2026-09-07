# Deploying the backend to Render

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec)
that provisions three things: a managed PostgreSQL database, the API
(`cmd/pharmaboard serve`), and the background worker
(`cmd/pharmaboard worker` — notice dispatch, the safe-watermark publisher,
the idempotency-key janitor). All facts below about Render's platform
(plan availability, free-tier limits, preinstalled tooling) were checked
against Render's own docs in September 2026, not assumed — re-check them
if it's been a while, since Render's plan names and free-tier terms have
changed before.

## Before you start

- **The worker has no free tier.** Render's Background Worker service type
  is not eligible for a free instance at all (only Web Services,
  PostgreSQL, Key Value, and Static Sites are). This isn't optional
  infrastructure for PharmaBoard — without the worker running, a published
  notice never actually dispatches and `/v1/sync`'s safe watermark never
  advances — so `render.yaml` pins it to the cheapest paid compute plan
  (`0.5c-512mb`) rather than leaving it on `free`.
- **Free Postgres expires.** Render's free database plan expires 30 days
  after creation (14-day grace period after that), caps out at 1GB, and
  has no backups. Fine to prove the deploy works; upgrade the `plan:` in
  `render.yaml` before anything real depends on this data.
- **Free web services spin down.** After 15 minutes with no traffic, the
  API cold-starts on the next request. Also capped at 750 instance-hours/
  month. Acceptable for a demo, not for something people rely on being
  responsive.
- **Production requires real Twilio credentials.** `config.Load()`
  (`internal/platform/config/config.go`) refuses to start with
  `PHARMABOARD_ENV=production` unless `PHARMABOARD_OTP_PROVIDER=twilio` and
  all three `TWILIO_*` values are set and pass a format check — there is no
  dev-mode fallback in production. You need a real Twilio account with a
  [Verify Service](https://www.twilio.com/docs/verify) configured before
  the API will boot. **The worker needs these too**, even though it never
  calls Twilio — `config.Load()` runs identically for both subcommands, so
  a worker missing them will crash-loop on startup in production.

## 1. Push `render.yaml` and create the Blueprint

Commit `render.yaml` (already at the repo root) and push. In the Render
dashboard: **New → Blueprint**, point it at this repo/branch. Render reads
`render.yaml` and shows you the three resources it's about to create,
prompting for every `sync: false` value:

- `PHARMABOARD_ALLOWED_ORIGINS` on the API — the deployed web console's
  origin(s), comma-separated (e.g.
  `https://pharmaboard.vercel.app`). There is no dev-mode
  Origin-reflection fallback in production; a missing or wrong value here
  means the browser console gets CORS errors, not a helpful backend log.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
  on **both** services — from your Twilio console.

`PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN` is generated automatically
(`generateValue: true`); find the value Render picked under the API
service's **Environment** tab after the first deploy — you'll need it once,
in step 3.

## 2. Apply migrations — manually, on purpose

`cmd/pharmaboard migrate` is intentionally unimplemented (see the comment
in `main.go`): there's no migrations-tracking table, so `db/migrations/
*.up.sql` are plain SQL files applied in order by a human, once each. This
means **`render.yaml` does not run migrations automatically** — a
`preDeployCommand` that blindly replayed every file would fail from the
second deploy onward, since none of the DDL (`CREATE TABLE`, `CREATE
INDEX`, …) is guarded with `IF NOT EXISTS`. Render's native Go runtime
does ship `psql` (it's Debian 12 with `postgresql-client` preinstalled),
so this isn't a tooling gap — it's the same deliberate choice the project
already makes locally, just applied here too.

Instead, run migrations from your own machine against the database's
**External Database URL** (Render Postgres dashboard → **Connect** — use
the external one here, not the internal one `render.yaml`'s services use
for low-latency same-region traffic):

```sh
PHARMABOARD_DATABASE_URL="<External Database URL from the Render dashboard>" make migrate
```

If the URL Render shows you doesn't already carry an `sslmode` parameter,
append `?sslmode=require`.

Do this once before the API's first real request, and again — before
deploying the code that depends on it — every time a new file lands in
`db/migrations/`.

## 3. Bootstrap the first administrator

With migrations applied and both services deployed:

```sh
BASE=https://<your-api>.onrender.com/v1
curl -s -X POST $BASE/admin/bootstrap \
  -d "{\"token\":\"<PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN from step 1>\"}"
```

This only works once — the window closes permanently as soon as any
`publisher_admin` exists (see `internal/modules/admin`).

## 4. Point the frontend at it

The web console reads `VITE_API_BASE_URL` at **build** time (Vite bakes it
in, it isn't read at runtime), so set it as a build-time environment
variable in Vercel's project settings (`web/vercel.json` already defines
the build itself) — `https://<your-api>.onrender.com/v1`, then redeploy
the frontend. If it was already deployed with the localhost default, a
plain "restart" won't pick this up; it needs a real rebuild.

## 5. Verify

```sh
curl https://<your-api>.onrender.com/healthz   # {"status":"ok"} — process is up
curl https://<your-api>.onrender.com/readyz    # {"status":"ready"} — DB reachable too
```

`healthCheckPath` in `render.yaml` is already set to `/readyz`, so Render
itself won't mark a deploy healthy until the database is reachable, not
just the process running.

## Later: adding a new migration

Add the new `NNN_name.up.sql`/`.down.sql` pair as usual, then repeat step
2's `make migrate` command against the external URL — before merging code
that depends on the new schema, the same ordering the project already
expects locally.
