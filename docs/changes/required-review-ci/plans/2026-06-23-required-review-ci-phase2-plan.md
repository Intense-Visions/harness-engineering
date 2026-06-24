# Plan: required-review-ci Phase 2 — Core orchestrator

**Date:** 2026-06-23 | **Spec:** `docs/changes/required-review-ci/proposal.md` (Component A, D1/D2/D3/D6/D7/D8) | **Tasks:** 6 | **Time:** ~26 min | **Integration Tier:** medium

## Goal

Build a tested, layer-clean core orchestrator function `runCiReview(options)` in `packages/core/src/review/ci/` that runs the heuristic floor, optionally runs a secret-gated LLM tier through injected spawn/endpoint seams, merges both into one `CiReviewVerdict` via the Phase 1 contract, applies a `--block-on` threshold, and returns a structured result — with full unit coverage for SC1–SC4 and no PR-comment/argv concerns (those are Phase 3).

## Observable Truths (Acceptance Criteria)

1. **SC1 (floor-only gates).** When `runCiReview` is called with no `runner`, it calls `runReviewPipeline({ projectRoot, diff, commitMessage, flags: { ci: true } })`, returns a `floor-only` verdict, and `result.exitCode` is non-zero when the floor mechanical-stops (`stoppedByMechanical: true`) or the floor assessment is `request-changes`; `0` on a clean floor. When the floor mechanical-stops, the LLM tier is NOT invoked (the injected `execFile`/`localInvoke` seam is never called) — short-circuit.
2. **SC2 (secret-gated + graceful skip, both env states).** With a supported `agent-cli` runner and its `secretEnvVar` present in `options.env`, the orchestrator invokes the injected `execFile` seam with the preset's `command`/`args`, pipes the diff to STDIN, parses stdout via the preset's `verdictParser`, and the result's `ranLlmTier` is `true`. With the secret absent (or runner unsupported, or no `localInvoke` for the endpoint runner), the orchestrator does NOT invoke the seam, records a clear `skipReason` ("LLM tier skipped — ...") in the result, runs the floor only, and does not throw.
3. **SC3 (anti-theatre threshold, incl. block-on none).** A merged verdict whose `assessment` meets/exceeds `blockOn` (default `request-changes`) yields `result.exitCode` non-zero; the same verdict under `blockOn: 'none'` yields `result.exitCode` `0`. When a runner was explicitly required but its LLM tier failed to execute (spawn/parse error), `result.exitCode` is non-zero regardless of assessment (anti-theatre: a required review that did not run is a failure), EXCEPT under `blockOn: 'none'` the assessment never blocks (but a required-runner execution failure still surfaces as non-zero — see Task 4 for the exact rule).
4. **SC4 (verdict normalization per runner).** For each supported runner (claude, codex, antigravity, local), feeding the REAL Phase 1 captured envelope (claude `.result`, codex JSONL, antigravity plain-text, local JSON) through the mocked seam yields a schema-valid `CiReviewVerdict` whose `runner` matches and whose findings merge with floor findings under the Phase 1 invariants (blocking == critical, exitCode/assessment consistency from `buildCiReviewVerdict`).
5. `npx vitest run tests/review/ci/orchestrator.test.ts` passes; `harness validate` passes; no `@harness-engineering/intelligence` import introduced in `packages/core`; no new dependency added.

## Key verified facts (evidence)

- `runReviewPipeline(options: RunPipelineOptions): Promise<ReviewPipelineResult>` — `packages/core/src/review/pipeline-orchestrator.ts:78`. `ReviewPipelineResult` (`packages/core/src/review/types/pipeline.ts:146`) has `skipped`, `stoppedByMechanical`, `assessment?` (undefined when skipped), `findings: ReviewFinding[]`, `terminalOutput`, `exitCode`. CI mode flag is `flags.ci` (`pipeline-orchestrator.ts:97`).
- `buildCiReviewVerdict(parts)` — `packages/core/src/review/ci/verdict-schema.ts:237` — validates findings FIRST, derives blocking/exitCode. `CiReviewVerdictParts` accepts `runner`, `ranLlmTier`, `assessment`, `findings: unknown`, `skipped?`, `skipReason?`.
- `CI_ASSESSMENTS = ['approve','comment','request-changes']` (`verdict-schema.ts:24`) — index order IS the severity ordering for the threshold.
- `RUNNER_PRESETS` + `isSupportedRunner` + `presetKind` — `packages/core/src/review/ci/runner-presets.ts:98,183,187`. `agent-cli` presets expose `secretEnvVar`, `headlessInvocation({instruction})→{command,args}`, `verdictParser`. `endpoint` preset (`local`) exposes `endpointEnvVar`, `modelEnvVar`, optional `invoke`, `verdictParser`. `LocalEndpointInvoke` and `HeadlessInvocation` types exported from `./runner-presets`.
- `node:child_process` is ALREADY used in core (`src/security/...`, `src/solutions/scan-candidates/git-scan.ts`, etc.) — no new dependency. `packages/core/package.json` deps do NOT include `@harness-engineering/intelligence` (confirmed) — must stay that way.
- Real fixtures exist: `packages/core/tests/review/ci/fixtures/{claude-verdict.json, codex-verdict.jsonl, antigravity-verdict.txt, local-verdict.json}`. claude fixture → `request-changes`+1 critical; antigravity → `approve`/empty; codex → `approve`/empty; local → `request-changes`/2 findings/1 blocking.
- Core barrel re-exports `./review` which re-exports `./ci` (`src/review/index.ts:157`) and `runReviewPipeline` (`:141`). New orchestrator export flows out automatically once added to `ci/index.ts`.

## File Map

- CREATE `packages/core/src/review/ci/orchestrator.ts` (the `runCiReview` function + `RunCiReviewOptions`/`CiReviewResult` types + threshold + seams)
- MODIFY `packages/core/src/review/ci/index.ts` (export `runCiReview`, `RunCiReviewOptions`, `CiReviewResult`, `ExecFileLike`)
- CREATE `packages/core/tests/review/ci/orchestrator.test.ts` (SC1–SC4 unit coverage; mocked seams; reuse real fixtures)

No other files. `runner-presets.ts`, `verdict-schema.ts`, parsers, and fixtures are reused as-is (Phase 1, committed, 53 tests green).

## Skeleton

1. Options/result types + injected seams + skeleton `runCiReview` (floor reuse, short-circuit) (~2 tasks, ~9 min)
2. LLM tier dispatch (agent-cli spawn seam + endpoint invoke seam) + merge + skip reasons (~1 task, ~5 min)
3. Threshold logic (`block-on` matrix incl. none + required-runner-failed) + barrel export (~1 task, ~4 min)
4. Full unit tests SC1–SC4 against real fixtures + validate/commit (~2 tasks, ~8 min)

_Skeleton approved: pending (standard rigor, 6 tasks < 8 threshold — skeleton optional but included for direction; proceed unless reviewer objects)._

## Uncertainties

- [ASSUMPTION] The diff passed to the LLM tier is `options.diff` rendered to a unified-diff string. The floor takes a `DiffInfo` object; the LLM seam needs the raw unified diff text. Plan: `RunCiReviewOptions.diff` is the `DiffInfo` (for the floor) and the orchestrator derives the STDIN diff string by joining `diff.fileDiffs` values (the same map the pipeline uses at `pipeline-orchestrator.ts:271`). If a caller already has the raw string, Phase 3 can pass it; for Phase 2 the join is sufficient and unit-tested. (If wrong, only Task 3's diff-string derivation changes.)
- [ASSUMPTION] The review instruction string for `headlessInvocation({instruction})` is a fixed constant in the orchestrator (e.g. "Run the harness code-review skill on the diff piped via STDIN and emit only the CiReviewVerdict JSON"). Exact wording is [DEFERRABLE] to execution; tests assert the seam receives SOME non-empty instruction, not exact text.
- [DEFERRABLE] `terminalOutput` summary format. Phase 2 returns a minimal multi-line summary (runner, ranLlmTier, assessment, exitCode, skipReason); Phase 3 owns human-facing formatting and `--comment`/`--json`.
- [RESOLVED] Floor `assessment` can be `undefined` (skipped). Orchestrator treats undefined floor assessment as `approve` (no findings) for merge purposes; `skipped`/`stoppedByMechanical` are handled explicitly before merge.

## Tasks

### Task 1: Define orchestrator option/result types + injected seams (no logic yet)

**Depends on:** none | **Files:** `packages/core/src/review/ci/orchestrator.ts`

1. Create `packages/core/src/review/ci/orchestrator.ts` with imports and types ONLY (no function body yet):

   ```ts
   import { execFile as nodeExecFile } from 'node:child_process';
   import type { DiffInfo } from '../types/context';
   import type { CiReviewVerdict } from './verdict-schema';
   import type { RunnerId, LocalEndpointInvoke } from './runner-presets';
   import { CI_ASSESSMENTS } from './verdict-schema';

   /** block-on threshold: an assessment level, or 'none' to never block on assessment. */
   export type CiBlockOn = (typeof CI_ASSESSMENTS)[number] | 'none';

   /**
    * Injected process-spawn seam. Defaults to a node:child_process-backed impl in
    * runCiReview; unit tests pass a mock so NO real CLI is ever spawned. Returns the
    * child's captured stdout. `stdin` is the unified diff piped to the process.
    */
   export type ExecFileLike = (
     command: string,
     args: string[],
     opts: { stdin: string; env: NodeJS.ProcessEnv }
   ) => Promise<{ stdout: string }>;

   export interface RunCiReviewOptions {
     projectRoot: string;
     /** DiffInfo for the floor; the orchestrator derives the STDIN diff string from fileDiffs. */
     diff: DiffInfo;
     commitMessage?: string;
     /** Omit for floor-only. */
     runner?: RunnerId;
     /** Default 'request-changes'. */
     blockOn?: CiBlockOn;
     /** Env used for secret-gating + passed to the spawn seam. Defaults to process.env. */
     env?: NodeJS.ProcessEnv;
     /** Injected spawn seam (agent-cli runners). Defaults to a node:child_process impl. */
     execFile?: ExecFileLike;
     /** Injected endpoint call (the `local` runner). No real provider is imported in core. */
     localInvoke?: LocalEndpointInvoke;
   }

   export interface CiReviewResult {
     verdict: CiReviewVerdict;
     exitCode: number;
     terminalOutput: string;
     /** Populated when the LLM tier did not run; undefined when it ran. */
     llmSkipReason?: string;
     ranLlmTier: boolean;
   }

   // Silence unused-import lint until Task 2/3 wire these.
   void nodeExecFile;
   ```

2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` (expect clean — types only)
3. Run: `harness validate`
4. Commit: `feat(review-ci): add core orchestrator option/result types and injected seams`

### Task 2: Implement the default execFile seam + floor reuse with short-circuit

**Depends on:** Task 1 | **Files:** `packages/core/src/review/ci/orchestrator.ts`

1. In `orchestrator.ts`, replace the `void nodeExecFile;` line with the default seam and add the skeleton `runCiReview` covering the FLOOR step and short-circuit. Import `runReviewPipeline` and merge helper:

   ```ts
   import { promisify } from 'node:util';
   import { runReviewPipeline } from '../pipeline-orchestrator';
   import { buildCiReviewVerdict } from './verdict-schema';
   import type { ReviewFinding } from '../types';

   const execFileAsync = promisify(nodeExecFile);

   /** Default spawn seam: pipes `stdin` to the child and resolves with stdout. */
   const defaultExecFile: ExecFileLike = async (command, args, opts) => {
     const child = nodeExecFile(command, args, { env: opts.env, maxBuffer: 1024 * 1024 * 64 });
     child.stdin?.end(opts.stdin);
     const stdout = await new Promise<string>((resolve, reject) => {
       let out = '';
       child.stdout?.on('data', (d) => (out += d));
       child.on('error', reject);
       child.on('close', (code) =>
         code === 0 ? resolve(out) : reject(new Error(`exited with code ${code}`))
       );
     });
     return { stdout };
   };
   void execFileAsync; // keep promisify import available; remove if unused at end
   ```

   Then the orchestrator's floor section (LLM tier stubbed as skipped for now, threshold in Task 4):

   ```ts
   /** Render the unified-diff string the LLM tier reads from STDIN. */
   function diffToStdin(diff: DiffInfo): string {
     return Array.from(diff.fileDiffs.values()).join('\n');
   }

   export async function runCiReview(options: RunCiReviewOptions): Promise<CiReviewResult> {
     const { projectRoot, diff, commitMessage = '', runner, blockOn = 'request-changes' } = options;

     // --- FLOOR ---
     const floor = await runReviewPipeline({
       projectRoot,
       diff,
       commitMessage,
       flags: { ci: true },
     });
     const floorFindings: ReviewFinding[] = floor.findings;
     const floorAssessment = floor.assessment ?? 'approve';

     // SHORT-CIRCUIT: mechanical stop never spends LLM tokens (matches pipeline Phase-2 stop).
     if (floor.stoppedByMechanical) {
       const verdict = buildCiReviewVerdict({
         runner: 'floor-only',
         ranLlmTier: false,
         assessment: floorAssessment,
         findings: floorFindings,
         skipped: false,
         skipReason: 'LLM tier skipped — floor mechanical-stop (short-circuit)',
       });
       return {
         verdict,
         exitCode: applyThreshold(verdict, blockOn, false), // applyThreshold added in Task 4
         terminalOutput: summarize(verdict), // summarize added in Task 4
         llmSkipReason: verdict.skipReason,
         ranLlmTier: false,
       };
     }

     // LLM TIER + MERGE + THRESHOLD added in Tasks 3 & 4. Temporary floor-only return:
     const verdict = buildCiReviewVerdict({
       runner: runner ?? 'floor-only',
       ranLlmTier: false,
       assessment: floorAssessment,
       findings: floorFindings,
     });
     return {
       verdict,
       exitCode: applyThreshold(verdict, blockOn, false),
       terminalOutput: summarize(verdict),
       ranLlmTier: false,
     };
   }
   ```

   NOTE: `applyThreshold` and `summarize` are referenced here but defined in Task 4. To keep the file compiling between tasks, add minimal stubs at the bottom now and flesh them out in Task 4:

   ```ts
   function applyThreshold(
     v: CiReviewVerdict,
     _blockOn: CiBlockOn,
     _requiredRunnerFailed: boolean
   ): number {
     return v.exitCode; // replaced in Task 4
   }
   function summarize(v: CiReviewVerdict): string {
     return `runner=${v.runner} ran-llm=${v.ranLlmTier} assessment=${v.assessment} exit=${v.exitCode}`;
   }
   ```

2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` (expect clean)
3. Run: `harness validate`
4. Commit: `feat(review-ci): floor reuse and mechanical short-circuit in orchestrator`

### Task 3: Implement LLM-tier dispatch (agent-cli spawn + endpoint invoke) and merge

**Depends on:** Task 2 | **Files:** `packages/core/src/review/ci/orchestrator.ts`

1. Add `RUNNER_PRESETS` import and replace the "temporary floor-only return" block (the section after the short-circuit) with LLM-tier dispatch + merge. Reuse `buildCiReviewVerdict` so Phase 1 invariants hold:

   ```ts
   import { RUNNER_PRESETS } from './runner-presets';

   // ... inside runCiReview, after the stoppedByMechanical short-circuit:

   const env = options.env ?? process.env;
   const execFile = options.execFile ?? defaultExecFile;

   let llmFindings: ReviewFinding[] = [];
   let ranLlmTier = false;
   let requiredRunnerFailed = false;
   let llmSkipReason: string | undefined;

   if (runner) {
     const preset = RUNNER_PRESETS[runner];
     if (preset.supported !== true) {
       llmSkipReason = `LLM tier skipped — runner '${runner}' is unsupported`;
     } else if (preset.kind === 'agent-cli') {
       if (!env[preset.secretEnvVar]) {
         llmSkipReason = `LLM tier skipped — secret ${preset.secretEnvVar} not set (floor-only)`;
       } else {
         try {
           const instruction =
             'Run the harness code-review skill on the unified diff piped via STDIN. ' +
             'Emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
           const { command, args } = preset.headlessInvocation({ instruction });
           const { stdout } = await execFile(command, args, { stdin: diffToStdin(diff), env });
           llmFindings = preset.verdictParser(stdout).findings;
           ranLlmTier = true;
         } catch (err) {
           requiredRunnerFailed = true;
           llmSkipReason = `LLM tier failed — ${(err as Error).message}`;
         }
       }
     } else {
       // endpoint runner ('local')
       const invoke = options.localInvoke ?? preset.invoke;
       const endpoint = env[preset.endpointEnvVar];
       const model = env[preset.modelEnvVar];
       if (!invoke || !endpoint || !model) {
         llmSkipReason =
           'LLM tier skipped — local endpoint not configured (no invoke seam or missing endpoint/model env)';
       } else {
         try {
           const instruction =
             'Review the unified diff and emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
           const raw = await invoke({ endpoint, model, instruction, diff: diffToStdin(diff) });
           llmFindings = preset.verdictParser(raw).findings;
           ranLlmTier = true;
         } catch (err) {
           requiredRunnerFailed = true;
           llmSkipReason = `LLM tier failed — ${(err as Error).message}`;
         }
       }
     }
   }

   // --- MERGE --- floor + LLM findings into one verdict (Phase 1 invariants enforced).
   const mergedFindings = [...floorFindings, ...llmFindings];
   const mergedAssessment = ranLlmTier
     ? maxAssessment(floorAssessment, deriveAssessment(mergedFindings))
     : floorAssessment;
   const verdict = buildCiReviewVerdict({
     runner: ranLlmTier ? (runner as RunnerId) : 'floor-only',
     ranLlmTier,
     assessment: mergedAssessment,
     findings: mergedFindings,
     ...(llmSkipReason ? { skipReason: llmSkipReason } : {}),
   });

   return {
     verdict,
     exitCode: applyThreshold(verdict, blockOn, requiredRunnerFailed),
     terminalOutput: summarize(verdict),
     ...(llmSkipReason ? { llmSkipReason } : {}),
     ranLlmTier,
   };
   ```

   Add the two assessment helpers near `summarize`/`applyThreshold` (derive from findings + take the more severe of two):

   ```ts
   function deriveAssessment(findings: ReviewFinding[]): CiReviewVerdict['assessment'] {
     if (findings.some((f) => f.severity === 'critical')) return 'request-changes';
     if (findings.some((f) => f.severity === 'important')) return 'comment';
     return 'approve';
   }
   function maxAssessment(
     a: CiReviewVerdict['assessment'],
     b: CiReviewVerdict['assessment']
   ): CiReviewVerdict['assessment'] {
     return CI_ASSESSMENTS.indexOf(a) >= CI_ASSESSMENTS.indexOf(b) ? a : b;
   }
   ```

   NOTE: `buildCiReviewVerdict` re-derives blocking/exitCode from `mergedFindings`; the explicit `mergedAssessment` must be consistent with the findings (it is, by construction — `deriveAssessment` mirrors `buildCiReviewVerdict`'s own severity logic). If the floor assessment is `request-changes` with zero critical findings (possible when the floor uses its own logic), the schema's superRefine would reject the mismatch — so use `deriveAssessment(mergedFindings)` as the authoritative value when `ranLlmTier`, and for floor-only keep `floorAssessment` ONLY when it is consistent: guard by recomputing `deriveAssessment(floorFindings)` and taking `maxAssessment(floorAssessment, deriveAssessment(floorFindings))`. Apply the same guard in the Task 2 floor-only/short-circuit returns (update those two `assessment: floorAssessment` lines to `assessment: maxAssessment(floorAssessment, deriveAssessment(floorFindings))`).

2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit`
3. Run: `harness validate`
4. Commit: `feat(review-ci): secret-gated LLM-tier dispatch and floor+LLM merge`

### Task 4: Implement threshold logic and terminal summary; export from barrel

**Depends on:** Task 3 | **Files:** `packages/core/src/review/ci/orchestrator.ts`, `packages/core/src/review/ci/index.ts`

1. Replace the stub `applyThreshold` and `summarize` with the real implementations:

   ```ts
   /**
    * Final exit code. Non-zero iff:
    *  - the verdict assessment meets/exceeds blockOn (assessment gate), OR
    *  - a runner was explicitly required but its LLM tier failed to execute.
    * blockOn 'none' disables the assessment gate, but a required-runner execution
    * FAILURE still blocks (a required review that errored is not a green check).
    */
   function applyThreshold(
     v: CiReviewVerdict,
     blockOn: CiBlockOn,
     requiredRunnerFailed: boolean
   ): number {
     if (requiredRunnerFailed) return 1;
     if (blockOn === 'none') return 0;
     const rank = (a: string) => CI_ASSESSMENTS.indexOf(a as CiReviewVerdict['assessment']);
     return rank(v.assessment) >= rank(blockOn) ? 1 : 0;
   }

   function summarize(v: CiReviewVerdict): string {
     const lines = [
       `runner: ${v.runner}`,
       `ranLlmTier: ${v.ranLlmTier}`,
       `assessment: ${v.assessment}`,
       `findings: ${v.findings.length} (blocking: ${v.blockingFindings.length})`,
       `exitCode: ${v.exitCode}`,
     ];
     if (v.skipReason) lines.push(`note: ${v.skipReason}`);
     return lines.join('\n');
   }
   ```

   Remove the now-unused `void execFileAsync;` / `promisify` import if `defaultExecFile` does not use it (it does not — delete the `execFileAsync` line and the `promisify` import).

2. Export from `packages/core/src/review/ci/index.ts` — append:

   ```ts
   export { runCiReview } from './orchestrator';
   export type {
     RunCiReviewOptions,
     CiReviewResult,
     CiBlockOn,
     ExecFileLike,
   } from './orchestrator';
   ```

3. Run: `npx tsc -p packages/core/tsconfig.json --noEmit`
4. Run: `harness validate`
5. Commit: `feat(review-ci): block-on threshold, terminal summary, barrel export`

### Task 5: Unit tests — SC1 (floor-only) + SC2 (secret-gated, both env states)

**Depends on:** Task 4 | **Files:** `packages/core/tests/review/ci/orchestrator.test.ts`

1. Create the test file. Mock `runReviewPipeline` via `vi.mock` of `../../../src/review/pipeline-orchestrator` so no real pipeline runs; build a `DiffInfo` with a `fileDiffs` Map. Provide a fixture loader for the real Phase 1 envelopes.

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { readFileSync } from 'node:fs';
   import { join } from 'node:path';

   const runReviewPipeline = vi.fn();
   vi.mock('../../../src/review/pipeline-orchestrator', () => ({ runReviewPipeline }));

   // Imported AFTER vi.mock so the mock is in place.
   import { runCiReview, type ExecFileLike } from '../../../src/review/ci/orchestrator';

   const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
   const diff = { fileDiffs: new Map([['src/x.ts', 'diff --git ...']]) } as any;

   const floorClean = {
     skipped: false,
     stoppedByMechanical: false,
     assessment: 'approve',
     findings: [],
     strengths: [],
     terminalOutput: '',
     githubComments: [],
     exitCode: 0,
   };
   const floorMechStop = {
     skipped: false,
     stoppedByMechanical: true,
     assessment: 'request-changes',
     findings: [],
     strengths: [],
     terminalOutput: '',
     githubComments: [],
     exitCode: 1,
   };

   beforeEach(() => {
     runReviewPipeline.mockReset();
   });
   ```

   SC1 tests:
   - `floor-only clean diff → exitCode 0, runner 'floor-only', ranLlmTier false` (mock returns `floorClean`, no `runner`).
   - `floor mechanical-stop short-circuits → exitCode 1, ranLlmTier false, seam NEVER called` — pass a spy `execFile` and assert `expect(execFile).not.toHaveBeenCalled()`; mock returns `floorMechStop`, `runner: 'claude'`, `env: { ANTHROPIC_API_KEY: 'x' }`.
   - `floor with a critical heuristic finding → exitCode 1` (mock `floor` with one critical finding in `findings`, `assessment: 'request-changes'`).

   SC2 tests (use the REAL claude fixture through a mocked seam):
   - `secret present → seam invoked, ranLlmTier true, claude findings merged`:
     ```ts
     runReviewPipeline.mockResolvedValue(floorClean);
     const execFile: ExecFileLike = vi
       .fn()
       .mockResolvedValue({ stdout: fx('claude-verdict.json') });
     const r = await runCiReview({
       projectRoot: '/p',
       diff,
       runner: 'claude',
       env: { ANTHROPIC_API_KEY: 'x' },
       execFile,
     });
     expect(execFile).toHaveBeenCalledOnce();
     // diff piped to STDIN:
     expect((execFile as any).mock.calls[0][2].stdin).toContain('diff --git');
     expect(r.ranLlmTier).toBe(true);
     expect(r.verdict.runner).toBe('claude');
     expect(r.verdict.findings.length).toBeGreaterThan(0); // claude fixture has 1 critical
     ```
   - `secret absent → graceful skip, ranLlmTier false, llmSkipReason set, seam NOT called, no throw`:
     ```ts
     const execFile = vi.fn();
     const r = await runCiReview({ projectRoot: '/p', diff, runner: 'claude', env: {}, execFile });
     expect(execFile).not.toHaveBeenCalled();
     expect(r.ranLlmTier).toBe(false);
     expect(r.llmSkipReason).toMatch(/secret ANTHROPIC_API_KEY/);
     expect(r.verdict.runner).toBe('floor-only');
     ```
   - `unsupported runner (cursor/gemini) → graceful skip with unsupported reason, no throw`.
   - `endpoint runner with no localInvoke → graceful skip` (`runner: 'local'`, `env: { HARNESS_LOCAL_ENDPOINT: 'http://x', HARNESS_LOCAL_MODEL: 'm' }`, no `localInvoke`).

2. Run: `npx vitest run packages/core/tests/review/ci/orchestrator.test.ts` — observe SC1+SC2 pass.
3. Run: `harness validate`
4. Commit: `test(review-ci): orchestrator SC1 floor-only + SC2 secret-gated coverage`

### Task 6: Unit tests — SC3 (threshold matrix) + SC4 (per-runner normalization); finalize

**Depends on:** Task 5 | **Files:** `packages/core/tests/review/ci/orchestrator.test.ts`

1. Append SC3 + SC4 describe blocks to the same test file.

   SC3 (threshold matrix) — drive the verdict assessment via the LLM tier output through a mocked seam (or via floor findings) and vary `blockOn`:
   - `request-changes verdict under default blockOn → exitCode 1` (claude fixture → request-changes).
   - `same request-changes verdict under blockOn 'none' → exitCode 0`.
   - `comment verdict under blockOn 'request-changes' → exitCode 0`.
   - `comment verdict under blockOn 'comment' → exitCode 1`.
   - `approve verdict under any blockOn (except already 0) → exitCode 0`.
   - `required runner fails to execute (execFile rejects) → exitCode 1 even on clean floor`:
     ```ts
     runReviewPipeline.mockResolvedValue(floorClean);
     const execFile: ExecFileLike = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));
     const r = await runCiReview({
       projectRoot: '/p',
       diff,
       runner: 'claude',
       env: { ANTHROPIC_API_KEY: 'x' },
       execFile,
     });
     expect(r.exitCode).toBe(1);
     expect(r.llmSkipReason).toMatch(/failed/);
     ```
   - `required runner fails under blockOn 'none' → still exitCode 1` (required-runner failure is not gated by 'none').

   SC4 (per-runner normalization against REAL fixtures) — one test per supported runner, mocked seam returns the captured envelope; assert schema-valid verdict + correct runner id + findings merge:
   - claude → `fx('claude-verdict.json')` via `execFile` → `runner 'claude'`, request-changes, ≥1 blocking.
   - codex → `fx('codex-verdict.jsonl')` via `execFile`, `env: { OPENAI_API_KEY: 'x' }` → `runner 'codex'`, approve.
   - antigravity → `fx('antigravity-verdict.txt')` via `execFile`, `env: { GEMINI_API_KEY: 'x' }` → `runner 'antigravity'`, approve.
   - local → `fx('local-verdict.json')` via injected `localInvoke` returning the fixture string, `env: { HARNESS_LOCAL_ENDPOINT: 'http://x', HARNESS_LOCAL_MODEL: 'm' }` → `runner 'local'`, request-changes, findings merged with floor. Assert `localInvoke` received `{ endpoint, model, instruction, diff }`.
   - For each: assert `parseCiReviewVerdict(r.verdict)` does not throw (schema-valid) and `r.verdict.blockingFindings.every(f => f.severity === 'critical')`.
   - Merge check: provide a floor with one `important` finding AND a claude fixture with one `critical`; assert merged `findings.length === floor + llm` and `assessment === 'request-changes'`.

2. Run: `npx vitest run packages/core/tests/review/ci/orchestrator.test.ts` — all SC1–SC4 green.
3. Run full CI gate locally before commit (pre-commit will run these too):
   `npx vitest run packages/core/tests/review/ci/` (orchestrator + Phase 1 parsers/schema/presets all green)
4. Run: `harness validate` and `harness check-deps` (confirm NO new circular dep introduced by the orchestrator; confirm no core→intelligence edge).
5. Commit: `test(review-ci): orchestrator SC3 threshold matrix + SC4 per-runner normalization`

## Sequencing notes

- Strict linear chain (each task edits the same orchestrator file then tests): 1 → 2 → 3 → 4 → 5 → 6. No parallelism.
- No checkpoints required — Phase 2 is pure, fully-unit-testable core logic with mocked seams; no human verification or live-CLI steps (those are SC5, Phase 1/CI).
- Each commit is atomic and passes `harness validate`. The heavy pre-commit hook (plugin regen, coverage, format:check, generate-docs) runs on every commit — expect each commit to take longer; if a hook reformats `orchestrator.ts`, re-add and re-commit.

## Layer / dependency guardrails (verify in Task 6)

- `orchestrator.ts` imports ONLY from `node:child_process`, `node:util`, and `../` core modules + `./` ci modules. NO `@harness-engineering/intelligence` import. The `local` provider is reached solely through the injected `localInvoke: LocalEndpointInvoke` seam.
- No new entry in `packages/core/package.json` dependencies.
- `harness check-deps` already reports two PRE-EXISTING circular deps in `packages/cli` (drift/catalog and craft/llm) — those are NOT introduced by this work; confirm the count does not increase.
