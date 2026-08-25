# Contributing to PharmaBoard

## Before coding

1. Open or reference an issue for non-trivial work.
2. Record architecture-impacting decisions as an ADR in `docs/adr/`.
3. Keep patient data out of fixtures, logs, screenshots, and tests.

## Workflow

- Branch from `main` using `feat/`, `fix/`, `docs/`, or `chore/` prefixes.
- Use Conventional Commits, for example `feat(notices): add approval workflow`.
- Keep migrations append-only after merge. Never edit a migration that may have run outside your machine.
- Add tests for behavior and failure paths, not implementation details.
- Run `make check` before pushing.

## Pull requests

A pull request must explain the user or operational outcome, risks, test evidence, data-model changes, rollback plan, and observability changes. Changes to authentication, authorization, notice delivery, verification, audit records, or retention require a second reviewer.

## Definition of done

- Acceptance criteria pass.
- Failure and retry behavior are tested.
- Logs contain no personal data.
- Metrics or traces exist for new critical paths.
- Documentation and OpenAPI are updated.
- Deployment remains backward compatible under the expand/contract migration rule.
