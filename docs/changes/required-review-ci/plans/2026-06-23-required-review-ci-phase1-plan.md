# Plan: required-review-ci — Phase 1 (Schema + Runner-Preset Registry + Local Headless Smoke Test)

**Date:** 2026-06-23 | **Spec:** `docs/changes/required-review-ci/proposal.md` | **Tasks:** 10 | **Time:** ~42 min | **Integration Tier:** medium

> **Re-scope note (human decision, `autopilot-state.json` decisions[0]):** This plan covers ONLY the
> deterministic, locally-verifiable core. The `harness review-ci` orchestrator (Phase 2), CLI wiring
> (Phase 3), templates/ruleset (Phase 4), the `cursor` preset, any GitHub Actions workflow, ruleset
> apply, and dogfood adoption are DEFERRED to a real CI run. In-CI verification (spec SC5-in-CI, SC6,
> SC8) cannot be honestly validated from this local, non-CI session and is out of scope.

## Goal

Ship a versioned `CiReviewVerdict` Zod schema and a typed per-runner preset registry (claude/gemini/codex
populated, cursor documented-but-unsupported) in `packages/core/src/review/ci/`, plus a local headless
smoke-test harness that exercises each present runner's `headlessInvocation` + `verdictParser` end-to-end
against a tiny diff — all reusing the existing core `ReviewFinding` type.

## Observable Truths (Acceptance Criteria)

1. **The system shall** export `CiReviewVerdictSchema` (Zod) and the `CiReviewVerdict` type from the
   core package barrel (`@harness-engineering/core`), with fields: `schemaVersion`, `runner`,
   `ranLlmTier`, `assessment`, `findings`, `blockingFindings`, `exitCode`, `skipped`, `skipReason?`.
   _(verifies: spec "CiReviewVerdict schema", SC4-schema-versioned)_
2. **The system shall** reuse the existing `ReviewFinding` type
   (`packages/core/src/review/types/fan-out.ts:45`) for `findings` and `blockingFindings` — no
   re-definition. (Verified: `findings` parses a real `ReviewFinding` fixture and rejects a malformed one.)
3. **The system shall** pin `schemaVersion` to the literal `1`. **If** a verdict object carries any
   other `schemaVersion`, **then** the system shall reject it at parse time.
4. **The system shall** expose `parseCiReviewVerdict(input): CiReviewVerdict` that throws a Zod error
   on invalid input, and the assessment enum shall be `'approve' | 'comment' | 'request-changes'`
   (matching core `ReviewAssessment`, `src/review/types/output.ts:9`); `runner` shall additionally
   permit `'floor-only'`.
5. **The system shall** export a typed `RUNNER_PRESETS` registry keyed by runner id; **where** a runner
   is `claude`, `gemini`, or `codex`, the entry shall provide `{ secretEnvVar, headlessInvocation,
verdictParser, supported: true }`.
6. **The system shall** include a `cursor` registry entry marked `supported: false` with a
   `unsupportedReason` string and no wired `verdictParser` invocation. **If** any caller treats `cursor`
   as runnable, **then** the registry shall surface it as unsupported (type-level `supported: false`
   discriminant + runtime guard).
7. **When** given a representative raw output fixture for claude, gemini, or codex, the matching
   `verdictParser` shall return a schema-valid `CiReviewVerdict` (asserted by `parseCiReviewVerdict`).
8. **When** a target CLI binary is present on `PATH`, the local smoke-test shall invoke that runner's
   `headlessInvocation` against a tiny diff and parse the result into a schema-valid verdict; **while**
   the CLI binary is absent, the smoke-test shall skip that runner (no failure).
9. **The system shall** pass `harness validate`, `harness check-deps` (no new circular deps), and
   `vitest run` for all new test files.

## File Map

```
CREATE packages/core/src/review/ci/index.ts                         (subdir barrel)
CREATE packages/core/src/review/ci/verdict-schema.ts                (Zod schema + type + parse)
CREATE packages/core/src/review/ci/runner-presets.ts                (typed registry shape + entries)
CREATE packages/core/src/review/ci/parsers/claude.ts                (verdictParser)
CREATE packages/core/src/review/ci/parsers/gemini.ts                (verdictParser)
CREATE packages/core/src/review/ci/parsers/codex.ts                 (verdictParser)
MODIFY packages/core/src/review/index.ts                            (re-export './ci')
CREATE packages/core/tests/review/ci/verdict-schema.test.ts
CREATE packages/core/tests/review/ci/runner-presets.test.ts
CREATE packages/core/tests/review/ci/parsers.test.ts
CREATE packages/core/tests/review/ci/fixtures/claude-verdict.json
CREATE packages/core/tests/review/ci/fixtures/gemini-verdict.json
CREATE packages/core/tests/review/ci/fixtures/codex-verdict.json
CREATE packages/core/tests/review/ci/headless-smoke.test.ts         (PATH-guarded, local-only)
```

Notes:

- `packages/core/src/ci/` already exists (the `harness ci check` orchestrator) and is unrelated. Phase 1
  code lives under `src/review/ci/` to avoid collision. Tests mirror under `tests/review/ci/`.
- Core's top-level `src/index.ts` is AUTO-GENERATED (`pnpm run generate:barrels`) and already does
  `export * from './review'`; it picks up the new export transitively once `src/review/index.ts`
  re-exports `./ci`. `src/review/index.ts` is hand-maintained.

## Skeleton

1. Schema constants + versioned `CiReviewVerdict` Zod schema + parse (~3 tasks, ~13 min)
2. Subdir barrel + wire into review barrel (~1 task, ~4 min)
3. Runner-preset registry shape + claude/gemini/codex entries + cursor placeholder (~2 tasks, ~9 min)
4. Per-runner verdict parsers + fixtures (~3 tasks, ~12 min)
5. Local headless smoke-test harness (PATH-guarded) (~1 task, ~5 min)

**Estimated total:** 10 tasks, ~42 minutes. _Skeleton approved: standard rigor, re-scope already human-approved (autopilot decisions[0]); full tasks below._

## Uncertainties

- [ASSUMPTION] Each present CLI (`claude -p`, `gemini`, `codex`) can emit a structured/parseable verdict
  when handed the harness `code-review` instruction headlessly. The smoke-test (Task 10) is the local
  honesty check; if a CLI's real output diverges from the representative fixture, Task 10 surfaces it
  and the parser/fixture is revised. This does NOT block schema/registry tasks (Tasks 1-9).
- [DEFERRABLE] The exact `headlessInvocation` argv for each CLI may need tuning against real CLI
  behavior. Tasks 6-7 encode best-known invocations; Task 10 validates locally. In-CI behavior remains
  deferred per the re-scope decision.
- [DEFERRABLE] Whether `verdictParser` consumes stdout text vs. a written file path. This plan models
  parsers as `(raw: string) => CiReviewVerdict` (stdout-or-file-contents agnostic); the orchestrator
  (Phase 2) decides capture mechanics.

## Tasks

### Task 1: Define schema constants (runner ids, assessment enum source)

**Depends on:** none | **Files:** `packages/core/src/review/ci/verdict-schema.ts`

1. Create `packages/core/src/review/ci/verdict-schema.ts` with the constant arrays and version literal
   (no schema yet — pure constants this task):

   ```ts
   import { z } from 'zod';

   /** Schema version for CiReviewVerdict. Bump on breaking field changes. */
   export const CI_REVIEW_VERDICT_SCHEMA_VERSION = 1 as const;

   /** Runner ids that map to a verdict. 'floor-only' = heuristic floor ran, no LLM tier. */
   export const CI_RUNNERS = ['claude', 'gemini', 'codex', 'cursor', 'floor-only'] as const;
   export type CiRunner = (typeof CI_RUNNERS)[number];

   /** Assessment values — must stay in lockstep with core ReviewAssessment (output.ts). */
   export const CI_ASSESSMENTS = ['approve', 'comment', 'request-changes'] as const;
   ```

2. Run: `pnpm --filter @harness-engineering/core typecheck`
3. Run: `harness validate`
4. Commit: `feat(review-ci): add CiReviewVerdict schema constants`

### Task 2 (TDD): CiReviewVerdict Zod schema reusing ReviewFinding

**Depends on:** Task 1 | **Files:** `packages/core/tests/review/ci/verdict-schema.test.ts`, `packages/core/src/review/ci/verdict-schema.ts`

1. Create `packages/core/tests/review/ci/verdict-schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     CiReviewVerdictSchema,
     parseCiReviewVerdict,
     CI_REVIEW_VERDICT_SCHEMA_VERSION,
   } from '../../../src/review/ci/verdict-schema';
   import type { ReviewFinding } from '../../../src/review/types';

   function makeFinding(over: Partial<ReviewFinding> = {}): ReviewFinding {
     return {
       id: 'bug-src-auth-ts-42',
       file: 'src/auth.ts',
       lineRange: [40, 45],
       domain: 'bug',
       severity: 'important',
       title: 'Test finding',
       rationale: 'because',
       evidence: ['line 42'],
       validatedBy: 'heuristic',
       ...over,
     };
   }

   function makeVerdict(over: Record<string, unknown> = {}) {
     return {
       schemaVersion: 1,
       runner: 'claude',
       ranLlmTier: true,
       assessment: 'request-changes',
       findings: [makeFinding()],
       blockingFindings: [makeFinding({ severity: 'critical' })],
       exitCode: 1,
       skipped: false,
       ...over,
     };
   }

   describe('CiReviewVerdictSchema', () => {
     it('parses a valid verdict and reuses ReviewFinding shape', () => {
       const v = parseCiReviewVerdict(makeVerdict());
       expect(v.runner).toBe('claude');
       expect(v.findings[0].domain).toBe('bug');
     });

     it('rejects a schemaVersion other than the current literal', () => {
       expect(() => parseCiReviewVerdict(makeVerdict({ schemaVersion: 2 }))).toThrow();
       expect(CI_REVIEW_VERDICT_SCHEMA_VERSION).toBe(1);
     });

     it('rejects an unknown assessment', () => {
       expect(() => parseCiReviewVerdict(makeVerdict({ assessment: 'nope' }))).toThrow();
     });

     it('rejects a malformed finding (missing required ReviewFinding fields)', () => {
       expect(() => parseCiReviewVerdict(makeVerdict({ findings: [{ id: 'x' }] }))).toThrow();
     });

     it('allows floor-only runner with ranLlmTier false and skipped reason', () => {
       const v = parseCiReviewVerdict(
         makeVerdict({
           runner: 'floor-only',
           ranLlmTier: false,
           skipped: true,
           skipReason: 'no secret',
         })
       );
       expect(v.skipReason).toBe('no secret');
     });

     it('exposes a Zod schema object', () => {
       expect(typeof CiReviewVerdictSchema.parse).toBe('function');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- verdict-schema` — observe failure (no schema export).
3. Append to `packages/core/src/review/ci/verdict-schema.ts`:

   ```ts
   /**
    * Zod schema for a single ReviewFinding. Field set MUST mirror the existing
    * core ReviewFinding interface (src/review/types/fan-out.ts) — do not redefine
    * the TS type; this schema validates objects that satisfy it at the CI boundary.
    */
   const ReviewFindingSchema = z
     .object({
       id: z.string().min(1),
       file: z.string().min(1),
       lineRange: z.tuple([z.number(), z.number()]),
       domain: z.string().min(1),
       severity: z.enum(['critical', 'important', 'suggestion']),
       title: z.string().min(1),
       rationale: z.string().min(1),
       suggestion: z.string().optional(),
       evidence: z.array(z.string()),
       validatedBy: z.enum(['mechanical', 'graph', 'heuristic']),
       cweId: z.string().optional(),
       owaspCategory: z.string().optional(),
       confidence: z
         .union([
           z.enum(['high', 'medium', 'low']),
           z.literal(25),
           z.literal(50),
           z.literal(75),
           z.literal(100),
         ])
         .optional(),
       remediation: z.string().optional(),
       references: z.array(z.string()).optional(),
       trustScore: z.number().optional(),
       rubricItemId: z.string().optional(),
       subagent: z.string().optional(),
     })
     .passthrough();

   export const CiReviewVerdictSchema = z.object({
     schemaVersion: z.literal(CI_REVIEW_VERDICT_SCHEMA_VERSION),
     runner: z.enum(CI_RUNNERS),
     ranLlmTier: z.boolean(),
     assessment: z.enum(CI_ASSESSMENTS),
     findings: z.array(ReviewFindingSchema),
     blockingFindings: z.array(ReviewFindingSchema),
     exitCode: z.number().int(),
     skipped: z.boolean(),
     skipReason: z.string().optional(),
   });

   export type CiReviewVerdict = z.infer<typeof CiReviewVerdictSchema>;

   /** Parse + validate an unknown into a CiReviewVerdict. Throws ZodError on invalid input. */
   export function parseCiReviewVerdict(input: unknown): CiReviewVerdict {
     return CiReviewVerdictSchema.parse(input);
   }
   ```

   > Note on `ReviewFinding` reuse: the TS `findings: ReviewFinding[]` typing flows from `z.infer`
   > matching the existing interface fields; `.passthrough()` keeps the schema tolerant of the full
   > optional field set without re-listing every nuance. The acceptance criterion "reuse, do not
   > redefine" is satisfied at the type layer by `import type { ReviewFinding }` in consumers and by the
   > test asserting a real `ReviewFinding` fixture parses.

4. Run: `pnpm --filter @harness-engineering/core test -- verdict-schema` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(review-ci): add versioned CiReviewVerdict Zod schema and parser`

### Task 3: Subdir barrel for review/ci

**Depends on:** Task 2 | **Files:** `packages/core/src/review/ci/index.ts`

1. Create `packages/core/src/review/ci/index.ts`:
   ```ts
   // Phase 1: CI review contract (schema + runner-preset registry).
   export {
     CiReviewVerdictSchema,
     parseCiReviewVerdict,
     CI_REVIEW_VERDICT_SCHEMA_VERSION,
     CI_RUNNERS,
     CI_ASSESSMENTS,
   } from './verdict-schema';
   export type { CiReviewVerdict, CiRunner } from './verdict-schema';
   ```
2. Run: `pnpm --filter @harness-engineering/core typecheck`
3. Commit: `feat(review-ci): add review/ci subdir barrel`

### Task 4: Wire review/ci into the review barrel + core package barrel

**Depends on:** Task 3 | **Files:** `packages/core/src/review/index.ts`

1. In `packages/core/src/review/index.ts`, append after the `two-stage` export (end of file):
   ```ts
   // Phase 1 (required-review-ci): CI review contract
   export * from './ci';
   ```
2. Regenerate the core top-level barrel (it already does `export * from './review'`, so this just
   re-runs the generator to confirm no drift): `pnpm run generate:barrels`
3. Verify the symbol is reachable from the package root:
   `node -e "import('@harness-engineering/core').then(m => { if (typeof m.parseCiReviewVerdict !== 'function') throw new Error('not exported'); console.log('ok'); })"`
   (If the package is not built, run `pnpm --filter @harness-engineering/core build` first, or verify via
   a vitest import in Task 2's file already covering `../../../src/review/ci/...` — the barrel reachability
   check is the load-bearing assertion here.)
4. Run: `harness validate` and `harness check-deps` — confirm no new circular dependency.
5. Commit: `feat(review-ci): export CI review contract from core barrel`

### Task 5 (TDD): Runner-preset registry shape (types + empty-shape test)

**Depends on:** Task 2 | **Files:** `packages/core/tests/review/ci/runner-presets.test.ts`, `packages/core/src/review/ci/runner-presets.ts`

1. Create `packages/core/tests/review/ci/runner-presets.test.ts` (shape-only assertions this task):

   ```ts
   import { describe, it, expect } from 'vitest';
   import { RUNNER_PRESETS, isSupportedRunner } from '../../../src/review/ci/runner-presets';

   describe('RUNNER_PRESETS registry shape', () => {
     it('has entries for claude, gemini, codex, cursor', () => {
       expect(Object.keys(RUNNER_PRESETS).sort()).toEqual(['claude', 'codex', 'cursor', 'gemini']);
     });

     it('marks claude/gemini/codex supported with a secretEnvVar and headlessInvocation', () => {
       for (const id of ['claude', 'gemini', 'codex'] as const) {
         const p = RUNNER_PRESETS[id];
         expect(p.supported).toBe(true);
         expect(p.secretEnvVar).toMatch(/.+/);
         expect(typeof p.headlessInvocation).toBe('function');
         expect(typeof p.verdictParser).toBe('function');
       }
     });

     it('marks cursor unsupported with a reason and no usable parser path', () => {
       const c = RUNNER_PRESETS.cursor;
       expect(c.supported).toBe(false);
       expect(c.unsupportedReason).toMatch(/.+/);
       expect(isSupportedRunner('cursor')).toBe(false);
       expect(isSupportedRunner('claude')).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- runner-presets` — observe failure.
3. Create `packages/core/src/review/ci/runner-presets.ts` with ONLY the shape + cursor placeholder
   (parsers stubbed to throw, real parsers wired in Tasks 6-9):

   ```ts
   import type { CiReviewVerdict } from './verdict-schema';

   /** A headless invocation descriptor: the argv the orchestrator shells out to. */
   export interface HeadlessInvocation {
     /** Executable name expected on PATH (e.g. 'claude'). */
     command: string;
     /** Args builder given the review instruction + diff path. */
     args: (opts: { instruction: string; diffPath: string }) => string[];
   }

   interface SupportedPreset {
     supported: true;
     secretEnvVar: string;
     headlessInvocation: (opts: { instruction: string; diffPath: string }) => {
       command: string;
       args: string[];
     };
     verdictParser: (raw: string) => CiReviewVerdict;
   }

   interface UnsupportedPreset {
     supported: false;
     unsupportedReason: string;
   }

   export type RunnerPreset = SupportedPreset | UnsupportedPreset;

   export type SupportedRunnerId = 'claude' | 'gemini' | 'codex';
   export type RunnerId = SupportedRunnerId | 'cursor';

   export const RUNNER_PRESETS: Record<RunnerId, RunnerPreset> = {
     // claude/gemini/codex filled in Tasks 6-9 (verdictParser wired from ./parsers).
     claude: { supported: false, unsupportedReason: 'TODO Task 6' } as RunnerPreset,
     gemini: { supported: false, unsupportedReason: 'TODO Task 7' } as RunnerPreset,
     codex: { supported: false, unsupportedReason: 'TODO Task 8' } as RunnerPreset,
     cursor: {
       supported: false,
       unsupportedReason:
         'cursor headless CI invocation is unverified and the CLI is not present in this environment; ' +
         'deferred to a real CI run per the required-review-ci re-scope decision.',
     },
   };

   export function isSupportedRunner(id: RunnerId): id is SupportedRunnerId {
     return RUNNER_PRESETS[id].supported === true;
   }
   ```

   > This task intentionally leaves claude/gemini/codex `supported: false` until their parsers land
   > (Tasks 6-9), so the registry never claims support it cannot back. The test above will FAIL on the
   > "supported" assertions until Task 9 — that is expected; mark this task's assertion block with a
   > `it.todo`-style note. **Correction to keep tasks atomic:** in step 1, wrap the
   > "marks claude/gemini/codex supported" test with `it.skip` and re-enable it in Task 9. Keep the
   > shape + cursor assertions active now.

4. Edit step 1: change `it('marks claude/gemini/codex supported...` to `it.skip('marks claude/gemini/codex supported...`.
5. Run: `pnpm --filter @harness-engineering/core test -- runner-presets` — observe pass (skipped block + active shape/cursor assertions).
6. Run: `harness validate`
7. Commit: `feat(review-ci): add runner-preset registry shape with cursor placeholder`

### Task 6 (TDD): Claude verdict parser + fixture

**Depends on:** Task 5 | **Files:** `packages/core/tests/review/ci/fixtures/claude-verdict.json`, `packages/core/tests/review/ci/parsers.test.ts`, `packages/core/src/review/ci/parsers/claude.ts`
**Skills:** none

1. Create representative fixture `packages/core/tests/review/ci/fixtures/claude-verdict.json` — the raw
   structured output a `claude -p` headless `code-review` run is expected to emit (a JSON envelope):
   ```json
   {
     "assessment": "request-changes",
     "findings": [
       {
         "id": "bug-src-auth-ts-42",
         "file": "src/auth.ts",
         "lineRange": [40, 45],
         "domain": "bug",
         "severity": "critical",
         "title": "Unvalidated redirect",
         "rationale": "User-controlled URL flows into res.redirect without allowlist.",
         "evidence": ["src/auth.ts:42"],
         "validatedBy": "heuristic"
       }
     ]
   }
   ```
2. Create `packages/core/tests/review/ci/parsers.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { readFileSync } from 'node:fs';
   import { join } from 'node:path';
   import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude';
   import { parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema';

   const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

   describe('claude verdict parser', () => {
     it('maps raw claude output to a schema-valid CiReviewVerdict', () => {
       const v = parseClaudeVerdict(fx('claude-verdict.json'));
       const validated = parseCiReviewVerdict(v); // throws if invalid
       expect(validated.runner).toBe('claude');
       expect(validated.ranLlmTier).toBe(true);
       expect(validated.assessment).toBe('request-changes');
       expect(validated.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
     });

     it('throws on non-JSON input', () => {
       expect(() => parseClaudeVerdict('not json')).toThrow();
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe failure.
4. Create `packages/core/src/review/ci/parsers/claude.ts`:

   ```ts
   import {
     CI_REVIEW_VERDICT_SCHEMA_VERSION,
     parseCiReviewVerdict,
     type CiReviewVerdict,
   } from '../verdict-schema';

   /** Map a claude headless code-review JSON envelope into a normalized CiReviewVerdict. */
   export function parseClaudeVerdict(raw: string): CiReviewVerdict {
     const parsed = JSON.parse(raw) as {
       assessment: 'approve' | 'comment' | 'request-changes';
       findings?: unknown[];
     };
     const findings = (parsed.findings ?? []) as CiReviewVerdict['findings'];
     const blockingFindings = findings.filter((f) => f.severity === 'critical');
     return parseCiReviewVerdict({
       schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
       runner: 'claude',
       ranLlmTier: true,
       assessment: parsed.assessment,
       findings,
       blockingFindings,
       exitCode: blockingFindings.length > 0 || parsed.assessment === 'request-changes' ? 1 : 0,
       skipped: false,
     });
   }
   ```

5. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe pass.
6. Run: `harness validate`
7. Commit: `feat(review-ci): add claude verdict parser with fixture`

### Task 7 (TDD): Gemini verdict parser + fixture

**Depends on:** Task 6 | **Files:** `packages/core/tests/review/ci/fixtures/gemini-verdict.json`, `packages/core/tests/review/ci/parsers.test.ts`, `packages/core/src/review/ci/parsers/gemini.ts`

1. Create `packages/core/tests/review/ci/fixtures/gemini-verdict.json` (representative gemini output;
   model gemini as emitting the same finding fields but wrapped under a `review` key to exercise a
   different envelope shape):
   ```json
   {
     "review": {
       "verdict": "comment",
       "issues": [
         {
           "id": "arch-src-db-ts-10",
           "file": "src/db.ts",
           "lineRange": [10, 12],
           "domain": "architecture",
           "severity": "suggestion",
           "title": "Connection not pooled",
           "rationale": "Opens a new connection per request.",
           "evidence": ["src/db.ts:10"],
           "validatedBy": "heuristic"
         }
       ]
     }
   }
   ```
2. Append to `packages/core/tests/review/ci/parsers.test.ts`:

   ```ts
   import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini';

   describe('gemini verdict parser', () => {
     it('maps gemini review envelope to a schema-valid CiReviewVerdict', () => {
       const v = parseCiReviewVerdict(parseGeminiVerdict(fx('gemini-verdict.json')));
       expect(v.runner).toBe('gemini');
       expect(v.assessment).toBe('comment');
       expect(v.blockingFindings).toHaveLength(0);
       expect(v.exitCode).toBe(0);
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe failure.
4. Create `packages/core/src/review/ci/parsers/gemini.ts`:

   ```ts
   import {
     CI_REVIEW_VERDICT_SCHEMA_VERSION,
     parseCiReviewVerdict,
     type CiReviewVerdict,
   } from '../verdict-schema';

   const VERDICT_MAP: Record<string, CiReviewVerdict['assessment']> = {
     approve: 'approve',
     comment: 'comment',
     'request-changes': 'request-changes',
   };

   /** Map a gemini headless code-review envelope ({ review: { verdict, issues } }) into a CiReviewVerdict. */
   export function parseGeminiVerdict(raw: string): CiReviewVerdict {
     const parsed = JSON.parse(raw) as { review?: { verdict?: string; issues?: unknown[] } };
     const assessment = VERDICT_MAP[parsed.review?.verdict ?? 'comment'] ?? 'comment';
     const findings = (parsed.review?.issues ?? []) as CiReviewVerdict['findings'];
     const blockingFindings = findings.filter((f) => f.severity === 'critical');
     return parseCiReviewVerdict({
       schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
       runner: 'gemini',
       ranLlmTier: true,
       assessment,
       findings,
       blockingFindings,
       exitCode: blockingFindings.length > 0 || assessment === 'request-changes' ? 1 : 0,
       skipped: false,
     });
   }
   ```

5. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe pass.
6. Run: `harness validate`
7. Commit: `feat(review-ci): add gemini verdict parser with fixture`

### Task 8 (TDD): Codex verdict parser + fixture

**Depends on:** Task 7 | **Files:** `packages/core/tests/review/ci/fixtures/codex-verdict.json`, `packages/core/tests/review/ci/parsers.test.ts`, `packages/core/src/review/ci/parsers/codex.ts`

1. Create `packages/core/tests/review/ci/fixtures/codex-verdict.json` (codex emits a top-level array of
   findings + a separate `result` string — a third envelope shape to prove the registry tolerates
   heterogeneity):
   ```json
   {
     "result": "approve",
     "findings": []
   }
   ```
2. Append to `packages/core/tests/review/ci/parsers.test.ts`:

   ```ts
   import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex';

   describe('codex verdict parser', () => {
     it('maps codex clean result to an approve verdict with exitCode 0', () => {
       const v = parseCiReviewVerdict(parseCodexVerdict(fx('codex-verdict.json')));
       expect(v.runner).toBe('codex');
       expect(v.assessment).toBe('approve');
       expect(v.findings).toHaveLength(0);
       expect(v.exitCode).toBe(0);
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe failure.
4. Create `packages/core/src/review/ci/parsers/codex.ts`:

   ```ts
   import {
     CI_REVIEW_VERDICT_SCHEMA_VERSION,
     parseCiReviewVerdict,
     type CiReviewVerdict,
   } from '../verdict-schema';

   const RESULT_MAP: Record<string, CiReviewVerdict['assessment']> = {
     approve: 'approve',
     comment: 'comment',
     'request-changes': 'request-changes',
   };

   /** Map a codex headless code-review result ({ result, findings }) into a CiReviewVerdict. */
   export function parseCodexVerdict(raw: string): CiReviewVerdict {
     const parsed = JSON.parse(raw) as { result?: string; findings?: unknown[] };
     const assessment = RESULT_MAP[parsed.result ?? 'comment'] ?? 'comment';
     const findings = (parsed.findings ?? []) as CiReviewVerdict['findings'];
     const blockingFindings = findings.filter((f) => f.severity === 'critical');
     return parseCiReviewVerdict({
       schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
       runner: 'codex',
       ranLlmTier: true,
       assessment,
       findings,
       blockingFindings,
       exitCode: blockingFindings.length > 0 || assessment === 'request-changes' ? 1 : 0,
       skipped: false,
     });
   }
   ```

5. Run: `pnpm --filter @harness-engineering/core test -- parsers` — observe pass.
6. Run: `harness validate`
7. Commit: `feat(review-ci): add codex verdict parser with fixture`

### Task 9 (TDD): Wire parsers + headlessInvocation into the registry; mark claude/gemini/codex supported

**Depends on:** Task 8 | **Files:** `packages/core/src/review/ci/runner-presets.ts`, `packages/core/tests/review/ci/runner-presets.test.ts`

1. Re-enable the skipped block in `packages/core/tests/review/ci/runner-presets.test.ts`: change
   `it.skip('marks claude/gemini/codex supported...` back to `it('marks claude/gemini/codex supported...`.
   Add an assertion that `headlessInvocation` returns a `{ command, args }` for each:
   ```ts
   it('builds a headless invocation argv per supported runner', () => {
     for (const id of ['claude', 'gemini', 'codex'] as const) {
       const preset = RUNNER_PRESETS[id];
       if (!preset.supported) throw new Error(`${id} should be supported`);
       const inv = preset.headlessInvocation({ instruction: 'review', diffPath: '/tmp/d.diff' });
       expect(inv.command).toMatch(/.+/);
       expect(Array.isArray(inv.args)).toBe(true);
     }
   });
   ```
2. Run: `pnpm --filter @harness-engineering/core test -- runner-presets` — observe failure.
3. Edit `packages/core/src/review/ci/runner-presets.ts`: import the three parsers and replace the
   claude/gemini/codex placeholder entries with real supported presets:
   ```ts
   import { parseClaudeVerdict } from './parsers/claude';
   import { parseGeminiVerdict } from './parsers/gemini';
   import { parseCodexVerdict } from './parsers/codex';
   ```
   ```ts
   claude: {
     supported: true,
     secretEnvVar: 'ANTHROPIC_API_KEY',
     headlessInvocation: ({ instruction, diffPath }) => ({
       command: 'claude',
       args: ['-p', instruction, '--input-file', diffPath, '--output-format', 'json'],
     }),
     verdictParser: parseClaudeVerdict,
   },
   gemini: {
     supported: true,
     secretEnvVar: 'GEMINI_API_KEY',
     headlessInvocation: ({ instruction, diffPath }) => ({
       command: 'gemini',
       args: ['--prompt', instruction, '--file', diffPath, '--json'],
     }),
     verdictParser: parseGeminiVerdict,
   },
   codex: {
     supported: true,
     secretEnvVar: 'OPENAI_API_KEY',
     headlessInvocation: ({ instruction, diffPath }) => ({
       command: 'codex',
       args: ['exec', '--json', instruction, '--file', diffPath],
     }),
     verdictParser: parseCodexVerdict,
   },
   ```
   > [DEFERRABLE] argv shapes are best-known guesses; Task 10's local smoke-test validates them against
   > the real CLIs and the executor refines as needed.
4. Run: `pnpm --filter @harness-engineering/core test -- runner-presets` — observe pass.
5. Run: `harness validate` and `harness check-deps`.
6. Commit: `feat(review-ci): wire claude/gemini/codex presets and mark them supported`

### Task 10 (TDD, local-only): PATH-guarded headless smoke-test harness

**Depends on:** Task 9 | **Files:** `packages/core/tests/review/ci/headless-smoke.test.ts`
**Category:** verification (LOCAL only — NOT the deferred in-CI SC5)

`[checkpoint:human-verify]` — This test invokes real local CLIs. After it runs, the executor must report
which runners actually produced a parseable verdict vs. skipped (CLI absent) vs. produced output that
diverged from the fixture shape. Divergence is a finding to feed back into the parser/fixture, not a
silent pass.

1. Create `packages/core/tests/review/ci/headless-smoke.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { execFileSync } from 'node:child_process';
   import { mkdtempSync, writeFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { RUNNER_PRESETS, type SupportedRunnerId } from '../../../src/review/ci/runner-presets';
   import { parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema';

   /** True if `cmd` resolves on PATH. */
   function onPath(cmd: string): boolean {
     try {
       execFileSync(process.platform === 'win32' ? 'where' : 'command', ['-v', cmd], {
         stdio: 'ignore',
         shell: true,
       });
       return true;
     } catch {
       return false;
     }
   }

   // Opt-in: real CLIs cost tokens/time. Run with HARNESS_CI_SMOKE=1.
   const SMOKE = process.env.HARNESS_CI_SMOKE === '1';
   const TINY_DIFF = `diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n`;
   const INSTRUCTION = 'Run the harness code-review skill on this diff and emit the verdict JSON.';

   describe('local headless smoke test', () => {
     for (const id of ['claude', 'gemini', 'codex'] as SupportedRunnerId[]) {
       const preset = RUNNER_PRESETS[id];
       const present =
         preset.supported &&
         onPath(preset.headlessInvocation({ instruction: '', diffPath: '' }).command);

       it.skipIf(!SMOKE || !present)(
         `${id}: invokes headless CLI and parses a schema-valid verdict`,
         () => {
           if (!preset.supported) throw new Error('unreachable');
           const dir = mkdtempSync(join(tmpdir(), 'ci-smoke-'));
           const diffPath = join(dir, 'tiny.diff');
           writeFileSync(diffPath, TINY_DIFF, 'utf8');
           const inv = preset.headlessInvocation({ instruction: INSTRUCTION, diffPath });
           const raw = execFileSync(inv.command, inv.args, { encoding: 'utf8', timeout: 120_000 });
           const verdict = parseCiReviewVerdict(preset.verdictParser(raw));
           expect(verdict.runner).toBe(id);
           expect(['approve', 'comment', 'request-changes']).toContain(verdict.assessment);
         }
       );

       it(`${id}: registry preset is invocable and PATH presence is observable`, () => {
         // Always-on guard: proves the harness wiring works even when the CLI is absent / SMOKE off.
         expect(preset.supported).toBe(true);
         expect(typeof present).toBe('boolean');
       });
     }
   });
   ```

2. Run the guard-only path (no real CLI calls): `pnpm --filter @harness-engineering/core test -- headless-smoke` — observe pass (real-CLI cases skip because `HARNESS_CI_SMOKE` is unset).
3. `[checkpoint:human-verify]` Run the real smoke test locally: `HARNESS_CI_SMOKE=1 pnpm --filter @harness-engineering/core test -- headless-smoke`. Report per-runner: parsed-ok / skipped-absent / diverged. If a parser diverges from real output, fix the parser + fixture (loop back to Task 6/7/8) before continuing.
4. Run: `harness validate`
5. Commit: `test(review-ci): add PATH-guarded local headless smoke test for claude/gemini/codex`

## Dependency Order / Parallelism

- Task 1 → 2 → 3 → 4 (schema chain; 4 wires barrels).
- Task 5 depends on 2 (needs `CiReviewVerdict` type), independent of 3/4 — could parallelize with 3/4.
- Tasks 6, 7, 8 each depend on the prior only for the shared `parsers.test.ts` file (sequential to avoid
  edit conflicts); their `src` files are independent.
- Task 9 depends on 6+7+8 (imports all three parsers).
- Task 10 depends on 9 (uses the wired registry).

## Notes for the Executor

- **Pre-commit hooks are heavy** (`harness ci check`, lint-staged/Prettier, plugin regen on
  `agents/skills` changes). None of Phase 1 touches `agents/skills/`, so plugin regen will not fire.
  Prettier may reformat new files on commit — if a hook re-stages, re-run the commit; do not fight it.
- **Arch baselines** may auto-update for module-size growth; the pre-commit hook auto-stages
  `.harness/arch/baselines.json`. Expect that and let it through.
- **`harness check-deps`** currently reports 2 pre-existing circular deps in `packages/cli` (drift +
  craft/llm). These are NOT introduced by this plan; do not attempt to fix them. Only fail if a NEW
  cycle appears under `packages/core/src/review/ci/`.
- **Do not** add `execa` or new deps — core already uses `node:child_process` (`execFile`/`execFileSync`).
- **Test command**: vitest filters by file substring, e.g. `pnpm --filter @harness-engineering/core test -- verdict-schema`.

## Deferred (explicitly NOT in this plan)

Phase 2 orchestrator (`harness review-ci` floor reuse + threshold + exit codes), Phase 3 CLI command +
AGENTS.md, Phase 4 templates/ruleset + init-render test, the `cursor` preset wiring, any GitHub Actions
workflow, ruleset `gh api` apply, in-CI SC5 verification, SC6 check-name binding, SC8 dogfood adoption,
and the D3/D6 ADRs. Recorded as deferred in `autopilot-state.json` decisions[0].
