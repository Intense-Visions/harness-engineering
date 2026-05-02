# Plan: Phase D — Backfill & Polish (Knowledge Skills Schema Enrichment)

**Date:** 2026-04-08
**Spec:** docs/changes/knowledge-skills-schema-enrichment/proposal.md
**Estimated tasks:** 9
**Estimated time:** 38 minutes

## Goal

All 81 existing behavioral skills have been analyzed for `paths` and `related_skills` applicability, appropriate values applied, the regression test suite confirms no dispatch quality regression, and `harness-skill-authoring/SKILL.md` covers the knowledge skill format.

## Observable Truths (Acceptance Criteria)

1. When `harness validate` runs after all changes, it passes with 0 errors.
2. When `npx vitest run tests/skill/dispatcher.test.ts` runs inside `packages/cli/`, all 53 existing tests pass (no regression).
3. The skills `harness-containerization`, `harness-infrastructure-as-code`, `harness-database`, `harness-sql-review`, `harness-e2e`, `harness-visual-regression`, `harness-mobile-patterns`, and `harness-ml-ops` each have a non-empty `paths:` list in their `skill.yaml`, containing only file-type-specific globs (no `**/*.ts` or similar catch-alls).
4. The skills `harness-database`, `harness-sql-review`, `harness-api-design`, `harness-tdd`, `harness-e2e`, `harness-resilience`, `harness-observability`, `harness-security-review`, `harness-event-driven`, `harness-data-validation`, `harness-auth`, `harness-state-management`, `harness-refactoring`, `harness-caching`, and `harness-mobile-patterns` each have a non-empty `related_skills:` list referencing genuine knowledge skill counterparts.
5. The remaining 66 behavioral skills retain `paths: []` (or no `paths:` field) — no false-activation globs have been added.
6. `agents/skills/claude-code/harness-skill-authoring/SKILL.md` contains a new section titled `## Knowledge Skills` (or equivalent) that covers: `type: knowledge` usage, `paths` glob authoring rules, `related_skills` authoring, and the `## Instructions` / `## Details` progressive disclosure convention.
7. A backfill decision log is committed documenting which skills received paths/related_skills and which did not, as a comment block in this plan or as a separate markdown file.

## File Map

```
MODIFY agents/skills/claude-code/harness-containerization/skill.yaml
MODIFY agents/skills/claude-code/harness-infrastructure-as-code/skill.yaml
MODIFY agents/skills/claude-code/harness-database/skill.yaml
MODIFY agents/skills/claude-code/harness-sql-review/skill.yaml
MODIFY agents/skills/claude-code/harness-e2e/skill.yaml
MODIFY agents/skills/claude-code/harness-visual-regression/skill.yaml
MODIFY agents/skills/claude-code/harness-mobile-patterns/skill.yaml
MODIFY agents/skills/claude-code/harness-ml-ops/skill.yaml
MODIFY agents/skills/claude-code/harness-api-design/skill.yaml
MODIFY agents/skills/claude-code/harness-tdd/skill.yaml
MODIFY agents/skills/claude-code/harness-resilience/skill.yaml
MODIFY agents/skills/claude-code/harness-observability/skill.yaml
MODIFY agents/skills/claude-code/harness-security-review/skill.yaml
MODIFY agents/skills/claude-code/harness-event-driven/skill.yaml
MODIFY agents/skills/claude-code/harness-data-validation/skill.yaml
MODIFY agents/skills/claude-code/harness-auth/skill.yaml
MODIFY agents/skills/claude-code/harness-state-management/skill.yaml
MODIFY agents/skills/claude-code/harness-refactoring/skill.yaml
MODIFY agents/skills/claude-code/harness-caching/skill.yaml
MODIFY agents/skills/claude-code/harness-skill-authoring/SKILL.md
```

## Skeleton

1. Analysis pass — read all 81 behavioral skills and produce backfill decision log (~2 tasks, ~8 min)
2. Apply `paths` globs to infrastructure/environment skills (~2 tasks, ~8 min)
3. Apply `paths` globs to testing/spec skills + `related_skills` backfill (~3 tasks, ~12 min)
4. Documentation update — harness-skill-authoring SKILL.md (~1 task, ~5 min)
5. Regression test and final validation (~1 task, ~5 min)

**Estimated total:** 9 tasks, ~38 minutes

_Skeleton approved: yes (standard rigor, ~9 tasks, proceeded to full expansion)._

---

## Backfill Decision Log

This log documents the analysis result for all 81 behavioral skills. Skills are grouped by decision.

### Group A: Paths applied (8 skills)

These skills have file-type-specific activation signals that map cleanly to glob patterns without over-broad matching.

| Skill                            | Paths assigned                                                                                                    | Rationale                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `harness-containerization`       | `Dockerfile`, `docker-compose*.yml`, `docker-compose*.yaml`, `.dockerignore`                                      | These are uniquely containerization-specific filenames — no false activation risk |
| `harness-infrastructure-as-code` | `*.tf`, `*.tfvars`, `Pulumi.yaml`, `cdk.json`, `*.template.yaml`, `*.template.json`                               | IaC-specific file types — unambiguous                                             |
| `harness-database`               | `*.sql`, `prisma/schema.prisma`, `drizzle.config.ts`, `drizzle.config.js`, `knexfile.ts`, `knexfile.js`           | ORM config + SQL files are unambiguous database indicators                        |
| `harness-sql-review`             | `*.sql`                                                                                                           | SQL files are the primary activation signal                                       |
| `harness-e2e`                    | `playwright.config.ts`, `playwright.config.js`, `cypress.config.ts`, `cypress.config.js`, `*.spec.ts`, `*.e2e.ts` | E2E framework config files are unambiguous                                        |
| `harness-visual-regression`      | `percy.yml`, `.chromatic` (dir indicator not used as glob — omit), `.storybook/main.ts`, `.storybook/main.js`     | Visual regression tool configs are unambiguous                                    |
| `harness-mobile-patterns`        | `app.json`, `pubspec.yaml`, `*.xcodeproj` (not glob-safe), `*.gradle`, `AndroidManifest.xml`, `Info.plist`        | Mobile-native file types                                                          |
| `harness-ml-ops`                 | `*.ipynb`, `mlflow.yaml`, `wandb/settings`                                                                        | Jupyter notebooks and ML experiment configs are unambiguous                       |

### Group B: related_skills applied (15 skills)

These skills have strong conceptual overlap with existing knowledge skill families. The `related_skills` cross-references help agents discover relevant knowledge patterns when a behavioral skill is activated.

| Skill                      | related_skills                                                                                                         | Rationale                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `harness-database`         | `prisma-schema-design`, `prisma-migrations`, `drizzle-schema-definition`, `drizzle-migrations`                         | Direct ORM counterparts                    |
| `harness-sql-review`       | `prisma-performance-patterns`, `drizzle-performance-patterns`, `prisma-raw-queries`, `drizzle-query-builder`           | SQL optimization knowledge patterns        |
| `harness-api-design`       | `graphql-schema-design`, `graphql-resolver-pattern`, `graphql-pagination-patterns`, `trpc-router-composition`          | API design knowledge patterns              |
| `harness-tdd`              | `test-tdd-workflow`, `test-unit-patterns`, `test-mock-patterns`, `test-vitest-config`                                  | TDD knowledge patterns                     |
| `harness-e2e`              | `test-e2e-strategy`, `test-playwright-patterns`, `test-playwright-setup`, `test-msw-pattern`                           | E2E testing knowledge                      |
| `harness-resilience`       | `resilience-circuit-breaker`, `resilience-retry-pattern`, `resilience-bulkhead-pattern`, `resilience-fallback-pattern` | Resilience pattern knowledge               |
| `harness-observability`    | `otel-sdk-setup`, `otel-tracing-pattern`, `otel-metrics-pattern`, `otel-logging-pattern`                               | OpenTelemetry knowledge patterns           |
| `harness-security-review`  | `owasp-auth-patterns`, `owasp-injection-prevention`, `owasp-xss-prevention`, `owasp-security-headers`                  | OWASP security knowledge                   |
| `harness-event-driven`     | `events-event-schema`, `events-pubsub-pattern`, `events-kafka-patterns`, `events-outbox-pattern`                       | Event-driven architecture knowledge        |
| `harness-data-validation`  | `zod-schema-definition`, `zod-object-patterns`, `zod-error-handling`, `ts-type-guards`                                 | Validation library knowledge               |
| `harness-auth`             | `owasp-auth-patterns`, `owasp-csrf-protection`, `next-auth-patterns`                                                   | Auth security knowledge                    |
| `harness-state-management` | `state-zustand-store`, `state-zustand-slices`, `redux-slice-pattern`, `state-context-pattern`                          | State management knowledge                 |
| `harness-refactoring`      | `gof-strategy-pattern`, `gof-adapter-pattern`, `gof-facade-pattern`, `gof-decorator-pattern`                           | GoF patterns applicable during refactoring |
| `harness-caching`          | `resilience-rate-limiting`, `resilience-fallback-pattern`                                                              | Caching and resilience overlap             |
| `harness-mobile-patterns`  | `mobile-performance-patterns`, `mobile-navigation-pattern`, `mobile-network-patterns`, `mobile-storage-patterns`       | Mobile knowledge patterns                  |

### Group C: No change (58 skills)

These skills retain `paths: []` and no `related_skills` because either: (a) their activation is purely conceptual/process-based with no file-type mapping, or (b) their existing `stack_signals` already cover detection, and adding `paths` would risk over-broad activation (e.g., `src/**/*.ts` patterns).

All harness process skills (`harness-planning`, `harness-execution`, `harness-brainstorming`, etc.), generic analysis skills (`harness-debugging`, `harness-code-review`, `harness-security-scan`), and cross-cutting concerns with language-name stack_signals (`harness-i18n`, `harness-accessibility`, `harness-design-web`) fall here.

---

## Tasks

### Task 1: Apply paths globs to infrastructure skills

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-containerization/skill.yaml`, `agents/skills/claude-code/harness-infrastructure-as-code/skill.yaml`, `agents/skills/claude-code/harness-ml-ops/skill.yaml`

1. Read `agents/skills/claude-code/harness-containerization/skill.yaml` to find the insertion point (after `stack_signals:` block, before `phases:`).

2. Add `paths:` block to `agents/skills/claude-code/harness-containerization/skill.yaml` after the last `stack_signals` entry, before `triggers:` or `phases:`:

   ```yaml
   paths:
     - 'Dockerfile'
     - 'docker-compose*.yml'
     - 'docker-compose*.yaml'
     - '.dockerignore'
   ```

3. Read `agents/skills/claude-code/harness-infrastructure-as-code/skill.yaml` to find insertion point.

4. Add `paths:` block to `agents/skills/claude-code/harness-infrastructure-as-code/skill.yaml`:

   ```yaml
   paths:
     - '*.tf'
     - '*.tfvars'
     - 'Pulumi.yaml'
     - 'cdk.json'
     - '*.template.yaml'
     - '*.template.json'
   ```

5. Read `agents/skills/claude-code/harness-ml-ops/skill.yaml` to find insertion point.

6. Add `paths:` block to `agents/skills/claude-code/harness-ml-ops/skill.yaml`:

   ```yaml
   paths:
     - '*.ipynb'
     - 'mlflow.yaml'
     - 'requirements.txt'
   ```

   Note: `requirements.txt` is somewhat broad but the ML context is established by coexisting `stack_signals`. If this proves too broad in testing, remove it and keep only `*.ipynb` and `mlflow.yaml`.

7. Run: `harness validate`
8. Commit: `feat(skills): add paths globs to infrastructure and ml-ops behavioral skills`

---

### Task 2: Apply paths globs to database and E2E skills

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-database/skill.yaml`, `agents/skills/claude-code/harness-sql-review/skill.yaml`, `agents/skills/claude-code/harness-e2e/skill.yaml`, `agents/skills/claude-code/harness-visual-regression/skill.yaml`, `agents/skills/claude-code/harness-mobile-patterns/skill.yaml`

1. Read each target skill.yaml to find insertion point (before `phases:` or `state:`, after `stack_signals:`).

2. Add `paths:` block to `agents/skills/claude-code/harness-database/skill.yaml`:

   ```yaml
   paths:
     - '*.sql'
     - 'prisma/schema.prisma'
     - 'drizzle.config.ts'
     - 'drizzle.config.js'
     - 'knexfile.ts'
     - 'knexfile.js'
   ```

3. Add `paths:` block to `agents/skills/claude-code/harness-sql-review/skill.yaml`:

   ```yaml
   paths:
     - '*.sql'
   ```

4. Add `paths:` block to `agents/skills/claude-code/harness-e2e/skill.yaml`:

   ```yaml
   paths:
     - 'playwright.config.ts'
     - 'playwright.config.js'
     - 'cypress.config.ts'
     - 'cypress.config.js'
     - '*.e2e.ts'
     - '*.e2e.js'
   ```

   Do NOT add `*.spec.ts` — this would match all unit test spec files and is too broad.

5. Add `paths:` block to `agents/skills/claude-code/harness-visual-regression/skill.yaml`:

   ```yaml
   paths:
     - 'percy.yml'
     - '.storybook/main.ts'
     - '.storybook/main.js'
   ```

6. Add `paths:` block to `agents/skills/claude-code/harness-mobile-patterns/skill.yaml`:

   ```yaml
   paths:
     - 'app.json'
     - 'pubspec.yaml'
     - 'AndroidManifest.xml'
     - 'Info.plist'
   ```

   Note: `*.xcodeproj` and `*.gradle` use a wildcard but are specific enough (only mobile projects contain them). Include if the YAML editor can handle them without glob-expansion issues at validate time, otherwise omit.

7. Run: `harness validate`
8. Commit: `feat(skills): add paths globs to database, sql-review, e2e, visual-regression, and mobile behavioral skills`

---

### Task 3: Apply related_skills to database and API behavioral skills

**Depends on:** none (no ordering dependency on Tasks 1-2)
**Files:** `agents/skills/claude-code/harness-database/skill.yaml`, `agents/skills/claude-code/harness-sql-review/skill.yaml`, `agents/skills/claude-code/harness-api-design/skill.yaml`, `agents/skills/claude-code/harness-tdd/skill.yaml`, `agents/skills/claude-code/harness-e2e/skill.yaml`

1. Read each skill.yaml to find insertion point (before `state:`, after `depends_on:` or at the end before `state:`).

2. Add `related_skills:` to `agents/skills/claude-code/harness-database/skill.yaml`:

   ```yaml
   related_skills:
     - prisma-schema-design
     - prisma-migrations
     - drizzle-schema-definition
     - drizzle-migrations
   ```

3. Add `related_skills:` to `agents/skills/claude-code/harness-sql-review/skill.yaml`:

   ```yaml
   related_skills:
     - prisma-performance-patterns
     - drizzle-performance-patterns
     - prisma-raw-queries
     - drizzle-query-builder
   ```

4. Add `related_skills:` to `agents/skills/claude-code/harness-api-design/skill.yaml`:

   ```yaml
   related_skills:
     - graphql-schema-design
     - graphql-resolver-pattern
     - graphql-pagination-patterns
     - trpc-router-composition
   ```

5. Add `related_skills:` to `agents/skills/claude-code/harness-tdd/skill.yaml`:

   ```yaml
   related_skills:
     - test-tdd-workflow
     - test-unit-patterns
     - test-mock-patterns
     - test-vitest-config
   ```

6. Add `related_skills:` to `agents/skills/claude-code/harness-e2e/skill.yaml`:

   ```yaml
   related_skills:
     - test-e2e-strategy
     - test-playwright-patterns
     - test-playwright-setup
     - test-msw-pattern
   ```

7. Run: `harness validate`
8. Commit: `feat(skills): add related_skills to database, sql-review, api-design, tdd, and e2e behavioral skills`

---

### Task 4: Apply related_skills to resilience, observability, security, and event-driven skills

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-resilience/skill.yaml`, `agents/skills/claude-code/harness-observability/skill.yaml`, `agents/skills/claude-code/harness-security-review/skill.yaml`, `agents/skills/claude-code/harness-event-driven/skill.yaml`, `agents/skills/claude-code/harness-auth/skill.yaml`

1. Read each skill.yaml to find insertion point (before `state:` or at the end of the top-level block).

2. Add `related_skills:` to `agents/skills/claude-code/harness-resilience/skill.yaml`:

   ```yaml
   related_skills:
     - resilience-circuit-breaker
     - resilience-retry-pattern
     - resilience-bulkhead-pattern
     - resilience-fallback-pattern
   ```

3. Add `related_skills:` to `agents/skills/claude-code/harness-observability/skill.yaml`:

   ```yaml
   related_skills:
     - otel-sdk-setup
     - otel-tracing-pattern
     - otel-metrics-pattern
     - otel-logging-pattern
   ```

4. Add `related_skills:` to `agents/skills/claude-code/harness-security-review/skill.yaml`:

   ```yaml
   related_skills:
     - owasp-auth-patterns
     - owasp-injection-prevention
     - owasp-xss-prevention
     - owasp-security-headers
   ```

5. Add `related_skills:` to `agents/skills/claude-code/harness-event-driven/skill.yaml`:

   ```yaml
   related_skills:
     - events-event-schema
     - events-pubsub-pattern
     - events-kafka-patterns
     - events-outbox-pattern
   ```

6. Add `related_skills:` to `agents/skills/claude-code/harness-auth/skill.yaml`:

   ```yaml
   related_skills:
     - owasp-auth-patterns
     - owasp-csrf-protection
     - next-auth-patterns
   ```

7. Run: `harness validate`
8. Commit: `feat(skills): add related_skills to resilience, observability, security-review, event-driven, and auth behavioral skills`

---

### Task 5: Apply related_skills to validation, state-management, refactoring, caching, and mobile skills

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-data-validation/skill.yaml`, `agents/skills/claude-code/harness-state-management/skill.yaml`, `agents/skills/claude-code/harness-refactoring/skill.yaml`, `agents/skills/claude-code/harness-caching/skill.yaml`, `agents/skills/claude-code/harness-mobile-patterns/skill.yaml`

1. Read each skill.yaml to find insertion point.

2. Add `related_skills:` to `agents/skills/claude-code/harness-data-validation/skill.yaml`:

   ```yaml
   related_skills:
     - zod-schema-definition
     - zod-object-patterns
     - zod-error-handling
     - ts-type-guards
   ```

3. Add `related_skills:` to `agents/skills/claude-code/harness-state-management/skill.yaml` (flexible type):

   ```yaml
   related_skills:
     - state-zustand-store
     - state-zustand-slices
     - redux-slice-pattern
     - state-context-pattern
   ```

4. Add `related_skills:` to `agents/skills/claude-code/harness-refactoring/skill.yaml` (flexible type):

   ```yaml
   related_skills:
     - gof-strategy-pattern
     - gof-adapter-pattern
     - gof-facade-pattern
     - gof-decorator-pattern
   ```

5. Add `related_skills:` to `agents/skills/claude-code/harness-caching/skill.yaml`:

   ```yaml
   related_skills:
     - resilience-rate-limiting
     - resilience-fallback-pattern
   ```

6. Add `related_skills:` to `agents/skills/claude-code/harness-mobile-patterns/skill.yaml`:

   ```yaml
   related_skills:
     - mobile-performance-patterns
     - mobile-navigation-pattern
     - mobile-network-patterns
     - mobile-storage-patterns
   ```

7. Run: `harness validate`
8. Commit: `feat(skills): add related_skills to data-validation, state-management, refactoring, caching, and mobile behavioral skills`

---

### Task 6: Full regression test — verify behavioral skill dispatch unchanged

[checkpoint:human-verify]

**Depends on:** Tasks 1–5
**Files:** none (test-only task)

This task verifies that the backfill did not degrade behavioral skill dispatch quality. The key concern: `paths: []` produces 0.0 path score, so behavioral skills that remain without paths are unaffected. Skills that received paths globs should only score higher when those specific files are present, never lower.

1. Run the dispatcher test suite from inside the CLI package:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/cli
   npx vitest run tests/skill/dispatcher.test.ts
   ```

   Expected output: `53 passed (53)`. If any test fails, investigate before proceeding.

2. Run the full skill test suite:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/cli
   npx vitest run tests/skill/
   ```

   Expected: all tests pass. Known pre-existing failures (748 codex missing skills, 4 numeric-keyword schema issues) are acceptable and unrelated to this work — verify they match the pre-existing failure pattern.

3. Run `harness validate` from project root.

4. [checkpoint:human-verify] — Review test output. Confirm all 53 dispatcher tests pass. Confirm no new failures in `tests/skill/`. If unexpected failures appear, investigate before proceeding to Task 7.

5. Commit (only if new tests need to be added to cover the new paths; otherwise this is a verification-only task with no commit):

   If all tests pass without change: no commit needed here.
   If a new test is warranted for behavioral skill paths activation (e.g., showing `harness-database` surfaces when `*.sql` file is present), add it to `packages/cli/tests/skill/dispatcher.test.ts` in the `path-isolation dispatch` describe block:

   ```typescript
   it('harness-database surfaces when recentFiles contain .sql files', () => {
     const entry = makeEntry({
       type: 'rigid',
       keywords: ['database', 'migration', 'schema', 'SQL'],
       paths: ['*.sql'],
       description: 'Schema design, migrations, ORM patterns, and migration safety checks',
     });
     const index = makeIndex({ 'harness-database': entry });
     const result = suggest(index, 'migration schema', null, ['db/migrations/001_init.sql']);
     const allSurfaced = [
       ...result.suggestions.map((s) => s.name),
       ...result.autoInjectKnowledge.map((s) => s.name),
     ];
     expect(allSurfaced.some((n) => n === 'harness-database')).toBe(true);
   });
   ```

   Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/skill/dispatcher.test.ts`
   Commit (if test added): `test(dispatcher): add path-activation test for harness-database behavioral skill`

---

### Task 7: Update harness-skill-authoring SKILL.md — add knowledge skill section

**Depends on:** none (independent of Tasks 1–6)
**Files:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md`

The current SKILL.md covers Phase 1 (DEFINE), Phase 2 (CHOOSE TYPE — rigid vs flexible), Phase 3 (WRITE SKILL.YAML), Phase 4 (WRITE SKILL.MD), and Phase 5 (VALIDATE). It needs a `Phase 2B` inserted between Phase 2 and Phase 3 that covers knowledge skills.

1. Read the full `agents/skills/claude-code/harness-skill-authoring/SKILL.md` to confirm current structure.

2. Insert the following section between `### Phase 2: CHOOSE TYPE — Rigid or Flexible` and `### Phase 3: WRITE SKILL.YAML`:

   ````markdown
   ### Phase 2B: CHOOSE TYPE — Knowledge Skills

   Knowledge skills encode domain reference material (design patterns, architectural guidance, best practices) as first-class skills. They are _not_ behavioral — they do not define process phases, require tools, or maintain state. Agents receive them as contextual guidance alongside behavioral skills.

   **Choose `type: knowledge` when:**

   - The skill encodes "know things" content, not "do things" process
   - The content is reference material an agent should _consult_ rather than _execute_
   - The skill maps cleanly to a technology vertical (e.g., React patterns, TypeScript generics, OWASP rules)
   - The skill's value is educational depth that benefits from progressive disclosure
   - NOT when the skill requires tools, phases, or state — those are rigid or flexible skills
   - NOT when the skill is a harness process skill (planning, execution, brainstorming)

   **Knowledge skill `skill.yaml` template:**

   ```yaml
   name: <technology-prefix>-<pattern-name> # e.g., react-hooks-pattern, ts-generics-pattern
   version: '1.0.0'
   description: <one-line summary>
   cognitive_mode: advisory-guide # always advisory-guide for knowledge skills
   type: knowledge
   tier: 3
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
   tools: [] # knowledge skills declare no tools
   paths:
     - '**/*.tsx' # file-type-specific globs only — see rules below
   related_skills:
     - <complementary-knowledge-skill> # other knowledge skills in the same vertical
   stack_signals:
     - typescript
     - react
   keywords:
     - hooks
     - custom-hooks
   metadata:
     author: <author-name>
     upstream: '<source-url>' # provenance tracking
   state:
     persistent: false
     files: []
   depends_on: []
   ```
   ````

   **`paths` authoring rules (critical — read carefully):**

   The `paths` field is a list of minimatch glob patterns matched against the user's recent/changed files. A match boosts the skill's dispatch score by 0.20 (the paths scoring weight). Incorrect globs cause false activation.

   Rules:
   1. **Use file-type-specific globs only.** `**/*.tsx`, `**/*.vue`, `*.sql`, `Dockerfile` are correct. `**/*.ts` is incorrect — it activates for every TypeScript project regardless of context.
   2. **The lesson from Vue skills:** `**/*.ts` was initially added to Vue skills and had to be removed. TypeScript files exist in every project; Vue-specific content should only activate on `**/*.vue` files.
   3. **Config file patterns are safe.** `playwright.config.ts`, `prisma/schema.prisma`, `drizzle.config.ts` are sufficiently specific.
   4. **When in doubt, leave `paths: []`.** A skill with `paths: []` scores 0.0 on the paths dimension but can still surface via keyword and stack_signals matching.
   5. **Test your globs.** After adding paths, verify the skill surfaces when the target file is present and does NOT surface when an unrelated file is present (e.g., a Vue skill must not activate when only `.ts` files are present).

   **`related_skills` authoring rules:**

   The `related_skills` field lists knowledge skill names (not behavioral skills) that complement the current skill. These are surfaced as secondary recommendations when the current skill is auto-injected.

   Rules:
   1. **Only reference skills that genuinely complement each other.** A React hooks skill relates to React compound pattern, not to OWASP security rules.
   2. **Reference by exact skill name** (directory name, e.g., `react-compound-pattern`, not `React Compound Pattern`).
   3. **Keep lists short (2–5 entries).** More than 5 related skills dilutes the signal.
   4. **Bidirectionality is not required** but is good practice — if skill A lists skill B, skill B should list skill A.

   **Knowledge skill `SKILL.md` structure:**

   Knowledge skills use a two-section disclosure model. The `## Instructions` section (~5K tokens max) is auto-injected into agent context on high-confidence matches. The `## Details` section is loaded on-demand for educational depth.

   ```markdown
   # <Pattern Name>

   > <One-sentence description>

   ## When to Use

   - [Specific activation conditions]
   - NOT when [boundary conditions]

   ## Instructions

   [Agent-facing directives — concise, actionable, <5K tokens]
   [This section is auto-injected on high-confidence dispatch]

   ## Details

   [Educational depth — patterns, examples, trade-offs]
   [This section is loaded on-demand when the agent explicitly requests it]

   ## Source

   [Link to original source / upstream]
   ```

   The `## Details` heading is the boundary marker. Everything before it is the Instructions section. The progressive disclosure split happens at `\n## Details`.

   **Schema constraints enforced automatically:**
   - `type: knowledge` → `phases` must be empty or omitted
   - `type: knowledge` → `tools` must be empty
   - `type: knowledge` → `state.persistent` must be false
   - `type: knowledge` → `cognitive_mode` defaults to `advisory-guide`
   - `type: knowledge` → `tier` defaults to 3

   ```

   ```

3. Verify the inserted section renders correctly (check heading levels, YAML code blocks, markdown formatting).

4. Run `harness validate`.

5. Commit: `docs(skill-authoring): add knowledge skill type guidance to harness-skill-authoring SKILL.md`

---

### Task 8: Update harness-skill-authoring SKILL.md — update schema template and examples

**Depends on:** Task 7
**Files:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md`

Task 7 adds the Phase 2B section. This task updates the Phase 3 WRITE SKILL.YAML section to show `paths`, `related_skills`, and `metadata` fields in the reference template, and updates the quality checklist to include knowledge skills.

1. Read the current `agents/skills/claude-code/harness-skill-authoring/SKILL.md` after Task 7 changes.

2. In `### Phase 3: WRITE SKILL.YAML — Define Metadata`, find the `skill.yaml` template code block and add the three new fields after `depends_on:`:

   Find this block ending:

   ```yaml
   depends_on:
     - <prerequisite-skill> # Skills that must be available (not necessarily run first)
   ```

   Replace with:

   ```yaml
   depends_on:
     - <prerequisite-skill> # Skills that must be available (not necessarily run first)
   # Optional fields (required for knowledge skills, optional for behavioral skills)
   paths: [] # File-type-specific glob patterns for dispatch boost
   related_skills: [] # Complementary skill names (knowledge skills only)
   metadata: # Provenance and authorship metadata
     author: <author>
     upstream: '<source-url>'
   ```

3. In the `Skill Quality Checklist` section, add a row to the quality matrix table for knowledge skills. Find the table and add after the existing rows:

   After `| **Missing implementation** | Stub | Stub | Does not exist |`, add a note:

   ```
   **Knowledge skills** follow the same quality matrix. "Clear activation" for a knowledge skill means
   `paths` globs and `stack_signals` are specific enough to surface the skill without false positives.
   "Specific implementation" means the `## Instructions` section is concise and actionable.
   ```

4. Run `harness validate`.

5. Commit: `docs(skill-authoring): update skill.yaml template and quality checklist for knowledge skill fields`

---

### Task 9: Final validation and regression confirmation

[checkpoint:human-verify]

**Depends on:** Tasks 1–8
**Files:** none (validation only)

1. Run `harness validate` from project root:

   ```bash
   harness validate
   ```

   Expected: `v validation passed`

2. Run the full dispatcher and schema test suites:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/cli
   npx vitest run tests/skill/dispatcher.test.ts tests/skill/schema.test.ts tests/skill/index-builder.test.ts
   ```

   Expected: all tests pass. Confirm the count matches pre-backfill (53 dispatcher tests, plus any new tests added in Task 6).

3. Run a spot-check to verify behavioral skill dispatch score stability. Verify that a skill without paths (e.g., `harness-planning`) has `paths: []` and that the schema accepts it:

   ```bash
   grep -A2 '^paths:' /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/harness-planning/skill.yaml
   ```

   Expected: no output (field not present — this is fine, `paths` defaults to `[]`).

4. Verify that `harness-containerization` now has a paths field:

   ```bash
   grep -A5 '^paths:' /Users/cwarner/Projects/harness-engineering/agents/skills/claude-code/harness-containerization/skill.yaml
   ```

   Expected: outputs the 4 Dockerfile/docker-compose paths.

5. [checkpoint:human-verify] — Confirm all checks pass. If any fail, investigate and fix before marking Phase D complete.

6. No additional commit needed — this is a verification task. If harness validate or tests fail, return to the relevant task to fix.

---

## Dependency Graph

```
Task 1 (infra paths) ──┐
Task 2 (db/e2e paths) ──┤
Task 3 (db/api related_skills) ──┤──→ Task 6 (regression test) ──→ Task 9 (final validation)
Task 4 (resilience/etc related) ──┤
Task 5 (validation/mobile etc) ──┘

Task 7 (skill-authoring Phase 2B) ──→ Task 8 (template + checklist update) ──→ Task 9
```

Tasks 1–5 and Tasks 7–8 are independent and can run in parallel.

## Success Criteria Traceability

| Observable Truth                                | Task(s)                                      |
| ----------------------------------------------- | -------------------------------------------- |
| `harness validate` passes                       | Task 9 (spot-checks all prior tasks)         |
| 53 dispatcher tests pass                        | Task 6, Task 9                               |
| 8 skills have file-type-specific paths          | Tasks 1, 2                                   |
| 15 skills have related_skills                   | Tasks 3, 4, 5                                |
| 58 skills retain `paths: []`                    | Backfill Decision Log + Task 9 verification  |
| harness-skill-authoring covers knowledge format | Tasks 7, 8                                   |
| Backfill decision log committed                 | This plan document (committed with the plan) |
