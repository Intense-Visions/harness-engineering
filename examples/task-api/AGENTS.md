# Task API: AI Agent Knowledge Map

A task management API demonstrating harness engineering at the **intermediate** adoption level.

## Project Overview

RESTful API for managing tasks (create, list, get, complete). Built to demonstrate layered architecture with mechanical constraint enforcement.

## Architecture

Three layers with strict one-way dependencies:

```
types/     →  (no imports from other layers)
services/  →  can import from types
api/       →  can import from types, services
```

Violations are caught by `@harness-engineering/eslint-plugin`.

## Repository Structure

```
task-api/
├── src/
│   ├── types/task.ts          # Task, CreateTaskInput, TaskStatus
│   ├── services/task-service.ts  # Business logic (in-memory store)
│   └── api/routes.ts          # Express routes
├── tests/
│   ├── services/task-service.test.ts
│   └── api/routes.test.ts
├── docs/principles.md
├── harness.config.json
├── eslint.config.mjs
└── AGENTS.md
```

## Conventions

- TypeScript strict mode
- TDD: tests before implementation
- In-memory storage (no database dependency)
- One module per file

## Key Commands

```bash
npm test          # Run tests
npm run lint      # Check architectural constraints
npm run typecheck # Check types
harness validate  # Full project validation
harness check-deps # Check dependency boundaries
```

## Active Persona

**Architecture Enforcer** — Runs on PRs and commits to validate layer boundaries, detect circular dependencies, and block forbidden imports.
