# PharmaBoard workspace

The workspace connects official notices, a professional community, learning, careers, and team collaboration. The visual system uses pure white surfaces, slate text, and a restrained blue accent. Colored side rules, decorative dashboard cards, and pill buttons have been removed. `CLAUDE.md` and its historical design constraints have been removed.

## Available workflows

- **Overview:** professional feed, follow-based feed, official notice summaries, and entry points into learning, collaboration, and careers.
- **Learning:** members publish attributed YouTube lessons, browse/search by topic, watch embedded videos, save a personal library, and mark lessons complete. Completion is self-reported, not CPD accreditation. Educators can describe chapter timestamps in the overview.
- **Careers:** members publish opportunities with employer, location, category, description, and HTTPS application URL. Members search, filter, save, and apply on the employer website.
- **Collaboration:** schedule a session with an automatically assigned video room, browse sessions, join within PharmaBoard, export a one-hour calendar event in local time, and share an invitation with a 12-character meeting code. Other authenticated members can look up the code and review the session before joining. Sessions are visible to authenticated members.
- **Conversations:** select colleagues by name, create direct or small-group conversations, search messages, retrieve shared HTTPS links, and start/join an embedded video meeting. Messages persist in PostgreSQL and use the existing safe-watermark polling mechanism. Failed sends retain their draft.
- **Network and Rx Forum:** profiles, follows, professional questions, replies, and accepted answers.
- **Official notices:** the existing approval, publication, acknowledgement, and audit workflows remain separate from member content.

## Video architecture and limits

Teams-style collaboration means in-app communication rather than a Microsoft Teams link integration. Audio/video, device selection, screen sharing, participant controls, hand raising, and meeting chat are provided through an embedded Jitsi room. The host must authenticate with Jitsi on its public service. Camera/microphone use begins only after the member enters the meeting and accepts browser permissions.

The public Jitsi service does not inherit PharmaBoard's membership authorization. Anyone obtaining a room link can attempt to join; moderators should use its lobby. Persistent PharmaBoard group chat is distinct from provider meeting chat. Recordings, transcripts, enterprise single sign-on, file uploads, full Teams channel hierarchy, and controlled media hosting are not implemented. A managed/authenticated media deployment is needed for production access guarantees. Live camera/screen-sharing behavior requires a multi-participant browser/device test; a build or iframe smoke test alone does not prove media reliability.

References checked September 2026: [Jitsi iframe integration](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/), [Jitsi host authentication](https://jitsi.org/security/), [YouTube player configuration](https://developers.google.com/youtube/player_parameters), [YouTube privacy-enhanced embedding](https://support.google.com/youtube/answer/171780).

## Local setup

Use Go, Node.js, and PostgreSQL as described in the root README. Set `PHARMABOARD_DATABASE_URL` to a development database. Existing installations should apply only the new migration:

```sh
set -a
. ./.env
set +a
psql "$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/000005_workspace.up.sql
psql "$PHARMABOARD_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/000006_meeting_codes.up.sql
go run ./cmd/pharmaboard serve
```

In separate terminals, with the same environment loaded, start `go run ./cmd/pharmaboard worker` and `cd web && npm run dev`. The worker publishes safe watermarks needed for new messages to become visible. Fresh databases need all migrations in order. The Makefile migration command does not track already-applied files; do not rerun all migrations on an existing database.

## Workspace API

Authenticated endpoints under `/v1/workspace`:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `?kind=learning|jobs|sessions&q=&category=&saved=false&page=0` | 50 resources per page; returns `items` and `has_more`. Search includes title, organization, location, category. |
| GET | `/join/{code}` | Look up an authenticated, member-visible scheduled session by its case-insensitive meeting code. Does not grant membership to any private conversation. |
| PUT | `/{uuid}` | Create or update an authored resource. A client-assigned stable UUID makes retries safe. Only the owner may update, and the kind cannot change. |
| DELETE | `/{uuid}` | Delete an owned resource and its saved references. |
| PUT | `/{uuid}/saved` | Set `{saved, completed}` for the current member. |

Resources contain `id`, `owner_id`, `kind`, `title`, `description`, `category`, `organization`, `location`, `url`, optional `starts_at`, and `created_at`. GET also includes viewer-specific `saved` and `completed` state. Text limits, bounded request bodies, parameterized SQL, authentication, ownership checks, HTTPS URLs, and supported video-provider validation are enforced server-side. No arbitrary HTML is rendered.

The workspace owns `workspace_resources` and `workspace_saved`. Its sole module dependency is identity. The messaging API additionally returns public names of active conversation members through identity's profile interface, without directly querying identity tables.

## Public launch work

This is a functional development implementation, not a production certification. Existing identity verification and privacy/institutional prerequisites still apply. Before a public launch, complete messaging/member-resource reporting and moderation, production media authorization, delivery providers, security review, operational monitoring, backup/restore exercises, and load/accessibility testing. The owner requested placeholder content for design review. `web/scripts/seed-preview.mjs` populates a local development API with clearly labeled sample colleagues, lessons, opportunities, sessions, and discussions. Sample lessons and vacancies do not launch a real recording or application. No fictitious view counts, ratings, attendance, or institutional verification are displayed. Sample content must be removed before production.

## Preview and verification

With the updated API on port 8081 and Vite on port 5174, run `node web/scripts/seed-preview.mjs`, then choose **Explore sample workspace** on the development sign-in page. This shortcut uses the development OTP flow and is excluded from production frontend builds.

Verification commands:

```sh
make check
make test-integration
cd web
npm run build
node scripts/workspace-check.mjs
node scripts/preview-check.mjs
```

The workspace acceptance check creates temporary local QA users and tests ownership, unauthorized access, idempotent publication, saved-state isolation, lesson completion, automatic session rooms, named team participants, chat/shared links, and mobile navigation. Temporary resources are removed after the check; QA identities/conversations remain as development test data. The media provider is mocked for the browser acceptance check, which checks embed wiring rather than camera transport. The separate preview check verifies six screens, white rendered background, keyboard dialog dismissal, and mobile width.

The main OpenAPI file predates most application endpoints. The workspace endpoint contract is documented above; generated-client parity across all modules remains outstanding.

Meeting codes are stable identifiers for member-visible scheduled sessions, not passwords or private-chat invitations. The database enforces their uniqueness. Video frames adapt to the available width and provide a browser fullscreen control; learning playback uses a wider 16:9 viewer.

## Community and noticeboard redesign

Overview now links to a standalone `/community` feed and shareable `/community/posts/:id` discussions. Migration 000007 stores comments with one level of replies, author-only soft deletion and idempotent comment IDs. Migration 000008 indexes community full-text search. Expanded replies refresh every 15 seconds. The database integration test covers thread integrity, deletion authorization and hidden-post access.

The noticeboard has priority/search/date controls and separate sample communications. Samples are static illustrations, never published or delivered. The current notice API is cursor-based; the board follows all cursors before client-side filtering. A future large deployment should move notice filters and sorting server-side. The design takes cues from the clear issue dates and filterable records on [MHRA alerts](https://www.gov.uk/drug-device-alerts) and audience-specific [NHS bulletins](https://www.england.nhs.uk/email-bulletins/).

RxForum uses discussion cards with answered/unanswered views (applied to the latest 30 search results), preserved drafts and accepted-answer presentation. `web/scripts/seed-community-preview.mjs` adds labeled sample discussions and replies using development accounts. `web/scripts/community-board-check.mjs` checks notice filtering, sample reading, forum draft retention and responsive layouts.

## Focus mode and professional portfolios

The desktop header includes a sidebar collapse/expand control. Its preference is stored locally across routes and refreshes; mobile navigation remains available independently.

Migration 000009 adds profile portfolio entries and learning visibility. Authenticated members can read portfolios through `GET /v1/workspace/profiles/{userID}`. Owners add/update entries with `PUT /v1/workspace/portfolio/{id}` and remove them with `DELETE`; other members cannot mutate their entries. Sections include About, Experience, Education, Achievements, Projects and Publications. Optional supporting links require HTTPS. Learning is sourced from saved workspace lessons, including self-reported completion, and is private until the owner enables sharing via `PUT /v1/workspace/profile/learning-visibility`.

`web/scripts/profile-check.mjs` exercises ownership, link validation, learning visibility, profile CRUD persistence, desktop focus persistence and mobile navigation. `web/scripts/seed-profile-preview.mjs` adds only explicitly illustrative entries to existing preview accounts; those examples are not verified credentials or real publications.
