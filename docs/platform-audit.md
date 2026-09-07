# Platform audit — 7 September 2026

The pharmacy development preview is usable at http://127.0.0.1:5174. PostgreSQL 16.15 is connected locally; no cloud account or API token is required for the sample workspace.

## Changes from this audit

- Restored a recognizable comment icon beside the reply count while keeping threads collapsed.
- Reduced collaboration messaging to a secondary text link; scheduling and joining remain primary.
- Removed redundant header, footer, preview-banner and resource divider lines while preserving card boundaries and selected-tab indicators.
- Distinguished Community (globe), Messages (speech bubbles), and RxForum (single bubble) in navigation.
- Fixed profile Message actions to create/open a conversation with that member, rather than open the generic inbox.
- Updated Vite to 8.2.2, its React plugin to 6.1.1, and React Router DOM to 7.18.3. npm reported zero known vulnerabilities after installation. Node 20.19+ or 22.12+ is required by the build tools; this local environment uses Node 24.
- Made readiness check PostgreSQL with a two-second deadline. An unavailable database returns 503 without disclosing connection details.
- Centralized discipline branding, signup defaults, forum labels and learning categories. Pharmacy keeps its supplied PSGH logo. Other disciplines do not inherit it.

## Design references

The layout changes follow [Fluent 2 layout guidance](https://fluent2.microsoft.design/layout) on hierarchy and progressive disclosure, with distinct destinations following [Fluent navigation guidance](https://fluent2.microsoft.design/components/web/react/core/nav/usage). The interface uses a consistent white/slate/blue palette, restrained cards, visible labels, responsive layouts and keyboard-accessible dialogs. “Futuristic” is subjective; this audit favors recognizable controls and a clear task hierarchy.

PostgreSQL remains appropriate for the existing relational model: [foreign keys and other constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) enforce the relationships between accounts, content, replies and saved resources. No database migration to another vendor is necessary for local testing.

## Verification

Passed: production build, formatting, Go vet/race tests, module boundaries, real-PostgreSQL integration tests, and browser acceptance scripts for workspace, preview, noticeboard/community, network, profiles, onboarding and design changes. Tests cover ownership, saved-state persistence, meeting-code joining, profile editing, follow/unfollow, replies, responsive widths and JavaScript errors. The additional design test also checks engineering branding and profile-specific messaging.

Media is mocked in automated meeting tests. Real camera, microphone and screen sharing still require a two-device test and provider login where requested. This audit does not certify production security or unlimited scale.

## Reusing the platform

Run `node scripts/configure-platform.mjs --field "Computer Engineering" --api https://your-api.example/v1 --output /path/to/config` to generate a separate deployment’s frontend settings and instructions. An engineering configuration was generated and its signup defaults tested without connecting it to pharmacy data.

This is configuration automation, not cloud provisioning or multi-tenant school isolation. Each independent institution currently needs its own API/database deployment. Hosting, domain, production messaging delivery, and managed video would need provider accounts before public launch. The current worker uses a development delivery provider, and OTP codes are shown locally for testing.

Remaining scaling work includes server-side noticeboard filtering (currently all cursor pages are fetched for client filtering), deeper directory/forum pagination, institutional administration/SSO, production media access control, and load/backup-restore testing. These are not represented as completed by the local test results.
