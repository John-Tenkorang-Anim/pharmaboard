# ADR-0002: Begin with a modular monolith

- Status: accepted
- Date: 2026-08-25

## Context

The planning load fits comfortably on one PostgreSQL primary and a small number of stateless processes. The initial engineering team does not need independent service ownership.

## Decision

Build one Go codebase and artifact with API, worker, and migration modes. Enforce domain ownership inside the code and database. Do not introduce network boundaries between modules.

## Consequences

Local development, transactions, deployments, and incident response remain simple. Internal interfaces must be maintained so a later extraction is possible.

## Revisit

Revisit when one module consumes more than 60% of resources or teams require independent release cadence.
