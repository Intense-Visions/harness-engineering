# Initialize Harness Project

> Scaffold a new harness-compliant project or migrate an existing project to the next adoption level. Assess current state, configure personas, generate AGENTS.md, and validate the result.

## When to Use

- Starting a brand new project that should be harness-managed from day one
- Migrating an existing project to harness for the first time
- Upgrading an existing harness project from one adoption level to the next (basic to intermediate, intermediate to advanced)
- When `on_project_init` triggers fire
- NOT when the project is already at the desired adoption level (use harness-onboarding to orient instead)
- NOT when adding a single component to an existing harness project (use add-harness-component)
- NOT when the project has no clear owner or maintainer — harness setup requires someone to own the constraints

## Process

### Phase 1: ASSESS — Determine Current State

1. **Check for existing harness configuration.** Look for `.harness/` directory, `AGENTS.md`, `harness.config.json`, and any skill definitions. Their presence determines whether this is a new project or a migration.

2. **For new projects:** Gather project context — language, framework, test runner, build tool. Ask the human if any of these are undecided. Do not assume defaults.

2b. **For existing projects with detectable frameworks:** Run `harness init` without flags first. The command auto-detects frameworks (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React+Vite, Vue, Express, NestJS) by scanning project files. Present the detection result to the human and ask for confirmation before proceeding. If detection fails, ask the human to specify `--framework` manually.

3. **For existing projects:** Run `harness validate` to see what is already configured and what is missing. Read `AGENTS.md` if it exists. Identify the current adoption level:
   - **Basic:** Has `AGENTS.md` and `harness.config.json` with project metadata. No layers, no skills, no dependency constraints.
   - **Intermediate:** Has layers defined, dependency constraints between layers, at least one custom skill. `harness check-deps` runs and passes.
   - **Advanced:** Has full persona configuration, custom skills for the team's workflows, state management, learnings capture, and CI integration for `harness validate`.

4. **Recommend the target adoption level.** For new projects, start with basic unless the team has harness experience. For existing projects, recommend one level up from current. Present the recommendation and wait for confirmation.

5. **Classify the project shape.** Before scaffolding, decide whether this is a **product/service** or a **test-suite project**. Test-suite projects follow a different layer model and need additional configuration in Phase 3. Check for these signals:
   - Repo or package name matches `*test*`, `*-e2e*`, `*-qa*`, `*-automation*`
   - `package.json` has `@playwright/test`, `cypress`, `webdriverio`, `mocha`, or `testcafe` as a direct dep (frameworks that are *only* test-related — presence of `vitest`/`jest` alone is not enough)
   - Top-level `tests/`, `e2e/`, `specs/`, or `playwright/` directories are the primary source tree, not an adjunct to `src/`
   - Config files like `playwright.config.*`, `cypress.config.*`, `wdio.conf.*`
   - No production runtime — build output is consumed only by other test repos (shared test library)
   
   If it is a test suite, classify the archetype and record it in the assessment:
   - **API test suite** — exercises HTTP APIs end-to-end (e.g. Playwright API tests)
   - **E2E / UI suite** — browser-driven tests (Playwright, Cypress, WebdriverIO)
   - **Shared test library** — API clients, Page Object Models, fixtures, or test users consumed by the above; no tests in-repo

### Phase 2: SCAFFOLD — Generate Project Structure

1. **Run `harness init` with the appropriate flags:**
   - New basic JS/TS project: `harness init --level basic`
   - With framework: `harness init --level basic --framework <framework>`
   - Non-JS language: `harness init --language <python|go|rust|java>`
   - Non-JS with framework: `harness init --framework <fastapi|django|gin|axum|spring-boot>`
   - Existing project (auto-detect): `harness init` (no flags -- auto-detection runs)
   - Migration to intermediate: `harness init --level intermediate --migrate`
   - Migration to advanced: `harness init --level advanced --migrate`

   **Supported frameworks:** nextjs, react-vite, vue, express, nestjs, fastapi, django, gin, axum, spring-boot
   **Supported languages:** typescript, python, go, rust, java

2. **Review generated files.** `harness init` creates:
   - `harness.config.json` — Project configuration (name, stack, adoption level)
   - `.harness/` directory — State and learnings storage
   - `AGENTS.md` — Agent instructions (template, needs customization)
   - Layer definitions (intermediate and above)
   - Dependency constraints (intermediate and above)

3. **Do not blindly accept generated content.** Read the generated `AGENTS.md` and `harness.config.json`. Flag anything that looks wrong or incomplete. The scaffolded output is a starting point, not a finished product.

### Phase 3: CONFIGURE — Customize for the Project

1. **Configure personas.** Run `harness persona generate` to create persona definitions based on the project's stack and team structure. Personas define how agents should behave in this project — coding style, communication preferences, constraint strictness.

2. **Customize AGENTS.md.** The generated template needs project-specific content:
   - Project description and purpose
   - Architecture overview (components, layers, data flow)
   - Key conventions the team follows
   - Known constraints and forbidden patterns
   - Links to relevant documentation

3. **For intermediate and above:** Define layer boundaries. Which modules belong to which layers? What are the allowed import directions? Document these in `harness.config.json` and ensure they match the actual codebase structure.

4. **For advanced:** Configure state management (`.harness/state.json` schema), learnings capture (`.harness/learnings.md` conventions), and CI integration hooks.

5. **Configure i18n (all levels).** Ask: "Will this project support multiple languages?" Based on the answer:
   - **Yes:** Invoke `harness-i18n-workflow` configure phase to set up i18n config in `harness.config.json` (source locale, target locales, framework, strictness). Then invoke `harness-i18n-workflow` scaffold phase to create translation file structure and extraction config. Set `i18n.enabled: true`.
   - **No:** Set `i18n.enabled: false` in `harness.config.json`. The `harness-i18n-process` skill will still fire gentle prompts for unconfigured projects when features touch user-facing strings.
   - **Not sure yet:** Skip i18n configuration entirely. Do not set `i18n.enabled`. The project can enable i18n later by running `harness-i18n-workflow` directly.

6. **Test-suite configuration (only if classified as a test suite in Phase 1, step 5).** Apply these before running `harness validate`. Skip this entire section for product/service projects.

   a. **Decide: scaffold API clients or POMs in-repo, or consume a shared library?** For API and E2E/UI suites, check whether a shared library already exists (e.g. `@capillary/optum-testing-api-library` for API clients, an equivalent for Page Object Models). If one exists, consuming it is strongly preferred — one client implementation shared by all test suites is the source of truth for request/response shapes and avoids drift. Only scaffold an in-repo `src/api/` or `src/page-objects/` tree if no shared library exists or the suite has a genuinely different contract.
   
   Record the decision in AGENTS.md. This choice determines which layer model to apply in step 6b.

   a2. **Pick a domain layout.** Independent of whether clients are in-repo or imported, domains still drive the folder layout:
   - **Self-contained suite:** one folder per API domain, feature area, or user flow under `src/api/` or `src/page-objects/`, each exposing a manager/client class (API suites) or a Page Object Model (UI suites) that takes an HTTP client or browser context in its constructor. A single composition module wires everything together.
   - **Shared-library consumer:** no per-domain folders in `src/`. Instead, a thin `config/` adapter wraps the shared library's entry point (e.g. exposes `{api, user}` on the Playwright test fixture). Tests are still organized by domain — see step 6i — but the domain folders live under `tests/<domain>/`, not `src/api/<domain>/`.
   
   Document the chosen layout in AGENTS.md with a directory tree.

   b. **Define the layer model.** Two variants — pick the one matching step 6a.

   **Variant A — self-contained test suite.** Record in `harness.config.json`:
      - `utils` → helpers, date/string/id utilities (no internal deps)
      - `composition` → single wiring module (e.g. `managers.ts`) → allowed to import every layer below
      - `common` → shared DTOs, enums, error types → `utils`
      - `config` → HTTP client, auth service, environment loader → `utils`, `common`
      - `api` / `domains` / `page-objects` → per-domain managers or POMs → `utils`, `common`, `config`
      - `fixtures` → deterministic seed data, factories, builders → `utils`, `common`, `config`
      - `specs` → top layer; imports composition + fixtures; nothing imports specs
      
      Forbid (same-layer rules, enforced via `forbiddenImports`):
      - A domain/POM importing a sibling domain/POM (domains are peers, not hierarchical)
      - `fixtures` importing specs
      - Specs importing each other (tests must be independently runnable in any order)

   **Variant B — shared-library consumer.** No `common`, no `api` layer — those live in the shared library. Record in `harness.config.json`:
      - `utils` → helpers with no internal deps
      - `config` → thin adapter wrapping the shared library (e.g. builds the `Managers` from the shared lib + current env), token handler, constants → `utils`
      - `fixtures` → Playwright test fixtures that expose `{api, user, ...}` to specs → `utils`, `config`
      - `specs` → top layer; imports `fixtures` → `utils`, `config`, `fixtures`
      
      Forbid:
      - Specs bypassing `fixtures` and instantiating the shared library directly — always go through the fixture so auth, base URL, and teardown are consistent
      - `fixtures` importing specs
      - Any layer importing the shared library from outside `config` (forces single adapter point, keeps upgrades localized)
      
      **Layer-ordering gotcha — `harness check-deps` and `@harness-engineering/eslint-plugin` both use first-match-wins layer resolution.** Put more-specific patterns *before* more-general ones in the `layers` array. For a test suite, `composition` (pattern `src/config/managers.ts`) must come before `config` (pattern `src/config/**`), otherwise `managers.ts` is classified as `config` and every `api` import becomes a layer violation. Do not rely on per-layer `excludePatterns` — the CLI and the ESLint plugin both drop that field.
      
      **`forbiddenImports` gotcha — no `exceptPaths` support.** The ESLint plugin schema for `forbiddenImports` only accepts `from`, `disallow`, `message` — any other keys (including `exceptPaths`) are silently stripped. Do not write `from: src/config/**, disallow: [src/api/**], exceptPaths: [src/config/managers.ts]` and expect it to work. Use layer ordering (above) to carve out the composition file; reserve `forbiddenImports` for same-layer rules like sibling-domain isolation that the layer graph cannot express.

   b2. **Wire up the ESLint flat config so the forbidden-imports rule actually runs.** `harness init` scaffolds `eslint.config.mjs` that spreads `harnessPlugin.configs.recommended` but does not declare a `files:` glob or a TypeScript parser. Under ESLint 9 flat config this means every `.ts` file is ignored and the rule never fires. Replace the scaffolded config with an explicit block: `files: ['src/**/*.ts', 'tests/**/*.ts']`, `languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } }`, `plugins: { '@harness-engineering': harnessPlugin }`, and the three `'error'` rules (`no-layer-violation`, `no-forbidden-imports`, `no-circular-deps`). Add `@typescript-eslint/parser` to devDependencies. Verify by running `npx eslint 'src/**/*.ts'` and seeing it actually report errors on a deliberately bad file.

   c. **Pick the test framework(s) and delegate detailed setup to the right skill.** Do not configure the framework here — just record the choice in AGENTS.md and point the human at the follow-up skill:
      - Playwright (API or E2E) → `test-playwright-setup` then `test-playwright-patterns`
      - Vitest → `test-vitest-config`
      - Contract tests → `api-contract-testing` and `test-contract-testing`
      - Mocking (MSW, route interception) → `test-msw-pattern`, `test-mock-patterns`
      - Fixtures / factories → `test-factory-patterns`, `harness-test-data`
      - For shared libraries that are *consumed* by tests but contain none themselves, skip framework setup entirely — record this in AGENTS.md under "Gotchas" so agents do not try to add Vitest later.

   d. **Environment and secret handling.** Require a committed `.env.example` listing every variable the suite reads (API base URLs, OAuth client IDs, registry tokens, feature flags). Actual `.env*` files must be gitignored. For multi-environment suites, encode environments as `.env.dev`, `.env.stage`, `.env.prod` and document in AGENTS.md how the runner selects one (env var, CLI flag, or config). Never commit real credentials even as examples — use placeholders like `REPLACE_ME`.

   e. **Authentication abstraction.** Record in AGENTS.md: token source (OAuth client-credentials, CIAM, basic auth, session cookie), caching strategy (in-memory, file, Redis), and how test users or parent/child scopes are resolved. If a shared test-user library exists (e.g. `optum-testing-user-library`), link it and forbid inlining user credentials in specs.

   f. **Schema / contract validation.** Decide whether request and response DTOs are validated at runtime (zod, ajv, io-ts) or only compile-time. Intermediate and above should validate at runtime for contract-drift detection. If adopting zod, reference `zod-schema-definition`.

   g. **Fixtures and test-data isolation.** Document the per-test isolation strategy in AGENTS.md: unique IDs per run (UUID suffixes, timestamps), teardown hooks, no shared mutable state between specs. Forbid hard-coded production record IDs in fixtures.

   h. **Mocking support (shared libraries and API clients).** If the project will be consumed by FE or UI test suites that need to mock upstream responses, expose mock response builders (e.g. `buildMockResponse`, `buildMockErrorResponse`) and document the override API in AGENTS.md so consumer projects know the contract.

   i. **Test organization: tags over folders.** Do *not* split specs into `tests/smoke/`, `tests/regression/`, etc. Organize specs by domain / feature area (`tests/<domain>/<feature>.spec.ts`) and filter run shape with tags. This matches how Playwright (and most modern runners) expect grep-based filtering to work, and avoids moving a spec file whenever its coverage tier changes.
   
   Record the tag taxonomy in AGENTS.md. Baseline for an API suite modeled on `optum-testing-api`:
   - `@smoke` — fast subset; PR gate. Applied per-test or per-describe.
   - Untagged = regression. "Full suite" is just `playwright test` with no grep.
   - **Quarantine tags (never run):** `@known-failure`, `@wip`, `@blocked`, `@archived`. Exclude these globally via `grepInvert` in `playwright.config.ts`:
     ```ts
     grepInvert: [/@known-failure/, /@wip/, /@blocked/, /@archived/],
     ```
   
   Filter commands (bake into `package.json` scripts, not ad-hoc CI yaml):
   - `npm run smoke` → `playwright test --grep @smoke`
   - `npm run exhaustive` → `playwright test` (full regression, quarantine excluded)
   - `npm run list` → `playwright test --list` (sanity check after tag edits)

   **Reporters.** Configure `playwright.config.ts` with the stack that feeds both human and machine consumers:
   ```ts
   reporter: [
       ['html', {outputFolder: './test-results/html-test-results', open: 'never'}],
       ['list'],
       ['github'],
       ['json', {outputFile: 'test-results/json-results/results.json'}],
   ],
   ```
   The `json` reporter is the input to the custom report in step 6i.1. The `github` reporter produces annotations on PRs; `list` is for local stdout; `html` is for deep-dive failure triage.

   i.1. **Custom report (enriched HTML + Slack + history).** Playwright's stock HTML report is fine for a single run but does not track trends, categorize failures, or know which tests are quarantined. Scaffold a `scripts/generate-reports.ts` that reads the JSON reporter output (`test-results/json-results/results.json`) and emits an enriched report. Modeled on `optum-testing-api/scripts/generate-reports.ts`, it should produce:
   - **Failure categorization:** bucket each failure into one of `schema | auth | server | client | timeout | network | other` based on the error message. Surfaces whether a red run is an API regression (schema) vs. infrastructure (timeout/network) vs. test-data problem (auth).
   - **Per-area health:** group by domain folder (first path segment under `tests/`), report pass rate and failing titles per area. Tells you which surface of the product is drifting.
   - **Delta vs history:** append each run to a JSONL ledger keyed by commit. Report new failures since last run and failures since last green — not just "X failed" but "X started failing at commit Y."
   - **Quarantine ledger:** scan for `@known-failure`-tagged tests, track age since first seen in a JSON ledger, flag tests quarantined longer than 14 days.
   - **Slack summary:** short markdown block with pass rate, new failures, and a link to the HTML report. Optional but cheap once the categorization exists.
   - **Environment + git context:** node version, base URL, commit SHA, branch, commit message — so a report opened later tells you where and when it ran.
   
   Wire the script into `package.json`:
   ```json
   {
     "scripts": {
       "generate-custom-reports": "npx ts-node scripts/generate-reports.ts",
       "show-custom-report": "open test-results/reports/test-report.html"
     }
   }
   ```
   Do not block CI on the custom report — run it as a post-step and upload the output as an artifact. If categorization throws on an unexpected error shape, the exit code should be non-fatal.

   j. **CI integration.** For intermediate+: PR pipeline runs `npm run smoke` (tag-filtered, not folder-filtered); main merges trigger `npm run exhaustive`; nightly runs `npm run exhaustive` plus a quarantine audit (step i.1) reporting quarantined-too-long tests. Record the flake policy (max retries, quarantine threshold) in `harness.config.json` so agents do not silently raise retries to hide flakes.

### Phase 4: VALIDATE — Confirm Everything Works

1. **Run `harness validate`** to verify the full configuration. This checks:
   - `harness.config.json` schema validity
   - `AGENTS.md` presence and required sections
   - Layer definitions (if intermediate+)
   - Dependency constraints (if intermediate+)
   - Persona configuration (if configured)

2. **Fix any validation errors before finishing.** Do not leave the project in a half-configured state.

3. **Run `harness check-deps`** (intermediate and above) to verify dependency constraints match the actual codebase. If there are violations, decide with the human: update the constraints or fix the code.

3b. **For test suites — prove the guards actually fire.** `harness validate` and `harness check-deps` passing on a clean tree is necessary but not sufficient; they can pass while the rules are silently misconfigured (layer ordering wrong, ESLint files glob missing, forbidden-imports schema fields dropped). Before finishing:
   - Insert one deliberate forbidden import (a sibling-domain import is the easiest — e.g. `src/api/users/users-manager.ts` importing `../auth/auth-manager`) and confirm `npx eslint <file>` reports it.
   - Insert one deliberate cross-layer import (e.g. `src/utils/foo.ts` importing from `src/api/users/`) and confirm `harness check-deps` reports it.
   - Revert both edits and confirm the clean tree is green on `harness validate`, `harness check-deps`, and `npx eslint 'src/**/*.ts' 'tests/**/*.ts'`.

### Build the Initial Knowledge Graph

If the project will use graph-based queries, build the initial knowledge graph now:

```
harness scan [path]
```

This creates the `.harness/graph/` directory and populates it with the project's dependency and relationship data. Subsequent graph queries (impact analysis, dependency health, test advisor) depend on this initial scan.

4. **Mention roadmap.** After validation passes, inform the user: "When you are ready to set up a project roadmap, run `/harness:roadmap --create`. This creates a unified `docs/roadmap.md` that tracks features, milestones, and status across your specs and plans." This is informational only — do not create the roadmap automatically.

5. **Commit the initialization.** All generated and configured files in a single commit.

## Harness Integration

- **`harness init --level <level> [--framework <framework>] [--language <language>]`** — Scaffold a new project. `--framework` infers language automatically. `--language` without `--framework` gives a bare language scaffold. Running without flags on an existing project directory triggers auto-detection.
- **`harness init --level <level> --migrate`** — Migrate an existing project to the next adoption level, preserving existing configuration.
- **`harness persona generate`** — Generate persona definitions based on project stack and team structure.
- **`harness validate`** — Verify the full project configuration is valid and complete.
- **`harness check-deps`** — Verify dependency constraints match the actual codebase (intermediate and above).
- **`harness-i18n-workflow configure` + `harness-i18n-workflow scaffold`** — Invoked during Phase 3 if the project will support multiple languages. Sets up i18n configuration and translation file structure.
- **Roadmap nudge** — After successful initialization, inform the user about `/harness:roadmap --create` for setting up project-level feature tracking. Informational only; does not create the roadmap.

## Success Criteria

- `harness.config.json` exists and passes schema validation
- `AGENTS.md` exists with project-specific content (not just the template)
- `.harness/` directory exists with appropriate state files
- `harness validate` passes with zero errors
- `harness check-deps` passes (intermediate and above)
- Personas are configured if the project uses them
- The adoption level matches what was agreed upon with the human
- All generated files are committed in a single atomic commit
- i18n configuration is set if the human chose to enable it during init
- For test suites: layer model matches the chosen variant (A self-contained or B shared-library consumer) from step 6b; `.env.example` is present with `REPLACE_ME` placeholders; no real secrets are committed; test framework and tag taxonomy (including `@smoke` + quarantine tags) are recorded in AGENTS.md; specs are organized `tests/<domain>/<feature>.spec.ts` with tag-based filtering (no `tests/smoke/`, `tests/regression/` folders); `playwright.config.ts` declares html + list + github + json reporters and `grepInvert` for quarantine tags; `scripts/generate-reports.ts` exists and is wired to `npm run generate-custom-reports`

## Rationalizations to Reject

| Rationalization                                                          | Why It Is Wrong                                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| "The generated AGENTS.md template looks fine -- no need to customize it" | Phase 3 says do not blindly accept generated content. Without project-specific descriptions, agents receive generic instructions.      |
| "We should start at the advanced level since we want full coverage"      | The skill recommends basic for new projects. Each level builds on the previous. Jumping to advanced creates misconfigured rules.       |
| "I will skip the i18n question to keep setup fast"                       | Phase 3 requires asking about i18n and recording the decision. Skipping creates ambiguity about whether the omission was intentional.  |
| "Validation passed, so the project is ready"                             | Phase 4 includes harness check-deps for intermediate+ projects and knowledge graph initialization. Validation alone is not sufficient. |
| "This is a test suite, so strict layer constraints are overkill"         | Test suites benefit *more* from layer constraints than product code — peer-domain imports and spec coupling are the top sources of flaky, hard-to-maintain suites. Apply Phase 3 step 6. |
| "We can commit a real `.env` for convenience, CI will ignore it"         | Phase 3 step 6d forbids committing real credentials. A leaked `.env` in a test repo leaks the same secrets as a product repo. Use `.env.example` with placeholders. |
| "Tests don't need tags — we'll run everything every time"                | Without a `@smoke` tag the PR pipeline grows to 30+ minutes and drives developers to skip CI. Record a tag taxonomy in Phase 3 step 6i even if enforcement comes later. |
| "We'll split specs into `tests/smoke/` and `tests/regression/` for filtering" | Folder-based filtering forces a file move every time a spec's tier changes. Modern runners (Playwright, Vitest, Cypress) expect `--grep @tag`. Keep `tests/<domain>/<feature>.spec.ts` flat and tag per-test. See Phase 3 step 6i. |
| "We'll add schema validation later once the client stabilizes"           | Runtime DTO validation is the primary contract-drift detector for API test suites. Adding it after tests exist means updating every spec. Decide in Phase 3 step 6f. |
| "We'll copy the API client code into this test suite for convenience"    | If a shared API client library already exists, consume it — do not fork. Forked clients drift immediately; the shared library is the contract source of truth. Only scaffold in-repo clients if no shared library exists. See Phase 3 step 6a. |
| "Playwright's built-in HTML report is enough"                            | The built-in report shows a single run. It does not categorize failures (schema vs auth vs timeout), does not track regressions by commit, and does not surface tests quarantined for weeks. Scaffold `scripts/generate-reports.ts` per Phase 3 step 6i.1. |

## Examples

### Example: New TypeScript Project (Basic Level)

**ASSESS:**

```
Human: "I'm starting a new TypeScript API project using Express and Vitest."
Check for .harness/ — not found. This is a new project.
Recommend: basic level (new project, start simple).
Human confirms: "Basic is fine for now."
```

**SCAFFOLD:**

```bash
harness init --level basic --framework express
# Creates: harness.config.json, .harness/, AGENTS.md (template)
```

**CONFIGURE:**

```
Edit AGENTS.md:
  - Add project description: "REST API for widget management"
  - Add stack: TypeScript, Express, Vitest, PostgreSQL
  - Add conventions: "Use zod for validation, repository pattern for data access"
  - Add constraints: "No direct SQL queries outside repository layer"
  - Ask: "Will this project support multiple languages?"
  - Human: "Yes, Spanish and French."
  - Run harness-i18n-workflow configure (source: en, targets: es, fr)
  - Run harness-i18n-workflow scaffold (creates locales/ directory structure)
```

**VALIDATE:**

```bash
harness validate  # Pass — basic level checks satisfied
git add harness.config.json .harness/ AGENTS.md
git commit -m "feat: initialize harness project at basic level"
```

### Example: Migrating Existing Project from Basic to Intermediate

**ASSESS:**

```
Read harness.config.json — level: basic
Read AGENTS.md — exists, has project-specific content
Run: harness validate — passes at basic level
Recommend: intermediate (add layers and dependency constraints)
Human confirms: "Yes, we're ready for layers."
```

**SCAFFOLD:**

```bash
harness init --level intermediate --migrate
# Preserves existing harness.config.json and AGENTS.md
# Adds: layer definitions template, dependency constraints template
```

**CONFIGURE:**

```
Define layers in harness.config.json:
  - presentation: src/routes/, src/middleware/
  - business: src/services/, src/models/
  - data: src/repositories/, src/db/

Define constraints:
  - presentation → business (allowed)
  - business → data (allowed)
  - data → presentation (forbidden)
  - presentation → data (forbidden — must go through business)

Update AGENTS.md with layer documentation.
```

**VALIDATE:**

```bash
harness validate      # Pass — intermediate level checks satisfied
harness check-deps    # Pass — no constraint violations in existing code
git add -A
git commit -m "feat: migrate harness project to intermediate level with layers"
```

### Example: Initializing a Shared API Test Library (Intermediate)

**ASSESS:**

```
Human: "New repo. It's a shared TypeScript HTTP client for our API test suites — consumed by Playwright API tests and also used to mock responses in FE tests. No tests live in this repo."
Check for .harness/ — not found. New project.
package.json has no Playwright/Vitest as direct deps (shared library, not a test runner).
Classification: shared test library — archetype "Shared test library".
Recommend: intermediate (layer constraints pay off immediately for domain-based API clients).
Human confirms.
```

**SCAFFOLD:**

```bash
harness init --level intermediate --language typescript
```

**CONFIGURE (test-suite specific, Phase 3 step 6):**

```text
Domain layout: one folder per API domain under src/api/ (challenges, rewards,
  user, oauth, ...). Each domain exposes <domain>-manager.ts taking HttpClient
  in its constructor. Single composition module src/config/managers.ts wires
  every domain from one HttpClient.

Layer model (harness.config.json):
  utils       → src/utils/**                         (no internal deps)
  common      → src/api/common/**                    → utils
  config      → src/config/**  (except managers.ts)  → utils, common
  api         → src/api/**     (except common)       → utils, common, config
  composition → src/config/managers.ts               → utils, common, config, api

Forbidden:
  - any src/api/<domain> importing a sibling src/api/<domain>
  - src/config/* (other than managers.ts) importing any src/api/<domain>
  - src/api/common importing config or sibling domains
  - src/utils importing config or api

Framework: none in-repo (shared library). Gotcha recorded in AGENTS.md so
  future agents don't scaffold Vitest.

Env: .env.example committed with GITHUB_ACCESS_TOKEN placeholder (registry
  auth only). No runtime env vars — consumers pass config explicitly.

Auth: OAuth client-credentials with pluggable TokenStorage interface; parent
  vs child scope resolution documented in docs/auth-flow.md. Link to
  optum-testing-user-library for test-user data.

Schema validation: zod at runtime for all response DTOs. Reference
  zod-schema-definition skill for future domain additions.

Mocking: expose buildMockResponse / buildMockSuccessResponse /
  buildMockErrorResponse from src/config/mock-response.ts so FE test repos
  can override per spec. Document override contract in docs/mock-response.md.
```

**VALIDATE:**

```bash
harness validate     # Pass
harness check-deps   # Pass — no sibling-domain violations
harness scan         # Builds .harness/graph/
git commit -m "feat: initialize harness project at intermediate level for shared API test library"
```

### Example: Playwright API Test Suite Consuming a Shared Library (Intermediate)

**ASSESS:**

```
Human: "New repo. Playwright API tests for our healthcare service. A shared API client library already exists at @capillary/optum-testing-api-library and a shared test-user library at @capillary/optum-testing-user-library."
Classification: API test suite — archetype "API test suite".
Shared library exists → Phase 3 step 6a: consume it, do NOT scaffold src/api/.
Recommend: intermediate. Human confirms.
```

**SCAFFOLD:**

```bash
harness init --level intermediate --language typescript
# Scaffolded output is a starting point — replace generic layers and eslint config.
```

**CONFIGURE (Variant B — shared-library consumer):**

```text
Dependencies: @capillary/optum-testing-api-library, @capillary/optum-testing-user-library,
  @playwright/test, dotenv, zod.

Directory layout (no src/api/, no src/page-objects/):
  config/
    api-adapter.ts       # Builds Managers from the shared library + env vars
    api-client.ts        # Fetcher wrapping Playwright's APIRequestContext
    token-handler.ts     # OAuth + test-user token resolution
    constants.ts         # TEST_ARTIFACTS_DIR, URLs, etc.
  fixtures/
    test-fixture.ts              # Playwright fixture exposing {api, user}
    test-no-init-auth-fixture.ts # Fixture for 401/auth-failure tests
    expects.ts                   # expectOkResponse, expectUnauthorized, ...
  tests/
    challenges/
      create.spec.ts
      checkin.spec.ts
      ...
    oauth/
      login.spec.ts
    user-profile/
      ...
    global.setup.ts
    global.teardown.ts
  scripts/
    generate-reports.ts
  playwright.config.ts
  .env.example
  harness.config.json
  AGENTS.md

Layer model (harness.config.json):
  utils       → src/utils/**        (no internal deps)
  config      → config/**           → utils
  fixtures    → fixtures/**         → utils, config
  specs       → tests/**            → utils, config, fixtures

Forbidden (same-layer or cross-cutting):
  - tests/** importing @capillary/optum-testing-api-library directly
    (must go through fixtures → config adapter)
  - fixtures/** importing tests/**
  - Specs importing each other

Tags (playwright.config.ts):
  grepInvert: [/@known-failure/, /@wip/, /@blocked/, /@archived/]
  Tag @smoke on PR-gate specs; untagged = regression.

Reporters (playwright.config.ts):
  ['html', {outputFolder: './test-results/html-test-results', open: 'never'}],
  ['list'],
  ['github'],
  ['json', {outputFile: 'test-results/json-results/results.json'}],

Custom report (scripts/generate-reports.ts):
  Reads test-results/json-results/results.json. Emits HTML + Slack with:
  failure categorization, per-area health, delta vs history, quarantine ledger.
  Wired to `npm run generate-custom-reports` / `npm run show-custom-report`.

package.json scripts:
  smoke:                     playwright test --grep @smoke
  exhaustive:                playwright test
  list:                      playwright test --list
  generate-custom-reports:   npx ts-node scripts/generate-reports.ts
  show-custom-report:        open test-results/reports/test-report.html

.env.example: API_BASE_URL, OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
  TEST_USER_POOL_URL, TEST_USER_POOL_TOKEN. Real .env is gitignored.
```

**VALIDATE:**

```bash
harness validate     # Pass
harness check-deps   # Pass
npm run lint         # Pass
npm run smoke        # Sanity: runs only @smoke-tagged specs

# Prove the forbidden-imports rule fires:
# temporarily add an import of @capillary/optum-testing-api-library to a spec
npx eslint tests/challenges/create.spec.ts  # Should report violation
# revert, confirm green

git commit -m "feat: initialize harness project at intermediate level for Playwright API suite"
```

### Example: Adoption Level Progression

**Basic (start here):**

- `AGENTS.md` with project context
- `harness.config.json` with metadata
- `harness validate` runs in development

**Intermediate (add structure):**

- Layer definitions and boundaries
- Dependency constraints enforced by `harness check-deps`
- At least one custom skill for team workflows

**Advanced (full integration):**

- Persona configuration for consistent agent behavior
- State management across sessions
- `.harness/learnings.md` capturing institutional knowledge
- `harness validate` runs in CI pipeline
- Custom skills for all common team workflows
