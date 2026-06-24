# Plan: required-review-ci Phase 4 — Adopter-facing CI template artifacts

**Date:** 2026-06-24 | **Spec:** docs/changes/required-review-ci/proposal.md (Component B, Component C, G4, D5, SC6, SC7) | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium

## Goal

`harness init` can render a tested GitHub Actions workflow + a matching repo ruleset that wire the (already-built) `harness review-ci` command into a _required_ status check, with documented per-runner secret names and a deferred `gh api` apply step.

## Scope boundary

In scope: `templates/ci/` artifacts (workflow `.hbs`, ruleset JSON, README, `template.json` registration) + tests (SC6 check-name parity, SC7 init-render + yaml-valid). Out of scope (do NOT plan): applying the ruleset via real `gh`/network; dogfooding this repo's own `.github/workflows/` (Phase 5); the `--comment` PR poster (still a CLI stub — workflow passes `--comment` but the command warns it is unwired, which is correct and documented).

## Verified facts (evidence)

- Published CLI package: `@harness-engineering/cli`, bin `harness`, version `2.8.0` (`packages/cli/package.json`).
- `review-ci` command flags are exactly `--runner`, `--block-on` (default `request-changes`), `--diff`, `--comment`, `--json` (`packages/cli/src/commands/review-ci.ts:220-250`). `--comment` is a documented stub.
- secretEnvVar values (`packages/core/src/review/ci/runner-presets.ts:99-181`): `claude`→`ANTHROPIC_API_KEY`; `antigravity`→`GEMINI_API_KEY`; `gemini`→`GEMINI_API_KEY` (but `supported:false`, superseded by antigravity); `codex`→`OPENAI_API_KEY`; `local` (`kind:endpoint`)→`endpointEnvVar:HARNESS_LOCAL_ENDPOINT`, `modelEnvVar:HARNESS_LOCAL_MODEL` (no secret — G5).
- Template engine (`packages/cli/src/templates/engine.ts`): discovers dirs by `template.json` (`listTemplates` at :168, `findTemplateDir` at :413). `render` (:243) compiles `.hbs` with `Handlebars.compile(raw, { strict: true })` — **strict mode: any referenced var that is undefined throws**. Only `*.json.hbs` files are buffered for JSON-merge (:272); a plain `.json` (no `.hbs`) is copied verbatim (:279).
- Metadata schema (`packages/cli/src/templates/schema.ts:24-35`): requires `name`, `description`, `version: literal(1)`; `level`/`framework`/`extends`/`detect` all optional. A dir with only `name`+`description`+`version` is valid and discoverable via `listTemplates()` but is NOT auto-resolved into a level scaffold (it has no `level`/`framework`) — i.e. opt-in/discoverable, matching the brief's recommendation.
- **[CONSTRAINT]** `packages/cli/tests/templates/template-content.test.ts:9-23` iterates EVERY directory under `templates/` and asserts each has a schema-valid `template.json`. Adding `templates/ci/` WITHOUT a valid `template.json` breaks this pre-existing test. Task 1 must land `template.json` first.
- `yaml` (^2.8.3) is a dependency of both `packages/cli` and `packages/core` — use it to parse rendered YAML in tests.
- Existing hardcoded GitHub workflow generator lives in `packages/cli/src/commands/ci/init.ts` (`generateGitHubActions`) and emits `.github/workflows/harness.yml` — a SEPARATE mechanism (the build/test/lint checks). Our template is the review gate; mirror its `actions/checkout@v4` + `actions/setup-node@v4 node-version '22'` + `npm install -g @harness-engineering/cli` shape for consistency.

## Registration decision (resolves brief item 4)

`templates/ci/` is registered as a **discoverable, opt-in template** via `templates/ci/template.json` (`name: "ci-required-review"`, no `level`/`framework`). It is rendered through the existing `TemplateEngine` (no engine code change needed — `collectFiles`/`render` already handle arbitrary dirs and `.hbs`). Wiring it into the future "load-bearing minimum" tier (#539) is explicitly deferred (that tier does not exist yet); for now it is a named template `init` can render. This avoids touching `engine.ts`/`schema.ts` and respects the fail-closed arch gate (#525) — no new modules, only template data + tests.

## Default runner decision

Workflow Handlebars default `runner: claude` (matches spec Component B line 214 and is a `supported:true` `agent-cli` preset). Documented tradeoff in README: the heuristic floor runs regardless of runner; the LLM tier only activates when `ANTHROPIC_API_KEY` is present, degrading gracefully (per SC2). Adopters wanting secret-free/cost-free review set `runner: local` (G5). Default `blockOn: request-changes`. `baseBranch` has NO default in the template — but because `Handlebars strict mode` throws on undefined vars, the init-render test MUST always supply all three (`runner`, `blockOn`, `baseBranch`); documented in README that `baseBranch` is required context.

## Check-name pin (SC6)

The workflow job id is `required-review` and its `name:` (the GitHub check/context name) is pinned to the literal string **`required-review`**. The ruleset's `required_status_checks` entry uses `context: "required-review"`. Task 5 asserts these match by parsing both files. This literal is the load-bearing contract — do not template it.

## Observable Truths (Acceptance Criteria)

1. (SC7) Rendering `templates/ci/required-review.yml.hbs` with `{ projectName, runner: 'claude', blockOn: 'request-changes', baseBranch: 'main' }` via `TemplateEngine.render` produces a string that `yaml.parse()` accepts and whose `jobs['required-review'].name` equals `required-review` and whose run step contains `harness review-ci --runner claude --block-on request-changes`.
2. (SC6) `JSON.parse(required-review.ruleset.json).rules` contains a `required_status_checks` rule whose `parameters.required_status_checks[].context` equals the workflow's `jobs['required-review'].name` — asserted by a test parsing BOTH files (literal `required-review`).
3. `templates/ci/template.json` is schema-valid; `template-content.test.ts` (which iterates all template dirs) still passes; `TemplateEngine.listTemplates()` includes `ci-required-review`.
4. `templates/ci/README.md` documents the deferred `gh api repos/{owner}/{repo}/rulesets --input required-review.ruleset.json` apply step and the per-runner secret env var names (claude=ANTHROPIC_API_KEY, antigravity/gemini=GEMINI_API_KEY, codex=OPENAI_API_KEY, local=HARNESS_LOCAL_ENDPOINT+HARNESS_LOCAL_MODEL, noting local is secret-free/cost-free).
5. New tests live under `packages/cli/tests/templates/` and use mocked/in-process rendering — no real `gh`, no network, no spawned CLI.
6. `harness validate` passes (modulo the pre-existing, unrelated non-blocking drift) and the new tests pass via `npx vitest run`.

## File Map

- CREATE `templates/ci/template.json`
- CREATE `templates/ci/required-review.yml.hbs`
- CREATE `templates/ci/required-review.ruleset.json`
- CREATE `templates/ci/README.md`
- CREATE `packages/cli/tests/templates/ci-required-review.test.ts`
- MODIFY `AGENTS.md` (note the renderable CI template) — Category: integration

## Skeleton

1. Register the template dir (template.json) (~1 task, ~3 min)
2. Author workflow `.hbs` (~1 task, ~5 min)
3. Author ruleset JSON (~1 task, ~3 min)
4. Author README (~1 task, ~4 min)
5. Tests — check-name parity + init-render + yaml-valid, TDD (~3 tasks, ~15 min)
6. Integration — AGENTS.md note + full validate (~2 tasks, ~8 min)

**Estimated total:** 9 tasks, ~38 minutes. _Skeleton approved: pending (presented for approval before expansion is acted on)._

## Tasks

### Task 1: Register `templates/ci/` with a valid template.json

**Depends on:** none | **Files:** `templates/ci/template.json`

This must land first: `template-content.test.ts` iterates all `templates/*` dirs and asserts each has a schema-valid `template.json`. Creating the dir without it breaks an existing test.

1. Create `templates/ci/template.json`:
   ```json
   {
     "name": "ci-required-review",
     "description": "Opt-in GitHub Actions required-review gate: renders a workflow that runs `harness review-ci` plus a matching branch-protection ruleset.",
     "version": 1
   }
   ```
2. Run: `npx vitest run packages/cli/tests/templates/template-content.test.ts` — observe it still passes (now includes a `ci/template.json is valid` case).
3. Run: `harness validate`
4. Commit: `feat(templates): register ci-required-review template dir`

### Task 2: Author the required-review workflow template

**Depends on:** Task 1 | **Files:** `templates/ci/required-review.yml.hbs`

The job id and `name:` are the literal `required-review` (the pinned check name — NOT templated). Only `runner`, `blockOn`, `baseBranch` are Handlebars vars; strict mode means all three must be supplied at render time.

1. Create `templates/ci/required-review.yml.hbs`:

   ```yaml
   # Rendered by `harness init` (ci-required-review template).
   # The job name below ("required-review") is the check name bound as REQUIRED
   # by required-review.ruleset.json. Keep them identical.
   name: Required Review

   on:
     pull_request:
       branches: ['{{baseBranch}}']

   permissions:
     contents: read
     pull-requests: write

   jobs:
     required-review:
       name: required-review
       runs-on: ubuntu-latest
       env:
         # The heuristic floor runs regardless. The LLM tier ({{runner}}) only
         # activates when its secret is present, degrading gracefully otherwise.
         ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
         GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
         OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
         HARNESS_LOCAL_ENDPOINT: ${{ secrets.HARNESS_LOCAL_ENDPOINT }}
         HARNESS_LOCAL_MODEL: ${{ secrets.HARNESS_LOCAL_MODEL }}
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0
         - uses: actions/setup-node@v4
           with:
             node-version: '22'
         - run: npm install -g @harness-engineering/cli@2.8.0
         - name: Run required review gate
           run: harness review-ci --runner {{runner}} --block-on {{blockOn}} --comment
   ```

   Note: GitHub Actions `${{ ... }}` braces are NOT Handlebars `{{ }}` — Handlebars treats `${{ secrets.X }}` as literal text plus a `{ secrets.X }` block only if it sees `{{`; `${{` is `$` + `{{secrets.X }}`. To avoid strict-mode failures on `secrets`, the test (Task 6) is the gate — if Handlebars misparses, Task 6 fails and the snippet is escaped with `{{{ '${{' }}}` style raw helpers. Verify during Task 6; if it throws, wrap GH expressions using `\{{` is NOT valid — instead replace each `${{ secrets.NAME }}` with `${{"{{"}} secrets.NAME }}` is also fragile. SAFEST: this template contains GH `${{ }}` which Handlebars sees as `$` then `{{ secrets.ANTHROPIC_API_KEY }}` → strict-mode lookup of `secrets`. So author the env values WITHOUT Handlebars collision by using Handlebars raw-block `{{{{raw}}}} ... {{{{/raw}}}}` around the entire `env:` and `steps:` `${{ }}` regions, OR register `secrets` in the render context as a passthrough. **Decision: wrap the GH-expression lines in a `{{{{raw}}}}...{{{{/raw}}}}` block** so Handlebars emits them verbatim, and keep `{{runner}}/{{blockOn}}/{{baseBranch}}` OUTSIDE the raw block. Restructure the file so the three template vars (`baseBranch` in `on:`, `runner`/`blockOn` in the run step) are outside raw, and every `${{ secrets... }}` line is inside `{{{{raw}}}}`.

2. (No standalone run — exercised by Task 6's render test.)
3. Run: `harness validate`
4. Commit: `feat(templates): add required-review workflow template`

### Task 3: Author the required-review ruleset JSON

**Depends on:** Task 1 | **Files:** `templates/ci/required-review.ruleset.json`

Plain `.json` (NOT `.hbs`) so the engine copies it verbatim. `context` MUST be the literal `required-review` to match the workflow job name.

1. Create `templates/ci/required-review.ruleset.json`:
   ```json
   {
     "name": "required-review",
     "target": "branch",
     "enforcement": "active",
     "conditions": {
       "ref_name": {
         "include": ["~DEFAULT_BRANCH"],
         "exclude": []
       }
     },
     "rules": [
       {
         "type": "required_status_checks",
         "parameters": {
           "strict_required_status_checks_policy": true,
           "required_status_checks": [{ "context": "required-review" }]
         }
       }
     ]
   }
   ```
2. Run: `node -e "JSON.parse(require('fs').readFileSync('templates/ci/required-review.ruleset.json','utf8'))"` — observe no parse error.
3. Run: `harness validate`
4. Commit: `feat(templates): add required-review branch-protection ruleset`

### Task 4: Author the templates/ci README

**Depends on:** Task 1 | **Files:** `templates/ci/README.md`

Document the deferred apply step and per-runner secret names. The apply is NOT run here.

1. Create `templates/ci/README.md` covering:
   - What this template renders (workflow + ruleset) and that the workflow job/check name `required-review` is the binding contract.
   - Apply the ruleset (run once, by a repo admin, outside this repo's CI):
     ```
     gh api repos/{owner}/{repo}/rulesets --input required-review.ruleset.json
     ```
     Note this is deferred-to-real-use; nothing applies it automatically.
   - Per-runner secret env vars (set as repo Actions secrets):
     | runner | secret env var(s) |
     | --- | --- |
     | `claude` | `ANTHROPIC_API_KEY` |
     | `antigravity` (and superseded `gemini`) | `GEMINI_API_KEY` |
     | `codex` | `OPENAI_API_KEY` |
     | `local` | `HARNESS_LOCAL_ENDPOINT`, `HARNESS_LOCAL_MODEL` — **no API key; secret-free and cost-free (G5)** |
   - The heuristic floor always runs and can block; the LLM tier is secret-gated and degrades gracefully when the secret is absent.
   - `--comment` PR posting is not yet wired (CLI stub); the check still gates on exit code.
2. Run: `harness validate`
3. Commit: `docs(templates): add ci required-review README`

### Task 5: TDD — check-name parity test (SC6)

**Depends on:** Task 2, Task 3 | **Files:** `packages/cli/tests/templates/ci-required-review.test.ts`

1. Create the test file with a failing parity test:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as yaml from 'yaml';

   const CI_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates', 'ci');

   describe('ci-required-review template', () => {
     it('ruleset required-check context matches the workflow job name (SC6)', () => {
       const wf = yaml.parse(
         fs.readFileSync(path.join(CI_DIR, 'required-review.yml.hbs'), 'utf-8')
       );
       const jobName = wf.jobs['required-review'].name;
       const ruleset = JSON.parse(
         fs.readFileSync(path.join(CI_DIR, 'required-review.ruleset.json'), 'utf-8')
       );
       const checks = ruleset.rules.find(
         (r: { type: string }) => r.type === 'required_status_checks'
       ).parameters.required_status_checks;
       const contexts = checks.map((c: { context: string }) => c.context);
       expect(jobName).toBe('required-review');
       expect(contexts).toContain(jobName);
     });
   });
   ```

   Note: this parses the RAW `.hbs` with `yaml.parse`. Because `{{...}}` Handlebars tokens are inside quoted YAML strings (`'{{baseBranch}}'`) or are step-string values, the raw `.hbs` must still be YAML-parseable for `jobs.required-review.name` (a literal). If the `{{{{raw}}}}` block lines break raw YAML parsing, this test will reveal it — in that case parse the RENDERED output here too (reuse Task 6's render). Keep `name: required-review` literal (no template var) so this assertion is stable on the raw file.

2. Run: `npx vitest run packages/cli/tests/templates/ci-required-review.test.ts` — observe failure (or pass once files exist; if it fails on raw-parse, adjust to parse rendered output and re-run).
3. Run: `harness validate`
4. Commit: `test(templates): assert ruleset check-name matches workflow job (SC6)`

### Task 6: TDD — init-render + yaml-valid test (SC7)

**Depends on:** Task 1, Task 2 | **Files:** `packages/cli/tests/templates/ci-required-review.test.ts`

1. Add a render test to the same file:

   ```ts
   import { TemplateEngine } from '../../src/templates/engine';

   it('renders the workflow with substituted runner/blockOn/baseBranch into valid YAML (SC7)', () => {
     const TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     const engine = new TemplateEngine(TEMPLATES);
     const resolved = {
       metadata: {
         name: 'ci-required-review',
         description: 'x',
         version: 1 as const,
         mergeStrategy: { json: 'deep-merge' as const, files: 'overlay-wins' as const },
       },
       files: [
         {
           relativePath: 'required-review.yml.hbs',
           absolutePath: path.join(CI_DIR, 'required-review.yml.hbs'),
           isHandlebars: true,
           sourceTemplate: 'ci',
         },
       ],
     };
     const result = engine.render(resolved, {
       projectName: 'demo',
       runner: 'claude',
       blockOn: 'request-changes',
       baseBranch: 'main',
     } as never);
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     const wf = result.value.files.find((f) => f.relativePath === 'required-review.yml');
     expect(wf).toBeDefined();
     const parsed = yaml.parse(wf!.content); // throws if invalid YAML
     expect(parsed.jobs['required-review'].name).toBe('required-review');
     const runStep = parsed.jobs['required-review'].steps.find(
       (s: { run?: string }) => typeof s.run === 'string' && s.run.includes('review-ci')
     );
     expect(runStep.run).toContain('--runner claude');
     expect(runStep.run).toContain('--block-on request-changes');
     expect(parsed.on.pull_request.branches).toContain('main');
     // GH expressions survived verbatim:
     expect(wf!.content).toContain('${{ secrets.ANTHROPIC_API_KEY }}');
   });
   ```

   Note `TemplateContext` does not declare `runner`/`blockOn`/`baseBranch`; cast the context with `as never`/`as unknown as TemplateContext` since Handlebars renders by key regardless of the TS interface. This is the canonical gate that the `{{{{raw}}}}` wrapping from Task 2 is correct.

2. Run: `npx vitest run packages/cli/tests/templates/ci-required-review.test.ts` — if it throws on a Handlebars strict-mode `secrets` lookup or yaml parse, fix Task 2's `{{{{raw}}}}` wrapping until green.
3. Run: `harness validate`
4. Commit: `test(templates): assert init renders valid required-review workflow (SC7)`

### Task 7: TDD — template is discoverable via listTemplates

**Depends on:** Task 1 | **Files:** `packages/cli/tests/templates/ci-required-review.test.ts`

1. Add:
   ```ts
   it('is discoverable as a named template (not a level scaffold)', () => {
     const TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     const engine = new TemplateEngine(TEMPLATES);
     const list = engine.listTemplates();
     expect(list.ok).toBe(true);
     if (!list.ok) return;
     const ci = list.value.find((t) => t.name === 'ci-required-review');
     expect(ci).toBeDefined();
     expect(ci!.level).toBeUndefined();
     expect(ci!.framework).toBeUndefined();
   });
   ```
2. Run: `npx vitest run packages/cli/tests/templates/ci-required-review.test.ts` — observe pass.
3. Run: `harness validate`
4. Commit: `test(templates): assert ci-required-review is a discoverable opt-in template`

### Task 8: Note the renderable CI template in AGENTS.md

**Depends on:** Task 7 | **Files:** `AGENTS.md` | **Category:** integration

1. Add a one-line entry under the relevant capabilities/templates section of `AGENTS.md` describing that `harness init` can render the opt-in `ci-required-review` template (workflow + branch-protection ruleset wiring `harness review-ci`). Locate the existing templates/CI section before editing; keep it to one sentence.
2. Run: `harness validate`
3. Commit: `docs(agents): note renderable ci-required-review template`

### Task 9: Full validation + dep check

**Depends on:** Task 8 | **Files:** none

1. Run: `npx vitest run packages/cli/tests/templates/` — all template tests green (including the existing `template-content` and `engine` suites and the new file).
2. Run: `harness check-deps` — confirm no NEW circular deps introduced (the two pre-existing cycles in `drift/catalog` and `craft/llm` are unrelated and out of scope).
3. Run: `harness validate` — passes modulo the pre-existing non-blocking design-token drift in unrelated test files.
4. No commit (verification-only). If anything fails, fix in the owning task and re-run.

## Uncertainties

- [ASSUMPTION] `${{ secrets.X }}` GitHub expressions collide with Handlebars `{{ }}` under strict mode; mitigated by wrapping those lines in `{{{{raw}}}}` (Task 2) and gating on Task 6's render test. If raw-block YAML parsing in Task 5 proves brittle, Task 5 falls back to asserting against the RENDERED output (documented inline). Either path satisfies SC6.
- [ASSUMPTION] CLI pin `@harness-engineering/cli@2.8.0` is the right pin at authoring time (current version). Adopters can bump; the pin keeps the rendered workflow reproducible.
- [DEFERRABLE] Exact `AGENTS.md` section placement (Task 8) — finalized during execution by locating the existing templates section.
- [DEFERRABLE] Whether `~DEFAULT_BRANCH` vs a literal branch in the ruleset `conditions.ref_name.include` is preferred by adopters — `~DEFAULT_BRANCH` is the GitHub-portable choice; documented in README.

## Known-failures check

`.harness/failures.md` does not exist in this repo (no recorded failures log). The one foreseeable failure — the Handlebars/GH-expression `{{ }}` collision under strict mode — is pre-empted via the `{{{{raw}}}}` approach (Task 2) and gated by Task 6's render test.
