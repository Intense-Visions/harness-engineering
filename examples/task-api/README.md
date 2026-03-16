# Task API — Harness Engineering (Intermediate)

A task management API demonstrating harness engineering at the **intermediate** adoption level. This is where constraints start getting enforced.

## What is this?

A simple REST API for managing tasks, built with Express and TypeScript. The interesting part isn't the API itself — it's the layered architecture with mechanical enforcement. Try breaking a constraint and watch harness catch it.

## Quick Start

```bash
cd examples/task-api
npm install
npm test          # Run tests (should pass)
npm run lint      # Check architectural constraints (should pass)
harness validate  # Validate project configuration
```

## Architecture

Three layers, strict one-way dependencies:

```
┌─────────┐
│   api/   │  ← Express routes (top layer)
├─────────┤
│services/ │  ← Business logic (middle layer)
├─────────┤
│  types/  │  ← Interfaces and types (bottom layer)
└─────────┘

Allowed: api → services → types
Blocked: types → services, types → api, services → api
```

This is enforced by `@harness-engineering/eslint-plugin` via the `no-layer-violation` rule. It reads the layer definitions from `harness.config.json` and blocks imports that go the wrong direction.

## Try Breaking a Constraint

See [VIOLATIONS.md](./VIOLATIONS.md) for step-by-step exercises. Each one shows you how to trigger a specific constraint violation and what the error looks like.

## Skills in Context

When building features on this project, harness skills guide the workflow:

- **harness-tdd** — Write the test first, watch it fail, implement, watch it pass
- **harness-execution** — Execute tasks from a plan, one atomic commit per task
- **harness-verification** — Verify the work exists, is substantive, and is wired in

## Personas

The **Architecture Enforcer** persona is configured for this project. It runs:

- `harness check-deps` to verify dependency boundaries
- `harness validate` to check overall project health
- ESLint with harness rules to catch constraint violations

See `agents/personas/architecture-enforcer.yaml` in the main harness repo for the persona definition.

## State Management

Check `.harness.example/` to see what mid-project state looks like:

- `state.json` — Position (Task 5), progress (3 complete, 2 pending), decisions with rationale
- `learnings.md` — Tagged entries from different skills (tdd, execution, verification)
- `failures.md` — A dead-end that was tried and abandoned (supertest approach)

In a real project, this would be `.harness/` (not `.harness.example/`).

## Next

Ready for custom linter rules, boundary schemas, and the full persona suite? Try the [multi-tenant-api example](../multi-tenant-api/).
