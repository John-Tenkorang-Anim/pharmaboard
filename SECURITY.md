# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Until a private security contact is established, report it directly to the repository owner through GitHub's private vulnerability reporting feature.

Include the affected component, reproduction steps, impact, and any suggested mitigation. Do not include real personal data.

## Supported versions

Only the current `main` branch is supported before the first release.

## Security boundaries

- PharmaBoard must never store patient or prescription data.
- Secrets must not be committed. Use local environment files and the deployment secret manager.
- Institutional publishing requires strong authentication; urgent and critical publication requires two-person approval.
- Logs, traces, analytics, and error reports must redact personal data by default.
