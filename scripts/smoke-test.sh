#!/usr/bin/env sh
# Drives the notice lifecycle against a running API server end to end:
# register/login three personas, bootstrap the first publisher_admin,
# verify recipients, draft -> submit -> approve -> publish a notice, wait
# for the worker to dispatch it, then acknowledge and check the sync feed.
#
# This is a smoke test, not the test suite: it hits a live server over
# HTTP the way a real client would, so a green run means "the API server
# and worker are both up and wired together correctly," which
# `make test`/`make test-integration` (unit + DB-integration tests) do not
# by themselves confirm. Run both.
#
# Requires: curl, jq. Requires `make run` and `make worker` (or the
# no-Docker equivalents in docs/workspace.md) already running.
#
# Safe to re-run: personas use fixed phone numbers so repeated runs reuse
# the same accounts (register 409s are ignored) instead of accumulating
# duplicates; only a fresh notice is created each run. Bootstrap is a
# one-time operation server-side, so a second run's bootstrap attempt is
# expected to report the window is already closed if the first run
# succeeded and vice versa.
set -eu

BASE=${PHARMABOARD_BASE_URL:-http://localhost:8080/v1}
BOOTSTRAP_TOKEN=${PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN:-dev-bootstrap-secret}

# pass/step/fail print to stderr, never stdout: several of these run
# inside a $(...) capture (see register_and_login), and stdout is exactly
# what gets captured there. Printing status text to stdout would silently
# corrupt the captured value instead of failing loudly.
pass() { printf '  \033[32mok\033[0m  %s\n' "$1" >&2; }
step() { printf '\033[1m==> %s\033[0m\n' "$1" >&2; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }

req() {
  # req METHOD PATH [JSON_BODY] [BEARER_TOKEN]
  # Each branch is a single quoted curl invocation — do not refactor this
  # into building up an unquoted $args string and expanding it, even
  # though that looks tempting: word-splitting on any space inside a JSON
  # body (e.g. a display_name like "Kwame Asante") silently truncates
  # the request body and curl reports a baffling "unexpected EOF".
  method=$1; path=$2; body=${3:-}; token=${4:-}
  if [ -n "$token" ] && [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "$body"
  elif [ -n "$token" ]; then
    curl -s -X "$method" "$BASE$path" -H "Content-Type: application/json" -H "Authorization: Bearer $token"
  elif [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" -H "Content-Type: application/json" -d "$body"
  else
    curl -s -X "$method" "$BASE$path" -H "Content-Type: application/json"
  fi
}

register_and_login() {
  # register_and_login NAME PHONE -> prints "user_id token"
  name=$1; phone=$2
  req POST /auth/register "{\"account_kind\":\"pharmacist\",\"display_name\":\"$name\",\"phone_e164\":\"$phone\"}" >/dev/null 2>&1 || true

  otp_response=$(req POST /auth/otp/request "{\"channel\":\"phone\",\"contact\":\"$phone\"}")
  code=$(echo "$otp_response" | jq -r '.dev_only_code // empty')
  if [ -z "$code" ]; then
    fail "no dev_only_code in OTP response for $phone — is PHARMABOARD_ENV=production? (dev OTP codes only appear outside production)"
  fi

  session=$(req POST /auth/otp/verify "{\"channel\":\"phone\",\"contact\":\"$phone\",\"code\":\"$code\"}")
  token=$(echo "$session" | jq -r '.access_token // empty')
  [ -n "$token" ] || fail "login failed for $phone: $session"

  me=$(req GET /auth/me "" "$token")
  user_id=$(echo "$me" | jq -r '.id')
  echo "$user_id $token"
}

step "checking API and worker are reachable"
health=$(curl -s http://localhost:8080/healthz)
echo "$health" | jq -e '.status == "ok"' >/dev/null || fail "GET /healthz did not return ok: $health"
pass "API server is up ($health)"

step "registering and logging in three personas"
result=$(register_and_login "Kwame Asante" "+233209990001")
AUTHOR_ID=${result%% *}; AUTHOR_TOKEN=${result#* }
result=$(register_and_login "Abena Osei" "+233209990002")
APPROVER_ID=${result%% *}; APPROVER_TOKEN=${result#* }
result=$(register_and_login "Kofi Mensah" "+233209990003")
RECIPIENT_ID=${result%% *}; RECIPIENT_TOKEN=${result#* }
pass "author=$AUTHOR_ID approver=$APPROVER_ID recipient=$RECIPIENT_ID"

step "bootstrapping the first publisher_admin (idempotent across runs)"
boot=$(req POST /admin/bootstrap "{\"token\":\"$BOOTSTRAP_TOKEN\"}" "$AUTHOR_TOKEN")
echo "$boot" | jq -e '.status' >/dev/null || fail "bootstrap call failed unexpectedly: $boot"
pass "bootstrap response: $(echo "$boot" | jq -r '.status // .detail')"

step "verifying the recipient (requires the author to already hold publisher_admin)"
verify=$(req POST /admin/verifications "{\"user_id\":\"$RECIPIENT_ID\",\"registration_number\":\"PC-SMOKE\",\"evidence_source\":\"manual_review\",\"reason\":\"smoke test\"}" "$AUTHOR_TOKEN")
if ! echo "$verify" | jq -e '.status == "verified"' >/dev/null; then
  fail "verification failed: $verify
  This almost always means the bootstrap window was already closed by a
  DIFFERENT account before this script's fixed author phone number got a
  chance to claim publisher_admin (bootstrap is a one-time-ever operation
  per database, not per-account). Fix: 'make db-reset' for a clean slate,
  then re-run this script — the first run after a reset always succeeds."
fi
pass "recipient verified"

step "drafting a notice targeted at all verified users"
draft=$(req POST /notices "{\"title\":\"Smoke test notice $(date +%s)\",\"body_markdown\":\"Automated smoke test.\",\"severity\":\"urgent\",\"audience_rule\":{\"all_verified\":true}}" "$AUTHOR_TOKEN")
NOTICE_ID=$(echo "$draft" | jq -r '.id // empty')
[ -n "$NOTICE_ID" ] || fail "draft creation failed: $draft"
VERSION=$(echo "$draft" | jq -r '.version')
pass "draft $NOTICE_ID created at version $VERSION"

step "submit -> approve (distinct approver) -> publish"
req POST "/notices/$NOTICE_ID/submit" "{\"version\":$VERSION}" "$AUTHOR_TOKEN" | jq -e '.status == "ok"' >/dev/null \
  || fail "submit failed"
VERSION=$((VERSION + 1))

self_approve=$(req POST "/notices/$NOTICE_ID/approve" "{\"version\":$VERSION}" "$AUTHOR_TOKEN")
echo "$self_approve" | jq -e '.status == 403' >/dev/null \
  || fail "author was able to approve their own notice — the two-person rule is broken: $self_approve"
pass "self-approval correctly rejected (403)"

req POST "/notices/$NOTICE_ID/approve" "{\"version\":$VERSION}" "$APPROVER_TOKEN" | jq -e '.status == "ok"' >/dev/null \
  || fail "approve by distinct approver failed"
VERSION=$((VERSION + 1))
pass "approved by a distinct approver"

published=$(req POST "/notices/$NOTICE_ID/publish" "{\"version\":$VERSION}" "$AUTHOR_TOKEN")
audience_size=$(echo "$published" | jq -r '.audience_size // empty')
[ -n "$audience_size" ] && [ "$audience_size" -ge 1 ] || fail "publish failed or froze an empty audience: $published"
pass "published with a frozen audience of $audience_size"

step "waiting up to 10s for the worker to dispatch"
delivered=0
i=0
while [ "$i" -lt 20 ]; do
  report=$(req GET "/notices/$NOTICE_ID/report" "" "$AUTHOR_TOKEN")
  delivered=$(echo "$report" | jq -r '.Delivered // 0')
  [ "$delivered" -ge "$audience_size" ] && break
  i=$((i + 1))
  sleep 0.5
done
[ "$delivered" -ge "$audience_size" ] || fail "worker did not dispatch within 10s — is 'make worker' running? report: $report"
pass "worker dispatched to all $delivered recipient(s)"

step "recipient acknowledges the notice"
req POST "/notices/$NOTICE_ID/ack" "" "$RECIPIENT_TOKEN" | jq -e '.status == "acknowledged"' >/dev/null \
  || fail "acknowledge failed"
pass "acknowledged"

step "waiting up to 5s for the sync watermark to catch up (it publishes every 2s by design — see docs/technical-design.md section 10)"
found=false
i=0
while [ "$i" -lt 10 ]; do
  sync=$(req GET "/sync?after=0&limit=200" "" "$AUTHOR_TOKEN")
  if echo "$sync" | jq -e --arg id "$NOTICE_ID" '.entries | any(.EntityID == $id)' >/dev/null; then
    found=true
    break
  fi
  i=$((i + 1))
  sleep 0.5
done
[ "$found" = true ] || fail "notice $NOTICE_ID not found in the sync feed after 5s: $sync"
pass "notice appears in /v1/sync"

echo
printf '\033[1;32mAll checks passed.\033[0m Notice %s: draft -> submit -> approve -> publish -> dispatch -> acknowledge -> sync, end to end.\n' "$NOTICE_ID"
