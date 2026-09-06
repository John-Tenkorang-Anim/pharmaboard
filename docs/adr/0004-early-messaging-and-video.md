# ADR-0004: Add direct/group messaging and third-party video ahead of the original gate

- Status: accepted
- Date: 2026-09-05

## Context

`docs/technical-design.md` (the approved baseline) explicitly lists "group
chat, voice, video, live presence, or typing indicators" and "end-to-end
encrypted messaging" as v1 non-goals, and section 20 gates messaging as
"deferred" until "active users demonstrate need that external handoff
cannot meet." That sequencing was deliberate: notice delivery is the
product's trust-critical differentiator, and shipping chat without a
reviewed encryption protocol risks an implied security claim the team
hasn't earned.

The product owner has now asked for messaging, including small-group
threads and video calling, ahead of that gate. This ADR records the
decision and the guardrails attached to it, rather than silently editing
the baseline document's non-goals list — the original reasoning is still
correct engineering practice for a system that *does* claim E2E encryption
or *does* build custom video infrastructure; this ADR documents that
PharmaBoard is deliberately choosing not to claim or build either.

## Decision

1. **Messaging module** (`internal/modules/messaging`): 1:1 and small-group
   (creator + up to 19 others, 20 total) text conversations between
   registered users. No moderation, blocking, or anti-abuse controls yet —
   see "Consequences."
2. **No end-to-end encryption claim.** Transport is TLS, same as every
   other endpoint; message content is readable by PharmaBoard's own
   infrastructure (database, backups, operators with DB access), exactly
   like a notice or a forum post. Every conversation-creation response
   includes an explicit `encryption_notice` field so no client can present
   this as more private than it is. This satisfies technical design
   section 12's requirement to never imply a reviewed security property
   that doesn't exist.
3. **Video calling via an embedded third-party provider (Jitsi Meet's
   public server, `meet.jit.si`), not custom WebRTC infrastructure.**
   PharmaBoard generates an unguessable per-call room slug and hands back a
   URL; the call itself — signaling, media relay, TURN/STUN — runs entirely
   on Jitsi's infrastructure, which PharmaBoard does not operate or audit.
   Every call-start response includes a `provider_notice` field disclosing
   this. Building a self-hosted media relay is unchanged as future work,
   gated the same way any other infrastructure addition in this codebase
   is (ADR-0002's philosophy): only after a measured need a third-party
   provider can't meet.
4. **Reuses existing infrastructure rather than inventing new mechanisms.**
   Message pagination rides the same safe-watermark barrier
   (`internal/platform/changelog`) that notices already uses and that has
   an integration test proving it handles the late-commit race correctly,
   filtered by the existing `change_log.audience_key` column (scoped to a
   conversation). This was built for exactly this kind of fan-in ordering
   problem; a second, bespoke cursor scheme for messages would duplicate a
   solved problem and a proven test.

## Consequences

- A client MUST surface `encryption_notice` and `provider_notice` to users
  somewhere reachable (not necessarily on every screen) — burying them
  defeats the point of disclosing at all.
- No blocking, reporting, or moderation exists for messaging yet. A small
  professional pilot can operate on social norms; this must be built
  before any wider rollout. Track under `admin` when it lands, following
  the same append-only-audit pattern as notice moderation.
- The public `meet.jit.si` server has no PharmaBoard-side access control
  beyond the unguessable room slug: anyone who obtains the link can join.
  This is an acceptable v1 tradeoff for a professional pilot, not for
  public launch.
- Group size is capped at 20 to keep this "small group threads," not a
  broadcast mechanism competing with the notices module's actual job.

## Revisit

- Before public launch: messaging needs blocking/reporting and a
  moderation path.
- Before increasing the group cap or adding channels/broadcast-style
  groups: that's the notices module's job, not messaging's — don't let
  messaging grow into a second, unaudited notice-delivery path.
- Before claiming E2E encryption: a reviewed protocol/library, a device
  key model, and a recovery UX must be funded and designed, per the
  threshold already fixed in technical design section 20. Do not flip the
  `encryption_notice` claim without doing this work first.
- Before self-hosting video: only after `meet.jit.si`'s reliability, cost
  exposure (none currently, but rate limits could bite at scale), or data-
  handling terms prove insufficient for a measured, real usage pattern.
