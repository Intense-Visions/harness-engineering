# Design: Example Projects and Documentation Refinement

**Date:** 2026-03-15

## Summary

Create three progressive example projects (hello-world, task-api, multi-tenant-api) at basic/intermediate/advanced adoption levels, plus update stale documentation (README.md, AGENTS.md, getting-started guide).

## Decisions Made During Design

- **Examples live inside the monorepo** at `examples/` — version-locked, discoverable, testable in CI
- **Three examples at three levels:** hello-world (basic), task-api (intermediate), multi-tenant-api (advanced)
- **Working but minimal code** — enough to make constraints meaningful, not complete apps
- **Sample `.harness.example/` directories** — show what state looks like, gitignored in real use
- **Progressive tutorial READMEs** — each example teaches the next level of harness, doubling as getting-started docs
- **VIOLATIONS.md** in task-api and multi-tenant-api — cheat sheets for deliberately triggering constraint violations

## Example 1: Hello World (Basic)

**Location:** `examples/hello-world/`

**Demonstrates:** `harness init` output, `harness validate`, `harness check-deps`, what config and AGENTS.md look like.

**Files:**
```
examples/hello-world/
├── README.md              — Tutorial: init → validate → explore
├── harness.config.json    — Basic config (project name, stack, level: basic)
├── AGENTS.md              — Generated agent knowledge map
├── package.json           — Minimal: name, scripts (test, lint, typecheck)
├── tsconfig.json
├── src/
│   ├── index.ts           — Entry point: exports greet() function
│   └── utils.ts           — Helper: formatName() used by index.ts
├── tests/
│   └── index.test.ts      — One test: greet("World") === "Hello, World!"
└── .harness.example/
    ├── state.json          — Shows position, progress, lastSession
    └── learnings.md        — One sample learning entry
```

**Code:** ~20 lines. `greet(name)` returns `"Hello, {name}!"`, one test, one utility.

**README flow:**
1. What is this? (2-sentence intro)
2. Try it (`npm install && harness validate`)
3. What just happened? (explains what validate checked)
4. Explore the config (harness.config.json walkthrough)
5. Next: try the task-api example

## Example 2: Task API (Intermediate)

**Location:** `examples/task-api/`

**Demonstrates:** Layered architecture with enforcement, ESLint plugin rules, `harness check-deps`, skills, one persona (architecture-enforcer), state management, principles file.

**Files:**
```
examples/task-api/
├── README.md                — Tutorial: layers → constraints → skills → personas
├── harness.config.json      — Intermediate config with layer definitions
├── AGENTS.md                — Agent knowledge map with architecture section
├── docs/
│   └── principles.md        — Project principles
├── package.json             — Express, vitest, eslint with harness plugin
├── tsconfig.json
├── eslint.config.mjs        — Harness ESLint plugin with layer rules
├── src/
│   ├── types/
│   │   └── task.ts          — Task interface + CreateTaskInput + TaskStatus enum
│   ├── services/
│   │   └── task-service.ts  — TaskService: create, list, getById, complete
│   └── api/
│       └── routes.ts        — Express router: POST/GET /tasks, PATCH /tasks/:id
├── tests/
│   ├── services/
│   │   └── task-service.test.ts  — Unit tests (4-5 tests)
│   └── api/
│       └── routes.test.ts        — Route tests (3-4 tests)
├── .harness.example/
│   ├── state.json            — Mid-project: 3 tasks complete, 2 pending
│   ├── learnings.md          — 3 tagged entries from different skills
│   └── failures.md           — 1 dead-end entry
└── VIOLATIONS.md             — Deliberate constraint violations to try
```

**Layer enforcement:**
- `types/` → bottom layer, no imports from services or api
- `services/` → can import from types only
- `api/` → can import from services and types

**Code:** ~80-100 lines across src/. In-memory task store, real Express routes, real tests.

**VIOLATIONS.md:** Shows 3 violations users can trigger (layer violation, missing test, dependency direction).

**README flow:**
1. What is this?
2. Quick start
3. Architecture (3-layer diagram)
4. Try breaking a constraint
5. Skills in context
6. Personas
7. State management
8. Next: multi-tenant-api example

## Example 3: Multi-Tenant API (Advanced)

**Location:** `examples/multi-tenant-api/`

**Demonstrates:** Custom linter rules via `harness linter generate`, boundary schemas, cross-artifact validation, all 3 personas, specs/changes convention, scale-adaptive rigor, full state lifecycle with handoffs and failure log.

**Files:**
```
examples/multi-tenant-api/
├── README.md                    — Tutorial: custom rules → boundaries → personas → full workflow
├── harness.config.json          — Advanced config with cross-check, custom rules
├── AGENTS.md                    — Comprehensive knowledge map
├── docs/
│   ├── principles.md            — Architectural principles (tenant isolation)
│   ├── specs/
│   │   └── tenant-isolation.md  — Source-of-truth spec for isolation rules
│   └── changes/                 — Empty, ready for proposals
├── harness-linter.yml           — Custom linter rules definition (matches linter-gen convention)
├── package.json
├── tsconfig.json
├── eslint.config.mjs            — Harness plugin + custom generated rules
├── src/
│   ├── types/
│   │   ├── tenant.ts            — Tenant, TenantContext interfaces
│   │   └── user.ts              — User interface with tenantId
│   ├── middleware/
│   │   └── tenant-context.ts    — Extract tenantId from request header
│   ├── services/
│   │   └── user-service.ts      — CRUD scoped by tenantId (all exported functions use Zod input validation)
│   └── api/
│       └── routes.ts            — Express routes, all require tenant context
├── tests/
│   ├── middleware/
│   │   └── tenant-context.test.ts  — Missing tenant header → 401
│   ├── services/
│   │   └── user-service.test.ts    — Tenant isolation tests
│   └── integration/
│       └── tenant-isolation.test.ts — Cross-tenant access → rejected
├── .harness.example/
│   ├── state.json               — State with decisions, resolved blockers
│   ├── learnings.md             — 5+ tagged entries across skills
│   ├── failures.md              — 2 dead-ends
│   ├── handoff.json             — Sample planning → execution handoff
│   └── archive/
│       └── failures-2026-03-01.md  — Archived milestone failures
└── VIOLATIONS.md                — Advanced violations to try
```

**Custom linter rule:** `harness-linter.yml` defines a tenant-scoping rule using the `import-restriction` template type (restricting direct DB access from outside services layer). Shows `harness linter generate` producing an ESLint rule from YAML.

**Boundary schema enforcement:** The `require-boundary-schema` ESLint rule checks that exported service functions contain Zod validation calls in their bodies. The user-service.ts demonstrates this by using `z.object()` schemas to validate inputs at the service boundary.

**Code:** ~120-150 lines across src/. In-memory store with tenant-scoped arrays, real middleware, tests verifying isolation.

**VIOLATIONS.md:** 4 violations — remove Zod validation from a service method (boundary schema violation), add a direct import from api/ into types/ (layer violation), modify a spec without updating code (cross-check staleness), remove JSDoc from an exported function (enforce-doc-exports).

## Documentation Refinement

**README.md (project root):**
- Rewrite to reflect current state (all packages exist, not "coming soon")
- Update project structure to include examples/, agents/, templates/
- Update status from "Phase 1" to "Complete — in adoption/refinement"
- Quick start → point to hello-world example
- Feature list: 6 packages, 21 skills, 3 personas, 4 templates (basic, intermediate, advanced, nextjs)

**AGENTS.md:**
- Update "Current Phase" from Phase 1 to current reality
- Add `examples/` to repository structure
- Add examples to "Where to Find Things" section

**docs/guides/getting-started.md:**
- Rewrite to reference three examples as primary learning path
- hello-world → task-api → multi-tenant-api progression

**docs/standard/index.md:**
- Update any stale phase references

## CI Testing

Examples are tested as part of the monorepo CI pipeline. Each example's `package.json` includes a `test` script. The root `turbo.json` can be extended to include `examples/*/` in the test task, or a simple `cd examples/hello-world && npm test` step added to CI. Validation: `harness validate` runs in each example directory.

## Not In Scope

- Dogfooding (separate effort after examples exist)
- Publishing prep (npm metadata, changelog — separate effort)
- No changes to packages/ — examples consume harness as-is
