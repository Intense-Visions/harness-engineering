# Plan: required-review-ci Phase 3 — `harness review-ci` CLI command

**Date:** 2026-06-24 | **Spec:** docs/changes/required-review-ci/proposal.md (Component A, D3/D6/D7/D8) | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium

## Goal

Ship a `harness review-ci` CLI command in `packages/cli` that resolves a git diff, invokes the already-committed core `runCiReview` orchestrator (with the `local` runner's openai-compatible provider adapter injected as `localInvoke`), prints the verdict to stdout, optionally writes verdict JSON, and propagates the orchestrator's exit code.

## Scope boundary

IN: the CLI command, argv parsing, diff resolution, `local` provider adapter, output + exit-code propagation, command registration, AGENTS/docs regen, CLI tests.
OUT (later phases): `templates/ci/*.hbs`, ruleset JSON (Phase 4), dogfood + ADRs + knowledge graph (Phase 5). Full PR-comment-posting integration is explicitly minimized/stubbed this phase (see Task 6).

## Verified facts (evidence)

- Core surface (packages/core/src/review/ci/index.ts): exports `runCiReview`, `RunCiReviewOptions`, `CiReviewResult`, `CiBlockOn`, `LocalEndpointInvoke`, `RunnerId`, `isSupportedRunner`, `RUNNER_PRESETS`. `parseDiff` is exported from core via `packages/core/src/feedback/index.ts:59`.
- `RunCiReviewOptions` (orchestrator.ts:42-61): `{ projectRoot, diff: DiffInfo, commitMessage?, runner?: RunnerId, blockOn?: CiBlockOn, env?, execFile?, execTimeoutMs?, execMaxStdoutBytes?, localInvoke?: LocalEndpointInvoke }`. Returns `CiReviewResult { verdict, exitCode, terminalOutput, llmSkipReason?, ranLlmTier }`.
- `DiffInfo` (review/types/context.ts:96-107): `{ changedFiles, newFiles, deletedFiles, totalDiffLines, fileDiffs: Map<string,string> }`. Build pattern is established in packages/cli/src/mcp/tools/review-pipeline.ts:99-112 (`parseDiff(raw)` → `codeChanges.files` with `path`/`status`/`diff`).
- `LocalEndpointInvoke` (runner-presets.ts:40-50): `(opts: { endpoint, model, instruction, diff }) => Promise<string>`. The orchestrator resolves `endpoint`/`model` from env (`HARNESS_LOCAL_ENDPOINT`/`HARNESS_LOCAL_MODEL`, orchestrator.ts:273-274) and calls `localInvoke`; the returned string is fed to `parseLocalVerdict`.
- `parseLocalVerdict` (parsers/local.ts) expects a JSON string `{ assessment, findings: ReviewFinding[] }` — i.e. the re-serialized `result` of an `AnalysisResponse`.
- `OpenAICompatibleAnalysisProvider` (packages/intelligence/src/analysis-provider/openai-compatible.ts:38-53): constructor `{ apiKey, baseUrl, defaultModel?, timeoutMs?, promptSuffix?, jsonMode? }`; method `analyze<T>({ prompt, systemPrompt?, responseSchema: z.ZodType, model?, maxTokens? }) => Promise<AnalysisResponse<T>>` where `AnalysisResponse = { result: T, tokenUsage, model, latencyMs }`.
- `ReviewFinding` shape (review/types/fan-out.ts:45-63): `{ id, file, lineRange:[number,number], domain: ReviewDomain, severity: 'critical'|'important'|'suggestion', title, rationale, suggestion?, evidence: string[] }`. `ReviewDomain = 'compliance'|'bug'|'security'|'architecture'|'learnings'` (context.ts:20).
- cli ALREADY depends on `@harness-engineering/intelligence` (packages/cli/package.json:60, and imported in knowledge-pipeline.ts etc.). No new dep, no new layer edge.
- Command framework: each command file exports `createXCommand(): Command` (commander). The barrel `packages/cli/src/commands/_registry.ts` is AUTO-GENERATED via `pnpm run generate-barrel-exports`; registration = create file + run generator. `harness review-ci` is a TOP-LEVEL command (the `ci` subcommand group is unrelated existing `ci check/init/notify`).
- Test convention: `packages/cli/tests/commands/<name>.test.ts`; preferred pattern (check-arch.test.ts) is a pure exported `runX(options)` (no `process.exit`, returns a result) tested with injected seams, plus thin assertions on `createXCommand()` option wiring.
- ExitCode (utils/errors.ts): `SUCCESS=0`, `VALIDATION_FAILED=1`. The command MUST propagate the orchestrator's `result.exitCode` directly rather than re-deriving.
- Docs gates: `generate:barrels:check` and `generate:plugin:check` run in CI; `generate-docs` exists. AGENTS.md command list is maintained by these generators.
- Core `runCiReview` does NOT post PR comments (orchestrator.ts:305 passes `comment:false`); `--comment` is wholly a CLI concern → minimized this phase.

## Observable Truths (Acceptance Criteria)

1. `harness review-ci --help` lists options `--runner`, `--block-on`, `--diff`, `--comment`, `--json`.
2. **[Event-driven]** When `runReviewCi` is invoked with a resolved diff and no `--runner`, the system shall call `runCiReview` with `runner` undefined and return its `CiReviewResult` unchanged (floor-only).
3. **[Event-driven]** When `--runner local` is set, the system shall pass a `localInvoke` adapter into `runCiReview` that constructs `OpenAICompatibleAnalysisProvider` and returns the provider result as a JSON string parseable by `parseLocalVerdict`.
4. **[Ubiquitous]** The command shall print `result.terminalOutput` to stdout and exit with `process.exit(result.exitCode)`.
5. **[Event-driven]** When `--json <path>` is given, the system shall write `JSON.stringify(result.verdict)` to that path.
6. **[State-driven]** While `--diff` is omitted, the system shall resolve the range `origin/<baseBranch>...HEAD` (baseBranch resolved via git) into a raw diff string and parse it via `parseDiff`.
7. `review-ci` appears in `packages/cli/src/commands/_registry.ts` after running the barrel generator, and `generate:barrels:check` + `generate:plugin:check` pass.
8. `npx vitest run packages/cli/tests/commands/review-ci.test.ts` passes (argv wiring, diff resolution mocked, runner selection, exit-code propagation, local adapter wiring with mocked provider).
9. `harness validate` passes with NO new circular dependency in `packages/cli` and no new arch-baseline regression.

## File Map

- CREATE `packages/cli/src/commands/review-ci.ts`
- CREATE `packages/cli/src/commands/review-ci-local-adapter.ts` (the openai-compatible → `LocalEndpointInvoke` adapter, isolated to keep `review-ci.ts` complexity under threshold and confine the intelligence import)
- CREATE `packages/cli/tests/commands/review-ci.test.ts`
- CREATE `packages/cli/tests/commands/review-ci-local-adapter.test.ts`
- MODIFY `packages/cli/src/commands/_registry.ts` (regenerated, not hand-edited)
- MODIFY `AGENTS.md` (regenerated via docs/plugin generators)
- (regenerated) plugin/slash-command artifacts via `generate:plugin`

## Skeleton

1. Diff resolution + DiffInfo helper (~2 tasks, ~9 min)
2. Local provider adapter (`LocalEndpointInvoke`) with TDD (~1 task, ~5 min)
3. Core `runReviewCi` orchestration function + CLI wrapper (~2 tasks, ~10 min)
4. Output, `--json`, `--comment` stub, exit-code propagation (~1 task, ~4 min)
5. Registration + docs regen (~2 tasks, ~6 min)
6. Validation + soundness (~1 task, ~4 min)

**Estimated total:** 9 tasks, ~38 minutes. _Skeleton approval gate: presented to human before full expansion (standard rigor, 9 tasks ≥ 8)._

## Skill annotations

- `ts-zod-integration` (reference) — the `local` adapter's `responseSchema` (Task 3).
- `ts-type-guards` / `ts-utility-types` (reference) — runner-id narrowing against `isSupportedRunner` (Task 4).
- `ts-testing-types` (reference) — typed mocks for the provider + `parseDiff` seams (Tasks 3, 7).

## Uncertainties

- [ASSUMPTION] Base branch resolves via `git symbolic-ref refs/remotes/origin/HEAD` → fallback `main`. If absent in CI, the user passes `--diff` explicitly. Documented in Task 1.
- [ASSUMPTION] The `local` adapter sends `apiKey: process.env.HARNESS_LOCAL_API_KEY ?? 'local'` (many local servers accept any string; provider requires a non-empty `apiKey`). Stated in Task 3.
- [DEFERRABLE] Exact wording of the LLM-tier-skipped line — owned by core `terminalOutput`; CLI only prints it.
- [DEFERRABLE] `--comment` full gh PR-review posting — minimized to a stub + warning this phase (Task 6); core does not post.

## Tasks

### Task 1: Add diff-resolution helper (range → raw diff string)

**Depends on:** none | **Files:** `packages/cli/src/commands/review-ci.ts`, `packages/cli/tests/commands/review-ci.test.ts`

1. Create `packages/cli/tests/commands/review-ci.test.ts` with a test for an exported `resolveDiffRange(opts)` that, given an injected `runGit` seam, returns `origin/<base>...HEAD` when `range` is omitted and the literal range when provided:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { resolveDiffRange } from '../../src/commands/review-ci';

   describe('resolveDiffRange', () => {
     it('uses provided range verbatim', () => {
       const runGit = vi.fn();
       expect(resolveDiffRange({ range: 'a...b', runGit })).toBe('a...b');
       expect(runGit).not.toHaveBeenCalled();
     });
     it('defaults to origin/<base>...HEAD using resolved base branch', () => {
       const runGit = vi.fn().mockReturnValue('refs/remotes/origin/main');
       expect(resolveDiffRange({ runGit })).toBe('origin/main...HEAD');
     });
     it('falls back to origin/main...HEAD when base cannot be resolved', () => {
       const runGit = vi.fn(() => {
         throw new Error('no upstream');
       });
       expect(resolveDiffRange({ runGit })).toBe('origin/main...HEAD');
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/commands/review-ci.test.ts` — observe failure (module/export missing).
3. Create `packages/cli/src/commands/review-ci.ts` with the helper. Use `execFileSync('git', [...])` (NO shell) via an injectable `runGit` seam defaulting to a real git call:

   ```ts
   import { execFileSync } from 'node:child_process';

   export type RunGit = (args: string[]) => string;

   const defaultRunGit: RunGit = (args) =>
     execFileSync('git', args, { encoding: 'utf-8' }).toString().trim();

   export function resolveDiffRange(opts: {
     range?: string;
     cwd?: string;
     runGit?: RunGit;
   }): string {
     if (opts.range) return opts.range;
     const runGit = opts.runGit ?? defaultRunGit;
     let base = 'main';
     try {
       const ref = runGit(['symbolic-ref', 'refs/remotes/origin/HEAD']);
       const m = ref.match(/origin\/(.+)$/);
       if (m) base = m[1];
     } catch {
       // fall back to main
     }
     return `origin/${base}...HEAD`;
   }
   ```

4. Run: `npx vitest run packages/cli/tests/commands/review-ci.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add review-ci diff-range resolver`

### Task 2: Add raw-diff → DiffInfo builder (reuse core parseDiff)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/review-ci.ts`, `packages/cli/tests/commands/review-ci.test.ts`

1. Add a test for an exported `buildDiffInfo(rawDiff: string)` mirroring review-pipeline.ts:99-112, asserting `changedFiles`, `newFiles` (status `added`), `deletedFiles` (status `deleted`), and `fileDiffs` Map entries from a small two-file fixture diff string. Mock `parseDiff` via `vi.mock('@harness-engineering/core', ...)` returning `{ ok: true, value: { files: [{path,status,diff}] } }`.
2. Run vitest — observe failure.
3. Implement `buildDiffInfo` in `review-ci.ts`:

   ```ts
   import { parseDiff } from '@harness-engineering/core';
   import type { DiffInfo } from '@harness-engineering/core';

   export function buildDiffInfo(rawDiff: string): DiffInfo {
     const parsed = parseDiff(rawDiff);
     if (!parsed.ok) throw new Error(`Failed to parse diff: ${parsed.error.message}`);
     const files = parsed.value.files;
     return {
       changedFiles: files.map((f) => f.path),
       newFiles: files.filter((f) => f.status === 'added').map((f) => f.path),
       deletedFiles: files.filter((f) => f.status === 'deleted').map((f) => f.path),
       totalDiffLines: rawDiff.split('\n').length,
       fileDiffs: new Map(files.map((f) => [f.path, f.diff ?? ''])),
     };
   }
   ```

   (Confirm `DiffInfo` is exported from core; if not, import the type from the same path review-pipeline uses, or inline the structural type.)

4. Run vitest — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): build DiffInfo for review-ci via core parseDiff`

### Task 3: Local openai-compatible → LocalEndpointInvoke adapter (TDD)

**Depends on:** none | **Files:** `packages/cli/src/commands/review-ci-local-adapter.ts`, `packages/cli/tests/commands/review-ci-local-adapter.test.ts`
**Skills:** `ts-zod-integration` (reference), `ts-testing-types` (reference)

1. Create `packages/cli/tests/commands/review-ci-local-adapter.test.ts`. Mock `OpenAICompatibleAnalysisProvider` so its `analyze` resolves `{ result: { assessment: 'request-changes', findings: [...one valid ReviewFinding...] }, tokenUsage, model, latencyMs }`. Assert that the adapter:
   - constructs the provider with `baseUrl === endpoint`, `defaultModel === model`;
   - calls `analyze` with a `prompt` containing both `instruction` and `diff` and a `responseSchema`;
   - returns a JSON **string** that `JSON.parse` yields `{ assessment, findings }`, i.e. is consumable by core `parseLocalVerdict`.

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   vi.mock('@harness-engineering/intelligence', () => ({
     OpenAICompatibleAnalysisProvider: vi.fn().mockImplementation((opts) => ({
       _opts: opts,
       analyze: vi.fn().mockResolvedValue({
         result: { assessment: 'request-changes', findings: [] },
         tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
         model: 'm',
         latencyMs: 1,
       }),
     })),
   }));
   import { createLocalInvoke } from '../../src/commands/review-ci-local-adapter';

   describe('createLocalInvoke', () => {
     it('returns provider result as a parseLocalVerdict-compatible JSON string', async () => {
       const invoke = createLocalInvoke();
       const raw = await invoke({
         endpoint: 'http://x/v1',
         model: 'm',
         instruction: 'review',
         diff: 'DIFF',
       });
       expect(JSON.parse(raw)).toMatchObject({ assessment: 'request-changes' });
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/commands/review-ci-local-adapter.test.ts` — observe failure.
3. Create `packages/cli/src/commands/review-ci-local-adapter.ts`:

   ```ts
   import { z } from 'zod';
   import { OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence';
   import type { LocalEndpointInvoke } from '@harness-engineering/core';

   const FindingSchema = z.object({
     id: z.string(),
     file: z.string(),
     lineRange: z.tuple([z.number(), z.number()]),
     domain: z.enum(['compliance', 'bug', 'security', 'architecture', 'learnings']),
     severity: z.enum(['critical', 'important', 'suggestion']),
     title: z.string(),
     rationale: z.string(),
     suggestion: z.string().optional(),
     evidence: z.array(z.string()),
   });
   const LocalVerdictSchema = z.object({
     assessment: z.enum(['approve', 'comment', 'request-changes']),
     findings: z.array(FindingSchema),
   });

   export function createLocalInvoke(): LocalEndpointInvoke {
     return async ({ endpoint, model, instruction, diff }) => {
       const provider = new OpenAICompatibleAnalysisProvider({
         apiKey: process.env.HARNESS_LOCAL_API_KEY ?? 'local',
         baseUrl: endpoint,
         defaultModel: model,
       });
       const { result } = await provider.analyze({
         prompt: `${instruction}\n\n---\nDIFF UNDER REVIEW:\n${diff}`,
         responseSchema: LocalVerdictSchema,
         model,
       });
       return JSON.stringify(result);
     };
   }
   ```

   (Verify `OpenAICompatibleAnalysisProvider` is re-exported from the `@harness-engineering/intelligence` package barrel; if it is only at a subpath, import the exact path the package exposes — confirm via the package's `exports`/`index`.)

4. Run vitest — observe pass.
5. Run: `harness validate` (confirm no new cli→intelligence cycle; the dep already exists).
6. Commit: `feat(cli): add local openai-compatible adapter for review-ci`

### Task 4: Pure `runReviewCi` orchestration function (TDD — runner selection + exit code)

**Depends on:** Task 2, Task 3 | **Files:** `packages/cli/src/commands/review-ci.ts`, `packages/cli/tests/commands/review-ci.test.ts`
**Skills:** `ts-type-guards` (reference)

1. Add tests for an exported async `runReviewCi(options)` with injected seams `{ runCiReviewImpl, localInvoke, runGit, resolveRaw }` (defaults wire to real impls). Assert:
   - floor-only: no `--runner` → `runCiReviewImpl` called with `runner: undefined` and NO `localInvoke`;
   - `runner: 'local'` → `runCiReviewImpl` called with a `localInvoke` function;
   - `runner: 'claude'` → called with `runner:'claude'` and NO `localInvoke` (agent-cli uses default execFile seam);
   - return value carries `result.exitCode` through unchanged (e.g. mock returns `exitCode: 1` → `runReviewCi` result `.exitCode === 1`);
   - mock `runCiReviewImpl` so NO real CLI/endpoint/git is spawned (also mock `resolveRaw` to return a fixed diff string).
2. Run vitest — observe failure.
3. Implement `runReviewCi` in `review-ci.ts` (pure, NO `process.exit`):

   ```ts
   import {
     runCiReview,
     type RunCiReviewOptions,
     type CiReviewResult,
     type CiBlockOn,
   } from '@harness-engineering/core';
   import { createLocalInvoke } from './review-ci-local-adapter';

   export interface ReviewCiOptions {
     cwd?: string;
     runner?: string;
     blockOn?: CiBlockOn;
     diffRange?: string;
     // seams for tests:
     runCiReviewImpl?: (o: RunCiReviewOptions) => Promise<CiReviewResult>;
     localInvoke?: RunCiReviewOptions['localInvoke'];
     runGit?: RunGit;
     resolveRaw?: (range: string, cwd: string, runGit: RunGit) => string;
   }

   function defaultResolveRaw(range: string, cwd: string, runGit: RunGit): string {
     return runGit(['diff', range]); // execFileSync seam; range like origin/main...HEAD
   }

   export async function runReviewCi(opts: ReviewCiOptions): Promise<CiReviewResult> {
     const cwd = opts.cwd ?? process.cwd();
     const runGit = opts.runGit ?? defaultRunGit;
     const range = resolveDiffRange({ range: opts.diffRange, cwd, runGit });
     const rawDiff = (opts.resolveRaw ?? defaultResolveRaw)(range, cwd, runGit);
     const diff = buildDiffInfo(rawDiff);
     const runner = opts.runner as RunCiReviewOptions['runner'] | undefined;
     const callOpts: RunCiReviewOptions = {
       projectRoot: cwd,
       diff,
       ...(runner ? { runner } : {}),
       ...(opts.blockOn ? { blockOn: opts.blockOn } : {}),
       ...(runner === 'local' ? { localInvoke: opts.localInvoke ?? createLocalInvoke() } : {}),
     };
     return (opts.runCiReviewImpl ?? runCiReview)(callOpts);
   }
   ```

   Note: `defaultResolveRaw` uses `git diff <range>` via the same injectable seam — keeps spawning testable. For `--runner local`, inject the adapter; agent-cli runners rely on core's default `execFile` seam (no injection).

4. Run vitest — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add runReviewCi orchestration with runner selection`

### Task 5: Output, `--json`, exit-code propagation, `--comment` stub + commander wrapper (TDD)

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/review-ci.ts`, `packages/cli/tests/commands/review-ci.test.ts`

1. Add tests:
   - `createReviewCiCommand()` exposes options `--runner`, `--block-on`, `--diff`, `--comment`, `--json` and name `review-ci`;
   - an exported `emitReviewCi(result, { jsonPath?, comment? }, writeFile?, log?)` writes `JSON.stringify(result.verdict)` to `jsonPath` when given (assert via injected `writeFile` mock), prints `result.terminalOutput`, and when `comment` is true logs the documented stub warning (assert substring "comment posting is not yet wired").
2. Run vitest — observe failure.
3. Implement in `review-ci.ts`:

   ```ts
   import { Command } from 'commander';
   import { writeFileSync } from 'node:fs';
   import { logger } from '../output/logger';

   export function emitReviewCi(
     result: CiReviewResult,
     opts: { jsonPath?: string; comment?: boolean },
     writeFile: (p: string, d: string) => void = (p, d) => writeFileSync(p, d),
     log: (m: string) => void = (m) => process.stdout.write(m + '\n')
   ): void {
     log(result.terminalOutput);
     if (opts.jsonPath) writeFile(opts.jsonPath, JSON.stringify(result.verdict, null, 2));
     if (opts.comment) {
       logger.warn(
         'review-ci: --comment posting is not yet wired (Phase 3 stub). ' +
           'Verdict JSON is available via --json; PR-review posting lands in a later phase.'
       );
     }
   }

   export function createReviewCiCommand(): Command {
     return new Command('review-ci')
       .description('Run the tiered code-review gate (floor + optional LLM runner) for CI')
       .option(
         '--runner <runner>',
         'claude | gemini | codex | cursor | antigravity | local (omit = floor-only)'
       )
       .option('--block-on <level>', 'critical | request-changes | none', 'request-changes')
       .option('--diff <range>', 'git range (default: origin/<base>...HEAD)')
       .option('--comment', 'post verdict as a PR review (stubbed in this phase)')
       .option('--json <path>', 'write the verdict artifact to this path')
       .action(async (opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const result = await runReviewCi({
           cwd: globalOpts.cwd,
           runner: opts.runner,
           blockOn: opts.blockOn,
           diffRange: opts.diff,
         });
         emitReviewCi(result, { jsonPath: opts.json, comment: opts.comment });
         process.exit(result.exitCode);
       });
   }
   ```

   Keep `process.exit` ONLY in the commander action (never in `runReviewCi`/`emitReviewCi`) so the pure functions stay testable. Confirm `logger` import path matches check-arch.ts (`../output/logger`).

4. Run vitest — observe pass.
5. Run: `harness validate` (check cli complexity stays under baseline; if `review-ci.ts` is flagged, the adapter is already split out — split further only if the arch gate complains).
6. Commit: `feat(cli): add review-ci command output, --json, and commander wrapper`

### Task 6: [checkpoint:human-verify] Validate `--comment` scope decision

**Depends on:** Task 5 | **Category:** integration | **Files:** none (review only)

1. Present to the human: core `runCiReview` does not post PR comments (orchestrator.ts:305 `comment:false`); no reusable gh PR-review helper exists in `packages/cli/src/commands` (agent/review delegates `comment` into the review pipeline flags, not a standalone poster). Phase 3 ships `--comment` as a stub + warning (Task 5).
2. [checkpoint:human-verify] Confirm this minimal scope is acceptable, or redirect to wire a follow-up issue for full gh PR-review posting. Do NOT block the phase on it.
3. No commit (decision checkpoint only).

### Task 7: Register the command (regenerate barrel)

**Depends on:** Task 5 | **Category:** integration | **Files:** `packages/cli/src/commands/_registry.ts`, `packages/cli/src/bin/harness.ts`

1. Confirm how generated commands are added to the program: inspect `packages/cli/src/bin/harness.ts` for where `_registry` exports are mounted (`program.addCommand(...)`). If the registry auto-mounts all `createXCommand` exports, no manual wiring is needed beyond regeneration; if `harness.ts` mounts commands explicitly, add `program.addCommand(createReviewCiCommand())` alongside the others.
2. Run: `pnpm run generate-barrel-exports` (regenerates `_registry.ts`). Do NOT hand-edit the generated file.
3. Run: `pnpm run generate:barrels:check` — observe pass.
4. Verify: `harness review-ci --help` (built CLI) lists all five options. (Run `pnpm --filter @harness-engineering/cli build` first if the local bin runs from dist.)
5. Run: `harness validate`
6. Commit: `chore(cli): register review-ci command in barrel`

### Task 8: Regenerate docs/plugin artifacts (AGENTS.md + slash commands)

**Depends on:** Task 7 | **Category:** integration | **Files:** `AGENTS.md`, generated plugin/slash-command artifacts

1. Run: `pnpm run generate:plugin:all` and `pnpm run generate-docs`.
2. Run: `pnpm run generate:plugin:check` — observe pass.
3. Verify `review-ci` appears in `AGENTS.md` command listing (if AGENTS.md is generator-owned). If AGENTS.md has a hand-maintained capability section, add a one-line entry describing `harness review-ci` (the tiered review CI gate).
4. Run: `harness validate`
5. Commit: `docs(cli): regenerate command docs for review-ci`

### Task 9: Final validation + soundness review

**Depends on:** Task 8 | **Files:** none

1. Run full suite: `npx vitest run packages/cli/tests/commands/review-ci.test.ts packages/cli/tests/commands/review-ci-local-adapter.test.ts` — all pass.
2. Run: `harness validate` — confirm NO new circular dependency in `packages/cli` (the two pre-existing cycles in drift/ and craft/llm/ are unchanged; the new files must not import in a way that creates a cycle).
3. Run: `harness check-deps` — confirm no new violations attributable to review-ci files.
4. Run: `pnpm --filter @harness-engineering/cli build` (or repo build) to confirm types compile against core's real exports.
5. Trace observable truths 1-9 → tasks; confirm each is covered.
6. Commit (if any generated/lint reformat occurred): `chore(cli): finalize review-ci phase 3`

## Sequencing & parallelism

- Task 3 (local adapter) is independent of Tasks 1-2 and can run in parallel.
- Tasks 1 → 2 → 4 → 5 are strictly sequential (build on the same file).
- Tasks 7 → 8 → 9 are integration/finalization, strictly after implementation.
- Checkpoint: Task 6 (human-verify on `--comment` scope).

## Concerns / risks

- **Arch gate fail-closed (#525):** new files must not introduce a `packages/cli` circular dependency or push the cli complexity metric past baseline. Mitigation: adapter is isolated in its own file; pure functions are small; `process.exit` confined to the commander action. Re-run `harness validate` per task.
- **`@harness-engineering/intelligence` barrel export:** the adapter assumes `OpenAICompatibleAnalysisProvider` is re-exported from the package root. Task 3 step 3 calls for verifying the exact export path before finalizing.
- **`DiffInfo` type export from core:** if not exported from the core barrel, import via the path review-pipeline.ts uses or inline the structural type (Task 2).
- **Stale core dist:** core `dist` did not contain `runCiReview` at planning time (source-only). Task 9 build step ensures the workspace builds core before the cli consumes it; ensure `pnpm build` (or core build) runs before `harness review-ci --help` in Task 7.
