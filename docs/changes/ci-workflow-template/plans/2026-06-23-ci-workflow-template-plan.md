# Plan: CI Workflow Template

**Date:** 2026-06-23 | **Spec:** docs/changes/ci-workflow-template/proposal.md | **Tasks:** 11 | **Time:** ~46 min | **Integration Tier:** medium

> **Environment:** All work happens in the worktree `/Users/cwarner/Projects/harness-engineering-540-ci-template` (branch `feat/540-ci-workflow-template`). Use Node 22 (`nvm use 22`) for every `pnpm`/`harness`/`vitest` command — Node 26 breaks `better-sqlite3` and the pre-push hook. All paths below are relative to the worktree root.

## Goal

`harness init` (and `harness ci init`) writes a single blocking GitHub Actions workflow (`.github/workflows/ci.yml`) that builds, lints, tests (language-appropriate), and runs `harness ci check` as the gate — reaching existing repos without overwriting a hand-tuned workflow.

## Observable Truths (Acceptance Criteria)

1. The system shall write `.github/workflows/ci.yml` containing build + lint + test steps followed by a `harness ci check --json` step when `harness init` runs on a fresh project.
2. The generated workflow shall trigger on `pull_request: [main]` and `push: [main]`, and when `harness ci check` exits non-zero the workflow run shall fail (single fail-fast job).
3. Language shall be reflected in generated steps: Python emits `pytest` + `ruff check .`; Go emits `go test ./...` + `golangci-lint run`; Rust emits `cargo test` + `cargo clippy`; Java emits `mvn -B verify`; TS/default emits `pnpm build`/`pnpm lint`/`pnpm test`.
4. When `harness init` runs in an existing project with no workflow file, the system shall write `.github/workflows/ci.yml`; if a workflow file already exists at that path, the system shall not overwrite it.
5. The generated workflow shall not contain any auto-baseline-update or `git push` step.
6. Exactly one GitHub Actions generator shall exist — `harness init` and `harness ci init` produce the same `ci.yml`; the gate-only `harness.yml` filename is retired. GitLab and generic generators are unchanged.
7. `harness validate` passes.

## Uncertainties

- [ASSUMPTION] The init flow injects the generated workflow into the engine's `RenderedFiles` set before `engine.write()`, and `.github/workflows/ci.yml` is added to `HARNESS_CONFIG_FILES` so existing-project mode (engine.ts:307) emits it and non-overwrite (engine.ts:323) protects an existing file. This is the spec's stated approach (proposal lines 99-103). If injecting into `RenderedFiles` proves awkward, Task 8 falls back to a discrete post-write call in `scaffoldProject` that itself checks `fs.existsSync` before writing — Task 9's tests still pin the same observable behavior. (Resolved to the injection approach; fallback noted.)
- [ASSUMPTION] The CI generator's new `opts.language` accepts the same lowercase strings the init flow uses (`typescript`, `python`, `go`, `rust`, `java`); unknown/undefined falls back to TS defaults. (Matches `InitOptions.language` and the engine's language handling.)
- [DEFERRABLE] Exact runtime-setup action versions (e.g. `setup-python@v5`) — concrete values chosen in Task 2/3, refinable during execution without changing task structure.
- [DEFERRABLE] `CIInitOptions` in `packages/types/src/ci.ts` does not currently carry `language`. The generator signature uses an inline `opts?: { language?: string }` per the spec, so the shared type need not change. If a future caller wants the typed option, add it then (YAGNI now).

## File Map

- MODIFY `packages/cli/src/commands/ci/init.ts` (add `language` option, per-language step blocks, enrich GitHub job, retire `harness.yml` filename → `ci.yml`)
- MODIFY `packages/cli/tests/ci/init.test.ts` (per-language snapshot / content assertions; updated filename)
- MODIFY `packages/cli/src/commands/init.ts` (wire `generateCIConfig` into scaffold + inject into write set)
- MODIFY `packages/cli/src/templates/engine.ts` (classify `.github/workflows/ci.yml` as harness-managed)
- MODIFY `packages/cli/tests/integration/init.test.ts` (new-project writes ci.yml; existing-project-with-workflow skips; language drives steps)
- MODIFY `docs/standard/implementation.md` (CI ships on init)
- CREATE `docs/knowledge/decisions/NNNN-single-ci-generator.md` (ADR for D1)

## Skeleton

1. Per-language CI generator with snapshot tests (~4 tasks, ~17 min)
2. Enrich GitHub job + retire harness.yml (~2 tasks, ~8 min)
3. Init wiring + harness-managed classification (~2 tasks, ~9 min)
4. Init integration tests (~1 task, ~5 min)
5. Documentation + ADR (integration) (~2 tasks, ~7 min)

**Estimated total:** 11 tasks, ~46 minutes.
_Skeleton approved: pending (presented at sign-off)._

---

## Tasks

### Task 1: Add language-to-steps mapping + `language` option to generator (TDD — write failing test first)

**Depends on:** none | **Files:** `packages/cli/tests/ci/init.test.ts`, `packages/cli/src/commands/ci/init.ts`

1. In `packages/cli/tests/ci/init.test.ts`, add a new `describe('generateCIConfig — language', ...)` block with a test that the default/typescript GitHub output contains `pnpm i --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm test`:
   ```ts
   it('emits TypeScript/default steps for github', () => {
     const result = generateCIConfig({ platform: 'github', language: 'typescript' });
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value.content).toContain('pnpm i --frozen-lockfile');
     expect(result.value.content).toContain('pnpm build');
     expect(result.value.content).toContain('pnpm lint');
     expect(result.value.content).toContain('pnpm test');
   });
   ```
   Note: `generateCIConfig` options type does not yet accept `language` — this also forces the type change.
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe failure (type error / missing steps).
3. In `packages/cli/src/commands/ci/init.ts`, add a language step map above `generateGitHubActions`:

   ```ts
   interface LanguageSteps {
     setup: string; // YAML lines for runtime setup step(s), indented for steps list
     install: string;
     build?: string;
     lint?: string;
     test: string;
   }

   function stepsForLanguage(language?: string): LanguageSteps {
     switch (language) {
       case 'python':
         return {
           setup: `      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'`,
           install: 'pip install -e .',
           lint: 'ruff check .',
           test: 'pytest',
         };
       case 'go':
         return {
           setup: `      - uses: actions/setup-go@v5\n        with:\n          go-version: 'stable'`,
           install: 'go mod download',
           build: 'go build ./...',
           lint: 'golangci-lint run',
           test: 'go test ./...',
         };
       case 'rust':
         return {
           setup: `      - uses: dtolnay/rust-toolchain@stable`,
           install: 'cargo fetch',
           build: 'cargo build',
           lint: 'cargo clippy',
           test: 'cargo test',
         };
       case 'java':
         return {
           setup: `      - uses: actions/setup-java@v4\n        with:\n          distribution: 'temurin'\n          java-version: '21'`,
           install: 'mvn -B -q install -DskipTests',
           test: 'mvn -B verify',
         };
       case 'typescript':
       default:
         return {
           setup: `      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - uses: pnpm/action-setup@v4`,
           install: 'pnpm i --frozen-lockfile',
           build: 'pnpm build',
           lint: 'pnpm lint',
           test: 'pnpm test',
         };
     }
   }
   ```

4. Do NOT yet rewrite `generateGitHubActions` body — that is Task 2. For now, extend the generator option types so the test compiles: change `generateCIConfig` options to `{ platform: CIPlatform; checks?: CICheckName[]; language?: string }`, and thread `language` to a temporary `generateGitHubActions(skipFlag, language)` signature that still returns the old body (steps unused yet) — the TS-default test will still fail on missing `pnpm build` content, which Task 2 fixes. (If preferred, defer the content assertion to Task 2 by marking this test `.skip` — but keep the type wiring here.)
5. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — the type compiles; content test may remain red until Task 2.
6. Run: `nvm use 22 && pnpm harness validate`
7. Commit: `feat(ci): add per-language step mapping to CI generator`

### Task 2: Enrich `generateGitHubActions` into a single fail-fast `ci` job (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/ci/init.test.ts`, `packages/cli/src/commands/ci/init.ts`

1. In `packages/cli/tests/ci/init.test.ts`, assert the enriched job shape for default/TS:
   ```ts
   it('emits a single fail-fast ci job with checkout, setup, install, build, lint, test, gate', () => {
     const r = generateCIConfig({ platform: 'github', language: 'typescript' });
     expect(r.ok).toBe(true);
     if (!r.ok) return;
     const c = r.value.content;
     expect(c).toContain('actions/checkout@v4');
     expect(c).toMatch(/jobs:\s*\n\s*ci:/);
     expect(c).toContain('pnpm i --frozen-lockfile');
     expect(c).toContain('pnpm build');
     expect(c).toContain('harness ci check --json');
     // gate is the last step
     expect(c.trimEnd().endsWith('run: harness ci check --json')).toBe(true);
   });
   it('excludes any baseline-refresh or git push step', () => {
     const r = generateCIConfig({ platform: 'github' });
     if (!r.ok) return;
     expect(r.value.content).not.toMatch(/git push/);
     expect(r.value.content).not.toMatch(/refresh-baselines|baseline.*update/i);
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe failure.
3. Rewrite `generateGitHubActions(skipFlag: string, language?: string): string` so it emits one `ci` job, building the steps list from `stepsForLanguage(language)`. Keep `name: CI`, the `on: push:[main] / pull_request:[main]` triggers, and the `concurrency` cancel-in-progress block. Compose steps in order: `actions/checkout@v4`, `<setup>`, install, build (if present), lint (if present), test, then `harness ci check --json${skipFlag}` as the final step. Use `- name:`/`run:` for each command step. No baseline/git-push steps.
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe pass (all language + structure tests, including the Task 1 TS-default content test).
5. Run: `nvm use 22 && pnpm harness validate`
6. Commit: `feat(ci): emit enriched single fail-fast GitHub Actions job`

### Task 3: Per-language snapshot tests for Python, Go, Rust, Java (TDD)

**Depends on:** Task 2 | **Files:** `packages/cli/tests/ci/init.test.ts`

1. Add per-language assertions (one test each) verifying the distinctive commands:
   ```ts
   it('python project emits pytest and ruff', () => {
     const r = generateCIConfig({ platform: 'github', language: 'python' });
     if (!r.ok) return;
     expect(r.value.content).toContain('setup-python');
     expect(r.value.content).toContain('ruff check .');
     expect(r.value.content).toContain('pytest');
   });
   it('go project emits go test and golangci-lint', () => {
     const r = generateCIConfig({ platform: 'github', language: 'go' });
     if (!r.ok) return;
     expect(r.value.content).toContain('go build ./...');
     expect(r.value.content).toContain('golangci-lint run');
     expect(r.value.content).toContain('go test ./...');
   });
   it('rust project emits cargo build/clippy/test', () => {
     const r = generateCIConfig({ platform: 'github', language: 'rust' });
     if (!r.ok) return;
     expect(r.value.content).toContain('cargo build');
     expect(r.value.content).toContain('cargo clippy');
     expect(r.value.content).toContain('cargo test');
   });
   it('java project emits mvn verify', () => {
     const r = generateCIConfig({ platform: 'github', language: 'java' });
     if (!r.ok) return;
     expect(r.value.content).toContain('setup-java');
     expect(r.value.content).toContain('mvn -B verify');
   });
   it('unknown language falls back to TypeScript defaults', () => {
     const r = generateCIConfig({ platform: 'github', language: 'cobol' });
     if (!r.ok) return;
     expect(r.value.content).toContain('pnpm test');
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe pass (generator already supports these from Task 1/2).
3. Run: `nvm use 22 && pnpm harness validate`
4. Commit: `test(ci): cover per-language CI generation`

### Task 4: Verify GitLab/generic generators unchanged (regression guard)

**Depends on:** Task 3 | **Files:** `packages/cli/tests/ci/init.test.ts`

1. Confirm the existing GitLab and generic tests still pass and that passing `language` does not alter their output. Add a guard test:
   ```ts
   it('language option does not affect gitlab/generic output', () => {
     const g1 = generateCIConfig({ platform: 'gitlab' });
     const g2 = generateCIConfig({ platform: 'gitlab', language: 'python' });
     if (!g1.ok || !g2.ok) return;
     expect(g2.value.content).toBe(g1.value.content);
     const s1 = generateCIConfig({ platform: 'generic' });
     const s2 = generateCIConfig({ platform: 'generic', language: 'go' });
     if (!s1.ok || !s2.ok) return;
     expect(s2.value.content).toBe(s1.value.content);
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe pass.
3. Run: `nvm use 22 && pnpm harness validate`
4. Commit: `test(ci): guard gitlab/generic generators against language option`

### Task 5: Retire the gate-only `harness.yml` filename → `ci.yml` (TDD)

**Depends on:** Task 4 | **Files:** `packages/cli/tests/ci/init.test.ts`, `packages/cli/src/commands/ci/init.ts`

1. Update the existing filename assertion in `packages/cli/tests/ci/init.test.ts` from `.github/workflows/harness.yml` to `.github/workflows/ci.yml`:
   ```ts
   expect(result.value.filename).toBe('.github/workflows/ci.yml');
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe failure.
3. In `packages/cli/src/commands/ci/init.ts`, change the `github` generator entry filename from `.github/workflows/harness.yml` to `.github/workflows/ci.yml`. The `github` generator's `generate` must now pass `language`; since the `generators` record's `generate` signature is `(skip: string) => string`, adapt `generateCIConfig` so the GitHub branch calls `generateGitHubActions(skipFlag, language)` directly (special-case github, or widen the record's generate type to accept an optional language).
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe pass.
5. Run: `nvm use 22 && pnpm harness validate`
6. Commit: `feat(ci): write .github/workflows/ci.yml and retire harness.yml`

### Task 6: Thread `language` through `harness ci init` action (TDD)

**Depends on:** Task 5 | **Files:** `packages/cli/tests/ci/init.test.ts`, `packages/cli/src/commands/ci/init.ts`

1. The `harness ci init` command (`createInitCommand` / `runInitAction` in `ci/init.ts`) does not pass `language`. Add a unit test asserting `generateCIConfig` is reachable with a language through the command's option plumbing. Since `runInitAction` writes to disk, instead test the option-resolution helper. Add a `--language` option to the command and a test that resolving opts produces the expected `configOpts.language`. Minimal test: assert the command registers a `--language` option:
   ```ts
   import { createInitCommand } from '../../src/commands/ci/init';
   it('ci init command accepts --language', () => {
     const cmd = createInitCommand();
     const opt = cmd.options.find((o) => o.long === '--language');
     expect(opt).toBeDefined();
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe failure.
3. In `ci/init.ts`: add `.option('--language <language>', 'Project language for build/lint/test steps')` to `createInitCommand`; in `runInitAction`, read `opts.language` and set `configOpts.language = opts.language` when present. `detectPlatform()` already defaults platform.
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts` — observe pass.
5. Run: `nvm use 22 && pnpm harness validate`
6. Commit: `feat(ci): accept --language on harness ci init`

### Task 7: Classify `.github/workflows/ci.yml` as harness-managed (TDD)

**Depends on:** Task 6 | **Files:** `packages/cli/tests/integration/init.test.ts` (or a new engine unit test), `packages/cli/src/templates/engine.ts`

1. Add a unit test asserting the engine treats the CI workflow as a harness-managed file so existing-project mode does not skip it. In `packages/cli/tests/integration/init.test.ts` add:
   ```ts
   import { TemplateEngine } from '../../src/templates/engine';
   it('writes ci.yml in existing-project mode', () => {
     const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ci-existing-'));
     fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x"}'); // existing-project marker
     const engine = new TemplateEngine(require('../../src/utils/paths').resolveTemplatesDir());
     const res = engine.write(
       { files: [{ relativePath: '.github/workflows/ci.yml', content: 'name: CI\n' }] } as any,
       tmp,
       { overwrite: false, existingProject: true }
     );
     expect(res.ok).toBe(true);
     expect(fs.existsSync(path.join(tmp, '.github/workflows/ci.yml'))).toBe(true);
     fs.rmSync(tmp, { recursive: true });
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/integration/init.test.ts` — observe failure (existing-project gate skips non-config file).
3. In `packages/cli/src/templates/engine.ts`, add `.github/workflows/ci.yml` to the `HARNESS_CONFIG_FILES` set (line ~70) so `isHarnessConfigFile` returns true and the existing-project branch (line 307) does not `continue` past it. Non-overwrite (line 323) is unchanged and still protects an existing file.
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/integration/init.test.ts` — observe pass.
5. Run: `nvm use 22 && pnpm harness validate`
6. Commit: `feat(init): classify CI workflow as a harness-managed file`

### Task 8: Wire `generateCIConfig` into `scaffoldProject` write set (TDD)

**Depends on:** Task 7 | **Files:** `packages/cli/tests/integration/init.test.ts`, `packages/cli/src/commands/init.ts`

1. Add an integration test that a fresh `runInit` produces `.github/workflows/ci.yml` with the gate:
   ```ts
   it('init writes .github/workflows/ci.yml with build/lint/test + gate', async () => {
     const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-ci-'));
     const r = await runInit({ cwd: tmp, name: 'ci-proj', level: 'basic' });
     expect(r.ok).toBe(true);
     const wf = path.join(tmp, '.github/workflows/ci.yml');
     expect(fs.existsSync(wf)).toBe(true);
     const c = fs.readFileSync(wf, 'utf-8');
     expect(c).toContain('harness ci check --json');
     expect(c).toContain('pnpm test');
     expect(c).not.toMatch(/git push/);
     fs.rmSync(tmp, { recursive: true });
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/integration/init.test.ts` — observe failure.
3. In `packages/cli/src/commands/init.ts`, inside `scaffoldProject`, before calling `engine.write(...)`, import and call `generateCIConfig` (from `./ci/init`) with `{ platform: 'github', ...(language && { language }) }`, then push the generated file into `renderResult.value.files` as `{ relativePath: result.value.filename, content: result.value.content }` (guard `result.ok`). Because `.github/workflows/ci.yml` is now harness-managed (Task 7), `engine.write` emits it in both fresh and existing-project mode and skips it when the file already exists. Detect platform via the existing `detectPlatform` if exported, else default to `'github'` per D5 (export `detectPlatform` from `ci/init.ts` if needed — small, keep it minimal).
4. Run: `nvm use 22 && npx vitest run packages/cli/tests/integration/init.test.ts` — observe pass.
5. Run: `nvm use 22 && pnpm harness validate && pnpm harness check-deps`
6. Commit: `feat(init): write CI workflow on scaffold via the single generator`

### Task 9: Integration test — existing-workflow non-overwrite + language-driven steps (TDD) `[checkpoint:human-verify]`

**Depends on:** Task 8 | **Files:** `packages/cli/tests/integration/init.test.ts`

1. Add two tests:
   ```ts
   it('does not overwrite an existing ci.yml', async () => {
     const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-ci-keep-'));
     fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
     fs.writeFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'name: Hand-tuned\n');
     await runInit({ cwd: tmp, name: 'keep', level: 'basic' });
     expect(fs.readFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'utf-8')).toBe(
       'name: Hand-tuned\n'
     );
     fs.rmSync(tmp, { recursive: true });
   });
   it('language drives the generated steps (python)', async () => {
     const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-ci-py-'));
     await runInit({ cwd: tmp, name: 'py', language: 'python' });
     const c = fs.readFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'utf-8');
     expect(c).toContain('pytest');
     fs.rmSync(tmp, { recursive: true });
   });
   ```
2. Run: `nvm use 22 && npx vitest run packages/cli/tests/integration/init.test.ts` — observe pass (behavior delivered by Tasks 7-8).
3. Run the full CI-related suites: `nvm use 22 && npx vitest run packages/cli/tests/ci/init.test.ts packages/cli/tests/integration/init.test.ts packages/cli/tests/commands/init.test.ts`
4. Run: `nvm use 22 && pnpm harness validate`
5. [checkpoint:human-verify] Show the generated `ci.yml` for a TS and a Python project (`runInit` into a tmp dir and print). Confirm with the requester that the YAML is well-formed and the step order matches the spec before proceeding to docs.
6. Commit: `test(init): cover non-overwrite and language-driven CI generation`

### Task 10: Documentation update — CI ships on init

**Depends on:** Task 9 | **Files:** `docs/standard/implementation.md` | **Category:** integration

1. In `docs/standard/implementation.md`, update the CI section to state that `harness init` now writes `.github/workflows/ci.yml` (build + lint + test + `harness ci check`) automatically for new and existing projects, never overwriting an existing workflow; `harness ci init` remains the on-demand path through the same generator. Note that `harness.yml` is retired in favor of `ci.yml`. Keep edits scoped to the CI subsection.
2. Run: `nvm use 22 && pnpm harness validate`
3. Commit: `docs(standard): CI workflow now ships on harness init`

### Task 11: ADR for single-generator consolidation (D1)

**Depends on:** Task 10 | **Files:** `docs/knowledge/decisions/NNNN-single-ci-generator.md` | **Category:** integration

1. Determine the next ADR number: `ls docs/knowledge/decisions/ | sort | tail -3` and pick the next zero-padded integer.
2. Create `docs/knowledge/decisions/NNNN-single-ci-generator.md` recording D1: scaffold-time generation (`harness init`) and on-demand generation (`harness ci init`) share one source (`generateCIConfig`); no parallel `templates/ci/` generator. Capture context (drift is the entropy STRATEGY exists to prevent), decision, consequences (GitLab/generic stay simple; future language enrichment is one place), and links to roadmap #540, #525 (no auto-baseline step), #541 (required-review, separate). Match the existing ADR template structure in that directory.
3. Run: `nvm use 22 && pnpm harness validate`
4. Commit: `docs(adr): single CI generator for init and ci init`
