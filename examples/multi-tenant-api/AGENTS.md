# Multi-Tenant API: AI Agent Knowledge Map

A multi-tenant user management API demonstrating harness engineering at the **advanced** adoption level.

## Project Overview

RESTful API where all data is scoped to tenants via `X-Tenant-ID` header. Demonstrates custom linter rules, boundary validation, cross-artifact checking, all three personas, and full state management.

## Architecture

Four layers with strict one-way dependencies:

```
types/       →  (no imports)
middleware/  →  can import from types
services/    →  can import from types, middleware
api/         →  can import from types, middleware, services
```

### Tenant Isolation

- Middleware extracts `X-Tenant-ID` from request headers
- All service functions take `tenantId` as first parameter
- Data store is partitioned by tenant
- Cross-tenant access returns 404

See `docs/specs/tenant-isolation.md` for the full specification.

## Repository Structure

```
multi-tenant-api/
├── src/
│   ├── types/            # Tenant, User interfaces
│   ├── middleware/        # Tenant context extraction
│   ├── services/          # Business logic with Zod validation
│   └── api/              # Express routes
├── tests/
│   ├── middleware/        # Auth/tenant tests
│   ├── services/          # Unit tests
│   └── integration/      # Tenant isolation tests
├── docs/
│   ├── principles.md
│   ├── specs/            # Source-of-truth specifications
│   └── changes/          # In-progress proposals
├── harness.config.json
├── harness-linter.yml     # Custom linter rules
├── eslint.config.mjs
└── AGENTS.md
```

## Conventions

- TypeScript strict mode
- Zod validation at service boundaries
- JSDoc on all exported functions
- TDD: tests before implementation
- Tenant ID passed explicitly, never stored in globals

## Key Commands

```bash
npm test                       # Run tests
npm run lint                   # Check all constraints
npm run typecheck              # Check types
harness validate               # Full validation
harness validate --cross-check # Cross-artifact validation
harness check-deps             # Dependency boundaries
harness linter generate        # Generate custom ESLint rules from harness-linter.yml
```

## Active Personas

- **Architecture Enforcer** — Layer violations, circular deps, forbidden imports
- **Documentation Maintainer** — Doc drift, missing JSDoc on exports
- **Entropy Cleaner** — Dead code, stale patterns, unused dependencies
