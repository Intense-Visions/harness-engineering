# Initialize Test Suite Project

> Scaffold or migrate a test-suite project — API, E2E/UI, or shared test library. Owns test-suite-specific archetype selection, shared-library vs in-repo scaffolding decision, layer variants, tag taxonomy, reporter stack, and custom report. Cross-cutting concerns (adoption level, personas, AGENTS.md base template, i18n, knowledge graph, roadmap nudge, final commit) delegate to `initialize-harness-project`.

## When to Use

- Initializing a new test-suite project (you already know it is a test suite)
- Migrating an existing test-suite project to the next adoption level
- When `initialize-harness-project`'s Phase 1 classification step hands off here
- NOT when the project is a product or service (use `initialize-harness-project`)
- NOT when adding a single spec, domain, or fixture to an already-configured test suite (use `add-harness-component`)

## Composition with `initialize-harness-project`

This skill owns only the *test-suite-specific* pieces. The generic harness flow belongs to the parent skill. Two invocation patterns:

1. **Parent dispatches here.** The user runs `initialize-harness-project`; its Phase 1 step 5 classifies the project as a test suite and dispatches to this skill. Run the parent's Phase 2 (scaffolding) first, then this skill's full flow, then return to the parent for Phase 4 wrap-up (knowledge graph, roadmap, commit).

2. **Direct invocation.** The user knows up front it's a test suite and invokes this skill directly. Run the parent's Phase 1 (assess state), Phase 2 (`harness init`), and Phase 3 steps 1–2 and 5 (personas, AGENTS.md base, i18n) inline or by invoking the parent explicitly, then apply this skill's Phase 1–4, then hand back to the parent's Phase 4 steps 4–5.

Either way, what this skill owns: archetype selection, shared-library vs scaffold decision, layer-model variants A/B, ESLint flat-config fix, test-framework delegation, env and secrets, auth abstraction, schema validation, fixtures isolation, mocking support, tag-driven organization, reporters, the custom report, CI integration, and "prove the guards fire" verification.

## Process

### Phase 1: CLASSIFY — Pick the Archetype

Before scaffolding, classify the project and record in the assessment.

**Test-suite signals** (at least one must apply — re-check even if dispatched from the parent):

- Repo or package name matches `*test*`, `*-e2e*`, `*-qa*`, `*-automation*`
- `package.json` has `@playwright/test`, `cypress`, `webdriverio`, `mocha`, or `testcafe` as a direct dep (frameworks that are *only* test-related — presence of `vitest`/`jest` alone is not enough)
- Top-level `tests/`, `e2e/`, `specs/`, or `playwright/` directories are the primary source tree, not an adjunct to `src/`
- Config files like `playwright.config.*`, `cypress.config.*`, `wdio.conf.*`
- No production runtime — build output is consumed only by other test repos (shared library)

**Archetypes:**

- **API test suite** — exercises HTTP APIs end-to-end (e.g. Playwright API tests)
- **E2E / UI suite** — browser-driven tests (Playwright, Cypress, WebdriverIO)
- **Shared test library** — API clients, Page Object Models, fixtures, or test users consumed by the above; no tests in-repo

### Phase 2: DECIDE — Shared Library or Scaffold In-Repo?

For **API** and **E2E/UI** suites, check whether a shared library already exists — typically a team-specific `@capillary/<team>-testing-api-library` for API clients, or an equivalent for Page Object Models. If one exists, consuming it is strongly preferred: one client implementation shared by all test suites is the contract source of truth and avoids drift. Only scaffold an in-repo `src/api/` or `src/page-objects/` tree if no shared library exists or the suite has a genuinely different contract.

For **Shared test library** archetypes, this phase is trivial — you *are* the shared library; scaffold in-repo.

Record the decision in AGENTS.md. It determines which layer-model variant applies in Phase 3 step 2.

### Phase 3: CONFIGURE — Test-Suite Shape

Apply these steps before running validation. Record decisions in AGENTS.md as you go.

1. **Pick a domain layout.** Independent of whether clients are in-repo or imported, domains drive the folder layout:
   - **Self-contained suite:** one folder per API domain, feature area, or user flow under `src/api/` or `src/page-objects/`, each exposing a manager/client class (API suites) or Page Object Model (UI suites) that takes an HTTP client or browser context in its constructor. A single composition module wires everything together.
   - **Shared-library consumer:** no per-domain folders in `src/`. Instead, a thin `config/` adapter wraps the shared library's entry point (e.g. exposes `{api, user}` on the Playwright test fixture). Tests are still organized by domain — see step 10 — but the domain folders live under `tests/<domain>/`, not `src/api/<domain>/`.
   
   Document the chosen layout in AGENTS.md with a directory tree.

2. **Define the layer model.** Two variants — pick the one matching Phase 2.

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
   
   **Layer-ordering gotcha — `harness check-deps` and `@harness-engineering/eslint-plugin` both use first-match-wins layer resolution.** Put more-specific patterns *before* more-general ones in the `layers` array. For Variant A, `composition` (pattern `src/config/managers.ts`) must come before `config` (pattern `src/config/**`), otherwise `managers.ts` is classified as `config` and every `api` import becomes a layer violation. Do not rely on per-layer `excludePatterns` — the CLI and the ESLint plugin both drop that field.
   
   **`forbiddenImports` gotcha — no `exceptPaths` support.** The ESLint plugin schema for `forbiddenImports` only accepts `from`, `disallow`, `message` — any other keys (including `exceptPaths`) are silently stripped. Do not write `from: src/config/**, disallow: [src/api/**], exceptPaths: [src/config/managers.ts]` and expect it to work. Use layer ordering (above) to carve out the composition file; reserve `forbiddenImports` for same-layer rules like sibling-domain isolation that the layer graph cannot express.

3. **Wire up the ESLint flat config so the forbidden-imports rule actually runs.** `harness init` scaffolds `eslint.config.mjs` that spreads `harnessPlugin.configs.recommended` but does not declare a `files:` glob or a TypeScript parser. Under ESLint 9 flat config this means every `.ts` file is ignored and the rule never fires. Replace the scaffolded config with an explicit block: `files: ['src/**/*.ts', 'tests/**/*.ts']`, `languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } }`, `plugins: { '@harness-engineering': harnessPlugin }`, and the three `'error'` rules (`no-layer-violation`, `no-forbidden-imports`, `no-circular-deps`). Add `@typescript-eslint/parser` to devDependencies. Verify by running `npx eslint 'src/**/*.ts'` and seeing it actually report errors on a deliberately bad file.

4. **Pick the test framework(s) and delegate detailed setup to the right skill.** Do not configure the framework here — just record the choice in AGENTS.md and point the human at the follow-up skill:
   - Playwright (API or E2E) → `test-playwright-setup` then `test-playwright-patterns`
   - Vitest → `test-vitest-config`
   - Contract tests → `api-contract-testing` and `test-contract-testing`
   - Mocking (MSW, route interception) → `test-msw-pattern`, `test-mock-patterns`
   - Fixtures / factories → `test-factory-patterns`, `harness-test-data`
   - For shared libraries that are *consumed* by tests but contain none themselves, skip framework setup entirely — record this in AGENTS.md under "Gotchas" so agents do not try to add Vitest later.

5. **Environment and secret handling.** Require a committed `.env.example` listing every variable the suite reads (API base URLs, OAuth client IDs, registry tokens, feature flags). Actual `.env*` files must be gitignored. For multi-environment suites, encode environments as `.env.dev`, `.env.stage`, `.env.prod` and document in AGENTS.md how the runner selects one (env var, CLI flag, or config). Never commit real credentials even as examples — use placeholders like `REPLACE_ME`.

6. **Authentication abstraction.** Record in AGENTS.md: token source (OAuth client-credentials, CIAM, basic auth, session cookie), caching strategy (in-memory, file, Redis), and how test users or parent/child scopes are resolved. If a shared test-user library exists (typically `@capillary/<team>-testing-user-library` or similar), link it and forbid inlining user credentials in specs.

7. **Schema / contract validation.** Decide whether request and response DTOs are validated at runtime (zod, ajv, io-ts) or only compile-time. Intermediate and above should validate at runtime for contract-drift detection. If adopting zod, reference `zod-schema-definition`.

8. **Fixtures and test-data isolation.** Document the per-test isolation strategy in AGENTS.md: unique IDs per run (UUID suffixes, timestamps), teardown hooks, no shared mutable state between specs. Forbid hard-coded production record IDs in fixtures.

9. **Mocking support (shared libraries and API clients).** If the project will be consumed by FE or UI test suites that need to mock upstream responses, expose mock response builders (e.g. `buildMockResponse`, `buildMockErrorResponse`) and document the override API in AGENTS.md so consumer projects know the contract.

10. **Test organization: tags over folders.** Do *not* split specs into `tests/smoke/`, `tests/regression/`, etc. Organize specs by domain / feature area (`tests/<domain>/<feature>.spec.ts`) and filter run shape with tags. This matches how Playwright (and most modern runners) expect grep-based filtering to work, and avoids moving a spec file whenever its coverage tier changes.
    
    Record the tag taxonomy in AGENTS.md. Baseline for a Playwright API suite:
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
    The `json` reporter is the input to the custom report in step 11. The `github` reporter produces annotations on PRs; `list` is for local stdout; `html` is for deep-dive failure triage.

11. **Custom report (enriched HTML + Slack + history).** Playwright's stock HTML report is fine for a single run but does not track trends, categorize failures, or know which tests are quarantined. Scaffold a `scripts/generate-reports.ts` that reads the JSON reporter output (`test-results/json-results/results.json`) and emits an enriched report. Modeled on reference implementations already running in Capillary test suites, it should produce:
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

12. **CI integration.** For intermediate+: PR pipeline runs `npm run smoke` (tag-filtered, not folder-filtered); main merges trigger `npm run exhaustive`; nightly runs `npm run exhaustive` plus a quarantine audit (step 11) reporting quarantined-too-long tests. Record the flake policy (max retries, quarantine threshold) in `harness.config.json` so agents do not silently raise retries to hide flakes.

### Phase 4: VALIDATE — Prove the Guards Fire

Run the three gates on the clean tree:

```bash
harness validate
harness check-deps
npx eslint 'src/**/*.ts' 'tests/**/*.ts'
```

All three must pass before proceeding.

**Clean-tree passing is necessary but not sufficient.** All three tools can pass while the rules are silently misconfigured (layer ordering wrong, ESLint files glob missing, forbidden-imports schema fields dropped). Before handing back to `initialize-harness-project` for wrap-up:

- Insert one deliberate forbidden import — a sibling-domain import is the easiest (e.g. `src/api/users/users-manager.ts` importing `../auth/auth-manager`). Run `npx eslint <file>` and confirm it reports the violation.
- Insert one deliberate cross-layer import (e.g. `src/utils/foo.ts` importing from `src/api/users/`). Run `harness check-deps` and confirm it reports the violation.
- Revert both edits. Confirm the clean tree is green on all three gates.

After verification passes, return to `initialize-harness-project`'s Phase 4 for:
- `harness scan` (knowledge graph)
- Roadmap nudge
- Final commit

## Harness Integration

- **`initialize-harness-project`** — parent skill. Owns adoption-level selection, `harness init` invocation, persona configuration, AGENTS.md base template, i18n decision, knowledge-graph build, roadmap nudge, final commit.
- **`harness validate`** — verifies `harness.config.json` schema, AGENTS.md, layers, persona config.
- **`harness check-deps`** — verifies layer-graph dependency constraints at the file level.
- **`@harness-engineering/eslint-plugin`** — enforces `forbiddenImports` (same-layer rules) and surfaces layer-graph violations at lint time.
- **Follow-up test skills** — `test-playwright-setup`, `test-playwright-patterns`, `test-vitest-config`, `test-msw-pattern`, `test-mock-patterns`, `test-factory-patterns`, `harness-test-data`, `api-contract-testing`, `test-contract-testing`.
- **Related libraries** — `zod-schema-definition` (runtime DTO validation).

## Success Criteria

- Archetype is recorded in AGENTS.md (API / E2E-UI / Shared library)
- Shared-library decision is recorded in AGENTS.md
- Layer model matches the chosen variant (A self-contained or B shared-library consumer) from Phase 3 step 2
- Layer ordering puts `composition` before `config` (Variant A only)
- `forbiddenImports` uses only `{from, disallow, message}` — no silently-dropped `exceptPaths`
- `eslint.config.mjs` declares an explicit `files:` glob and imports a TypeScript parser
- `.env.example` is present with `REPLACE_ME` placeholders
- No real secrets are committed (real `.env*` gitignored)
- Test framework choice and tag taxonomy (including `@smoke` + quarantine tags) are recorded in AGENTS.md
- Specs are organized `tests/<domain>/<feature>.spec.ts` — no `tests/smoke/` or `tests/regression/` folders
- `playwright.config.ts` declares html + list + github + json reporters and `grepInvert` for quarantine tags
- `scripts/generate-reports.ts` exists and is wired to `npm run generate-custom-reports`
- All three Phase 4 gates pass on the clean tree
- "Prove the guards fire" step completed — deliberate violations were caught and reverted
- Control returned to `initialize-harness-project` for knowledge-graph build and final commit

## Rationalizations to Reject

| Rationalization                                                          | Why It Is Wrong                                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| "This is a test suite, so strict layer constraints are overkill"         | Test suites benefit *more* from layer constraints than product code — peer-domain imports and spec coupling are the top sources of flaky, hard-to-maintain suites. |
| "We can commit a real `.env` for convenience, CI will ignore it"         | Phase 3 step 5 forbids committing real credentials. A leaked `.env` in a test repo leaks the same secrets as a product repo. Use `.env.example` with placeholders. |
| "Tests don't need tags — we'll run everything every time"                | Without a `@smoke` tag the PR pipeline grows to 30+ minutes and drives developers to skip CI. Record a tag taxonomy in Phase 3 step 10 even if enforcement comes later. |
| "We'll split specs into `tests/smoke/` and `tests/regression/` for filtering" | Folder-based filtering forces a file move every time a spec's tier changes. Modern runners (Playwright, Vitest, Cypress) expect `--grep @tag`. Keep `tests/<domain>/<feature>.spec.ts` flat and tag per-test. |
| "We'll add schema validation later once the client stabilizes"           | Runtime DTO validation is the primary contract-drift detector for API test suites. Adding it after tests exist means updating every spec. Decide in Phase 3 step 7. |
| "We'll copy the API client code into this test suite for convenience"    | If a shared API client library already exists, consume it — do not fork. Forked clients drift immediately; the shared library is the contract source of truth. Only scaffold in-repo clients if no shared library exists. See Phase 2. |
| "Playwright's built-in HTML report is enough"                            | The built-in report shows a single run. It does not categorize failures (schema vs auth vs timeout), does not track regressions by commit, and does not surface tests quarantined for weeks. Scaffold `scripts/generate-reports.ts` per Phase 3 step 11. |
| "All three gates passed, so we're done"                                  | Clean-tree passing can co-exist with silently-misconfigured rules (layer ordering wrong, eslint glob missing, forbidden-imports fields dropped). Phase 4 requires deliberately inserting a violation and confirming the tool catches it. |

## Examples

### Example: Initializing a Shared API Test Library (Intermediate)

**CLASSIFY:**

```
Human: "New repo. It's a shared TypeScript HTTP client for our API test suites — consumed by Playwright API tests and also used to mock responses in FE tests. No tests live in this repo."
package.json has no Playwright/Vitest as direct deps (shared library, not a test runner).
Archetype: Shared test library.
```

**DECIDE (Phase 2):**

```
This is the shared library itself — scaffold in-repo. Phase 2 is trivial.
```

**SCAFFOLD (delegated to `initialize-harness-project`):**

```bash
harness init --level intermediate --language typescript
```

**CONFIGURE (Phase 3):**

```text
Domain layout: one folder per API domain under src/api/ (challenges, rewards,
  user, oauth, ...). Each domain exposes <domain>-manager.ts taking HttpClient
  in its constructor. Single composition module src/config/managers.ts wires
  every domain from one HttpClient.

Layer model (Variant A, harness.config.json):
  utils       → src/utils/**                         (no internal deps)
  composition → src/config/managers.ts               → utils, common, config, api
  common      → src/api/common/**                    → utils
  config      → src/config/**                        → utils, common
  api         → src/api/**                           → utils, common, config

Layer ordering: composition BEFORE config (first-match-wins).

Forbidden (forbiddenImports):
  - any src/api/<domain> importing a sibling src/api/<domain>
  - src/api/common importing config or sibling domains

Framework: none in-repo (shared library). Gotcha recorded in AGENTS.md so
  future agents don't scaffold Vitest.

Env: .env.example committed with GITHUB_ACCESS_TOKEN placeholder (registry
  auth only). No runtime env vars — consumers pass config explicitly.

Auth: OAuth client-credentials with pluggable TokenStorage interface; parent
  vs child scope resolution documented in docs/auth-flow.md. Link to
  the shared Capillary test-user library for test-user data.

Schema validation: zod at runtime for all response DTOs. Reference
  zod-schema-definition skill for future domain additions.

Mocking: expose buildMockResponse / buildMockSuccessResponse /
  buildMockErrorResponse from src/config/mock-response.ts so FE test repos
  can override per spec. Document override contract in docs/mock-response.md.
```

**VALIDATE (Phase 4):**

```bash
harness validate     # Pass
harness check-deps   # Pass — no sibling-domain violations
npx eslint 'src/**/*.ts'  # Pass

# Prove the guards fire: insert a sibling-domain import, eslint reports it, revert.

# Hand back to initialize-harness-project:
harness scan         # Builds .harness/graph/
git commit -m "feat: initialize harness project at intermediate level for shared API test library"
```

### Example: Playwright API Test Suite Consuming a Shared Library (Intermediate)

**CLASSIFY:**

```
Human: "New repo. Playwright API tests for one of our backend services. A shared API client library already exists at @capillary/<team>-testing-api-library and a shared test-user library at @capillary/<team>-testing-user-library."
package.json will have @playwright/test as a direct dep → test suite signal.
Archetype: API test suite.
```

**DECIDE (Phase 2):**

```
Shared library exists → consume it. Layer variant B (shared-library consumer).
Do NOT scaffold src/api/. Record decision in AGENTS.md.
```

**SCAFFOLD (delegated to `initialize-harness-project`):**

```bash
harness init --level intermediate --language typescript
# Scaffolded output is a starting point — replace generic layers and eslint config.
```

**CONFIGURE (Phase 3, Variant B):**

```text
Dependencies: @capillary/<team>-testing-api-library, @capillary/<team>-testing-user-library,
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

Layer model (Variant B, harness.config.json):
  utils       → src/utils/**        (no internal deps)
  config      → config/**           → utils
  fixtures    → fixtures/**         → utils, config
  specs       → tests/**            → utils, config, fixtures

Forbidden (same-layer or cross-cutting):
  - tests/** importing @capillary/<team>-testing-api-library directly
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

**VALIDATE (Phase 4):**

```bash
harness validate     # Pass
harness check-deps   # Pass
npm run lint         # Pass
npm run smoke        # Sanity: runs only @smoke-tagged specs

# Prove the forbidden-imports rule fires:
# temporarily add an import of @capillary/<team>-testing-api-library to a spec
npx eslint tests/challenges/create.spec.ts  # Should report violation
# revert, confirm green

# Hand back to initialize-harness-project:
git commit -m "feat: initialize harness project at intermediate level for Playwright API suite"
```
