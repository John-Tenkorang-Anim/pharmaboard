# ADR-0003: Use Go for services and TypeScript for clients

- Status: accepted
- Date: 2026-08-25

## Context

PharmaBoard needs bounded concurrent delivery work, predictable API performance, small operational surface area, an offline mobile client, and a productive publisher console.

## Decision

Use Go for the API and worker. Prefer the standard library plus `pgx`, `sqlc`, and a minimal router. Use TypeScript for the web and React Native clients, with types generated from OpenAPI. Use SQL explicitly for persistence and concurrency-sensitive work.

## Consequences

The repository contains two production languages with clear ownership: Go for server behavior and TypeScript for user interfaces. Shared behavior crosses the OpenAPI contract rather than a mixed-language utility layer.

Rust and C++ would add implementation and hiring cost without a forecast performance benefit. Python remains a tooling language, not a production server dependency.

## Revisit

Do not revisit for taste. A change requires a measured inability to meet a product or operational requirement and a migration plan.
