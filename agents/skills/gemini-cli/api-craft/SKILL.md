# API Craft

> LLM-judgment critique of API design quality — the ceiling counterpart to rule-based API checks (OpenAPI-format compliance and webhook-format validation). A linter can confirm a path is documented and a schema validates; only judgment can tell whether the endpoint sits at the right abstraction, whether the HTTP verb is honest, whether a resource name belongs in the URL or a query param, whether a stranger could predict the response shape, and whether the error tells the consumer what to do. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a new or substantially-changed endpoint, resource, or OpenAPI contract
- Before publishing an API (or a new resource family) to consumers, to catch design debt the format floor cannot see
- Periodically, to audit whether a growing API surface has stayed consistent (resource naming, verb use, error shapes, pagination)
- On a project's own OpenAPI/Swagger documents and route/handler definitions — the natural inputs
- As the API critic alongside copy-craft (which owns error-message prose) and the rule-based API floor (OpenAPI/webhook format compliance)
- NOT for whether a schema validates or a path is documented (that is the mechanical floor, not this skill)
- NOT for the wording of a single error string in isolation (use copy-craft — it owns prose-in-code)
- NOT for authentication/authorization vulnerabilities or injection (use security-craft and the security floor)
- NOT for autofix / contract rewriting (this is judgment-only)

## Process

### B' precondition check (every invocation)

api-craft is the ceiling; it runs regardless of setup, but its critique sharpens when a project declares its API conventions. Before critiquing, note the state:

| Precondition       | Source                                            | If missing                                                                                                                                                                          |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiStyleDeclared` | a project API style guide (e.g. `docs/**/API.md`) | Run with the generic seed rubrics; note in the summary that a style guide would sharpen critique and offer to seed one (progressive upgrade — the same posture as docs-craft's B'). |

When no style guide exists, api-craft still runs with the seed rubrics (degraded, not blocked). It never refuses to critique just because a project has not written its API conventions down.

### Phase 1: DISCOVER — Find API surfaces

1. **Read project configuration.** Shared craft config under `craft.llm.*` selects the judgment backend. `maxFiles` (default 60) caps the surface count.

2. **Discover the API surface.** Two kinds are collected:
   - **OpenAPI / Swagger documents** (YAML or JSON) under the project root and conventional roots (`docs`, `spec`, `specs`, `api`, `openapi`, `src`), matched by filename (`openapi.yaml`, `swagger.json`) or a root `openapi:` / `swagger:` key.
   - **Route / handler definitions** in code under the conventional roots (`src/routes`, `src/api`, `src/controllers`, `src/handlers`, `app/api`, `pages/api`, `routes`, `api`, …), included only when the file carries a route SIGNAL — a `.get(/.post(` call, an `@Get()`/`@Controller()` decorator, an exported `GET`/`POST` handler, etc. `--routes-dir` points route discovery at an explicit directory; `--spec-file` names an explicit OpenAPI document; `--files` overrides discovery entirely.

3. **Exclude non-API surfaces.** Tests / specs, type declarations, barrels and registries (`index.ts`, `_registry.ts`), build / dependency trees (`node_modules`, `dist`), and helper modules under an API root that define no endpoint are skipped — they are not authored API surfaces.

### Phase 2: CRITIQUE — Per (surface, rubric) loop, kind-filtered

9 seed rubrics, each declaring which surface kinds it applies to:

| Rubric     | Title                                              | Applies to |
| ---------- | -------------------------------------------------- | ---------- |
| `API-R001` | Resources model the domain, not the implementation | all        |
| `API-R002` | Resource naming and URL structure are predictable  | all        |
| `API-R003` | HTTP methods are honest                            | all        |
| `API-R004` | Status codes are correct and meaningful            | all        |
| `API-R005` | Error responses tell the consumer what to do       | all        |
| `API-R006` | Response shapes are predictable and consistent     | all        |
| `API-R007` | Collections paginate and filter consistently       | all        |
| `API-R008` | Mutations are idempotency-honest                   | route only |
| `API-R009` | Evolves without breaking consumers                 | all        |

For each (surface, rubric) where the rubric applies to the surface's kind:

1. Build a prompt with the rubric description + surface kind + surface source (truncated to 8000 chars for cost).
2. The LLM returns fenced JSON: `null` (rubric doesn't apply / the surface already clears the bar) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit an `ApiFinding` with `cite.rubricId` populated for ADR 0020 traceability, and a derived `priority` for sorting.

Idempotency (`API-R008`) is a handler-behavior concern a declarative spec rarely captures, so it critiques `route` surfaces only; an OpenAPI document is critiqued against the other eight rubrics. This is the API analogue of cli-ergonomics-craft's leaf/group filter.

A small curated exemplar set anchors the catalog — **Stripe, Linear's GraphQL API, GitHub's REST API, Resend, and the Anthropic API** — each a public reference point for one API-quality dimension (Stripe for idempotent requests, cursor pagination, and dated versioning; Linear for domain-mirroring types; GitHub for a guessable path grammar; Resend for a right-sized resource surface; Anthropic for honest methods and a consistent error contract). The exemplars ground the rubric sources today and seed a future BENCHMARK phase, the direct analogue of docs-craft's exemplar corpus.

### Phase 3: REPORT — Aggregate + cost telemetry

Emit `ApiCraftOutput`:

```ts
{
  findings: ApiFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
    counts: { filesScanned, filesSkipped };
    runId: string;
  }
}
```

## Harness Integration

- **`harness api-craft`** — CLI entry. `--files <glob>` / `--routes-dir <dir>` / `--spec-file <file>` / `--exclude-dirs <dirs...>` / `--max-files <n>` / `--json` / `--verbose`. Exits non-zero when any `foundational`-tier finding is present.
- **`mcp__harness__api_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueApiSurfaceFile(file, opts)` exported from `packages/cli/src/api-craft/index.ts`. Another craft skill (or an orchestrator) can critique a single spec or route file without re-walking the project.
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, and the 3-axis types all live in `packages/cli/src/shared/craft/`.
- **Sibling boundaries:** copy-craft owns error-message and log prose; security-craft owns trust-boundary and least-authority critique; the rule-based API floor owns OpenAPI/webhook format compliance. api-craft owns the SHAPE of the API contract — resource modeling, naming, verbs, status codes, error contracts, response shapes, pagination, idempotency, and compatible evolution.

## Success Criteria

See `docs/changes/api-craft/proposal.md` for the full success criteria. Highlights:

- 9 seed rubrics ship at `catalog/rubrics/<slug>.ts` (file-per-rubric, matching the craft family)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- Kind-aware rubric filtering (the idempotency rubric never fires on a static OpenAPI document)
- A curated exemplar set anchors the catalog and grows without a schema change
- Cross-cutting `critiqueApiSurfaceFile` works on a single surface without a project walk
- Graceful degradation: runs with seed rubrics when no API style guide is declared

## Examples

### Example: A GET that mutates state

**Input:** `src/routes/widgets.ts` defining `router.get('/widgets/delete/:id', …)` whose handler deletes the record.

**Output (mock LLM):**

```
src/routes/widgets.ts (route)
  API-R003 [foundational/large/high] src/routes/widgets.ts (route)
    `GET /widgets/delete/:id` mutates state — a GET must be safe, and caches or
    prefetchers may replay it. Model this as `DELETE /widgets/:id` so retry and
    caching behavior are predictable from the method alone.
```

### Example: A create with no idempotency path

**Input:** `src/routes/payments.ts` — a `POST /payments` handler that charges a card with no idempotency key and no dedup.

**Output:**

```
src/routes/payments.ts (route)
  API-R008 [foundational/large/high] src/routes/payments.ts (route)
    `POST /payments` charges on every call with no idempotency key — a network
    retry double-charges. Accept an `Idempotency-Key` header and return the
    original result for a repeated key, the way Stripe's charge API does.
```

### Example: A clean OpenAPI document — no findings

**Input:** An `openapi.yaml` with domain-modeled resources, plural paths, honest methods, correct status codes, a consistent typed error schema, cursor pagination, and a version.

**Output:**

```
No API-craft findings.

Summary: 0 findings across 1 API surfaces (0 skipped, 8 rubrics, 5 exemplars, 8 LLM calls, $0.0000, 5ms)
```

## Gates

- **No autofix.** api-craft is judgment-only; it never rewrites a contract or a handler.
- **No floor duplication.** Whether a schema validates or a path is documented is a mechanical concern, not this skill's.
- **No sibling territory.** Error-message wording belongs to copy-craft; trust-boundary and auth-vulnerability critique belongs to security-craft.
- **No POLISH / BENCHMARK phases in v1.** The catalog carries exemplars so a future BENCHMARK phase (score against the Stripe / GitHub tier) lands without a schema change — but v1 is CRITIQUE-only, the same first-version posture as the rest of the non-design craft family.
- **No graph persistence.** v1 returns findings; it does not write craft edges to the graph.
- **No runtime introspection.** v1 reasons from the OpenAPI document and route-definition source, not from calling the live API — a later minor version may add a runtime probe.
- **No B' hard block.** When no API style guide is declared, api-craft runs with the seed rubrics and notes the degraded context — it never refuses.

## Escalation

- **When LLM cost is too high:** drop `--max-files` (default 60), or scope to specific surfaces with `--files` / `--spec-file`. Per-surface cost = applicable rubrics × per-call; source is truncated at 8000 input chars.
- **When a rubric produces a high false-positive rate:** scope away with `--files`, or filter findings by `cite.rubricId` in your consumer. Per-rubric disable is a later minor version.
- **When discovery misses a project's layout:** point route discovery at the right place with `--routes-dir`, name the contract with `--spec-file`, or pass an explicit `--files` list.
- **When no LLM provider is configured:** api-craft is LLM-judgment-based. Configure a craft backend under `craft.llm.*`; do not expect rule-based output.

## Status

**v1 — CRITIQUE phase.** See:

- Spec: `docs/changes/api-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `harness-cli-ergonomics-craft` (the structural twin), `harness-docs-craft`, `harness-code-craft`, `harness-design-craft`, `naming-craft`, `spec-craft`, `copy-craft`, `test-craft`, `knowledge-craft`, `security-craft`
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: a BENCHMARK phase scoring against the exemplar corpus, a runtime probe against a live API, and a per-rubric disable configuration
