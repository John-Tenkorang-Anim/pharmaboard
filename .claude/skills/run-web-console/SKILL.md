---
name: run-web-console
description: Launch the PharmaBoard web console (Vite + React), drive it with a real headless browser, and screenshot key screens. Use when asked to run, start, or screenshot the web console, or to visually confirm a frontend change actually renders (not just that it type-checks or builds).
---

The web console is a Vite + React + TypeScript SPA under `web/`. It talks
to the Go API over plain HTTP with CORS (see
`internal/platform/httpserver/server.go`'s `cors` middleware) — there is no
server-side rendering and no build step needed to see a change in dev.

## Prerequisites

This machine has no system-wide Go, Postgres, or Node — all three were
installed user-local (no sudo, no Homebrew) into
`~/.local/pharmaboard-toolchain/`. Source the toolchain env before any of
the commands below:

```bash
source "$HOME/.local/pharmaboard-toolchain/env.sh"
```

If that directory doesn't exist on the machine you're running on, this
project has real system Go/Node/Postgres instead — just make sure `go`,
`node`, and `psql` are on `PATH` and skip the `source` line.

## 1. Start the backend

The web console needs a live API (and, for the notices dispatch flow, the
worker). See CLAUDE.md's "Running it locally" for the full sequence; the
short version, from the repo root:

```bash
# Postgres must already be running and migrated — see CLAUDE.md.
export PHARMABOARD_ENV=development
export PHARMABOARD_DATABASE_URL="postgres://pharmaboard:pharmaboard@localhost:5544/pharmaboard?sslmode=disable"
export PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN=dev-bootstrap-secret
go run ./cmd/pharmaboard serve &
go run ./cmd/pharmaboard worker &
until curl -sf http://localhost:8080/healthz >/dev/null; do sleep 1; done
```

**`go run` does not hot-reload.** If you change any Go file, kill and
restart both processes (`pkill -f "cmd/pharmaboard serve"` /
`... worker`) before re-testing — otherwise you're testing stale code and
will chase a bug that was already fixed. This bit the CORS middleware
during initial development: the code was correct but the running process
predated it.

## 2. Start the web console dev server

```bash
cd web
npm install        # first time only
cp -n .env.example .env
npm run dev &
until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done
```

## 3. Drive it and screenshot

`web/scripts/visual-check.mjs` (Playwright, `chromium.launch()` — a plain
headless browser, not `_electron`, since this is a web app not a desktop
one) drives the real login form end to end and screenshots every main
screen:

```bash
cd web
npx playwright install chromium   # first time only, ~95MB
npm run visual-check
```

Screenshots land in `/tmp/pharmaboard-shots/` (override with
`SCREENSHOT_DIR`). It produces, in order: `01-login.png`,
`02-otp-step.png`, `03-notices-list.png`, `04-messaging.png`,
`05-compose.png`, `06-admin.png`. It also prints any browser console
errors it captured — a page can render its shell while a data fetch
fails, so check that output, not just the screenshots.

**Actually open the screenshots and look at them.** A blank frame, an
unstyled page (Tailwind not loading — check the `<link>` tags and that
`postcss.config.js` exists), or a layout that's visually broken are all
failures a passing `tsc`/`vite build` cannot catch.

## Gotchas

- **The dev-mode OTP auto-fill is expected, not a bug.** `#code` is
  pre-filled with the real code because `PHARMABOARD_ENV=development`
  makes the backend return it directly (no SMS provider — see CLAUDE.md's
  "Auth in development"). Never expect this in a `production`-configured
  backend.
- **A 403 on `/admin/audit-events` for a fresh test account is expected**,
  not a bug — a newly registered user holds no role. The script waits for
  network-idle before the admin screenshot so it captures the resolved
  error state instead of a stuck loading skeleton.
- **React controlled inputs**: the script uses Playwright's `fill()`,
  which fires real input events. Don't switch to `page.evaluate(el =>
  el.value = ...)` — that bypasses React's onChange and the form won't
  see the value.
- **Registering with the same phone number twice** returns 409, which the
  app's own `LoginPage` already treats as "this account exists, log them
  in" — not an error to work around in the script. The script still uses
  a timestamp-derived phone number per run for a clean signal (proves the
  full register path, not just login).

## Human path (no screenshots, just look at it yourself)

```bash
cd web && npm run dev
```

Open `http://localhost:5173` in a real browser.
