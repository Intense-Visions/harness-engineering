# Plan: Harness PM — Phase 2 (MCP tool `mcp__harness__acceptance_eval`)

**Date:** 2026-06-26 | **Spec:** `docs/changes/harness-pm-persona/proposal.md` (Technical design → MCP tool; Phase 2) | **Tasks:** 3 | **Checkpoints:** 1 | **Time:** ~14 min | **Integration Tier:** medium

## Goal

Expose the Phase-1 `AcceptanceEvaluator` as the MCP tool
`mcp__harness__acceptance_eval`, registered in `packages/cli/src/mcp/server.ts`,
so an agent can run the TS-derived-authority seam (evaluate → derive) instead of
emulating the verdict in chat — returning an `AcceptanceVerdict` whose
`authority` is exactly `deriveAcceptanceAuthority(measurability, confidence)`.

## Baked-in decision (do NOT re-open)

**Drop the `path?` / graph-persistence parameter.** The tool takes `specPath`
(required), `testGlobs` / `testContent` (optional — the responsibility-(b)
evidence), and `model?` only. No `path?`, no `GraphStore`. Rationale: the spec's
non-goals defer graph-backed work, and Phase 1 deliberately omitted the
GraphStore from `AcceptanceEvaluator` (handoff concern C1; evaluator constructor
is `(provider, options)` — no store argument). A short code comment must mark the
persistence seam as deferred.

## Scope (Phase 2 only)

In: `packages/cli/src/mcp/tools/acceptance-eval.ts` (definition + handler),
registration in `packages/cli/src/mcp/server.ts`, and
`packages/cli/tests/mcp/tools/acceptance-eval.test.ts` (definition + input
contract + degrade-safe verdict + the **authority-equals-derive** integration
assertion + testGlobs resolution).

Out (other phases): intelligence core (Phase 1, done), skill (Phase 3), persona
(Phase 4), docs/ADR (Phase 5), and any graph persistence of an acceptance
verdict (deferred per the baked-in decision).

## Grounding (verified against the worktree)

- `packages/cli/src/mcp/tools/outcome-eval.ts` is the exact mirror target. Reuse
  its `resolveAnalysisProvider` (dynamic-import `AnthropicAnalysisProvider`,
  returns `null` when `ANTHROPIC_API_KEY` is unset), its `unconfiguredProvider`
  (always-rejecting stub so the evaluator degrades), its `errorResponse`, and its
  "return the verdict EXACTLY as produced — never recompute authority" handler
  shape. Drop everything persistence-related: `loadGraphStore`, `emptyGraphStore`,
  the `store` argument, and the `path?` input.
- Evaluator constructor (`packages/intelligence/src/acceptance-eval/evaluator.ts:31`):
  `new AcceptanceEvaluator(provider, options?)` — `options` is `{ model? }`, no store.
- Evaluate input (`.../acceptance-eval/types.ts:25`): `AcceptanceEvalInput =
{ specPath; specSection?; testContent? }`. There is **no** `testGlobs` on the
  evaluator — the tool must resolve `testGlobs` → file contents → a `testContent`
  string before calling `evaluate`.
- Exports already available from `@harness-engineering/intelligence`:
  `AcceptanceEvaluator`, `deriveAcceptanceAuthority`, `acceptanceVerdictSchema`,
  `AcceptanceVerdict` (type), and `buildAcceptanceUserPrompt` (the
  `buildUserPrompt` alias, handoff concern C3). **C3 is non-applicable to Phase 2
  code:** the tool calls the evaluator, not the prompt builder, so it imports
  neither `buildUserPrompt` nor its alias. The integration test imports
  `deriveAcceptanceAuthority`.
- Glob helper available: `findFiles(pattern, cwd?)` from
  `packages/cli/src/utils/files.ts` (`glob(pattern, { cwd, absolute: true })`).
  Use it for `testGlobs` resolution.
- `server.ts` registration is three edits: an import (sibling of line 204
  `outcome-eval` import), an entry in the definitions array (sibling of line 327
  `outcomeEvalDefinition,`), and a handler-map entry (sibling of line 420
  `outcome_eval: handleOutcomeEval as unknown as ToolHandler,`).

## Observable Truths (Acceptance Criteria — Phase 2 subset)

1. `acceptanceEvalDefinition.name === 'acceptance_eval'`;
   `acceptanceEvalDefinition.inputSchema.required` deep-equals `['specPath']`;
   `properties` includes `model`, `testGlobs`, `testContent`; `properties` has
   **no** `path` key.
2. `handleAcceptanceEval` with a missing/empty `specPath` returns
   `{ isError: true }` and an `error` matching `/specPath/`.
3. With no provider configured (`ANTHROPIC_API_KEY` unset),
   `handleAcceptanceEval({ specPath })` returns a well-formed `AcceptanceVerdict`
   (`measurability`, `confidence`, `authority`, `judgedAgainst`,
   `criteriaFindings`, `coverageFindings`, `rationale`), and
   `verdict.authority === deriveAcceptanceAuthority(verdict.measurability,
verdict.confidence)` — the spec's success criterion 4.
4. `resolveTestContent` returns `testContent` verbatim when supplied directly;
   otherwise concatenates the contents of every file matched by `testGlobs` (each
   prefixed by a `// <path>` header); returns `undefined` when neither yields
   content (so responsibility (b) degrades to advisory-empty and never affects
   the (c) gate).
5. The tool is registered in `server.ts` (import + definitions array + handler
   map keyed `acceptance_eval`); `@harness-engineering/cli` builds and
   typechecks; `node packages/cli/dist/index.js validate` passes.

## File Map

- CREATE `packages/cli/src/mcp/tools/acceptance-eval.ts`
- CREATE `packages/cli/tests/mcp/tools/acceptance-eval.test.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (import + definitions array + handler map)

## Skeleton

_Not produced — task count (3) is below the standard-rigor threshold (8)._

## Tasks

### Task 1: acceptance_eval tool — definition + degrade-safe handler (TDD)

**Depends on:** none | **Files:** `packages/cli/tests/mcp/tools/acceptance-eval.test.ts`, `packages/cli/src/mcp/tools/acceptance-eval.ts`
**Skills:** none

This task delivers the tool with direct `testContent` passthrough only;
`testGlobs` resolution is added in Task 2.

1. Create the test file
   `packages/cli/tests/mcp/tools/acceptance-eval.test.ts` with exactly:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as os from 'os';
   import * as path from 'path';
   import * as fs from 'fs/promises';
   import { deriveAcceptanceAuthority } from '@harness-engineering/intelligence';
   import {
     acceptanceEvalDefinition,
     handleAcceptanceEval,
   } from '../../../src/mcp/tools/acceptance-eval.js';

   let tmpDir: string;

   function parseResult(result: { content: { text: string }[] }) {
     return JSON.parse(result.content[0].text);
   }

   beforeEach(async () => {
     tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acceptance-eval-test-'));
   });

   afterEach(async () => {
     await fs.rm(tmpDir, { recursive: true, force: true });
   });

   describe('acceptance_eval definition', () => {
     it('has the correct tool name', () => {
       expect(acceptanceEvalDefinition.name).toBe('acceptance_eval');
     });

     it('requires only specPath', () => {
       expect(acceptanceEvalDefinition.inputSchema.required).toEqual(['specPath']);
     });

     it('exposes optional model, testGlobs and testContent inputs', () => {
       const props = acceptanceEvalDefinition.inputSchema.properties;
       expect(props.model).toBeDefined();
       expect(props.testGlobs).toBeDefined();
       expect(props.testContent).toBeDefined();
     });

     it('does NOT expose a path / graph-persistence input (deferred)', () => {
       expect(
         (acceptanceEvalDefinition.inputSchema.properties as Record<string, unknown>).path
       ).toBeUndefined();
     });
   });

   describe('handleAcceptanceEval input contract', () => {
     it('errors when specPath is missing', async () => {
       // @ts-expect-error intentionally omitting specPath
       const result = await handleAcceptanceEval({});
       expect(result.isError).toBe(true);
       expect(parseResult(result).error).toMatch(/specPath/);
     });
   });

   describe('handleAcceptanceEval degrade-safe behaviour', () => {
     const savedKey = process.env.ANTHROPIC_API_KEY;

     beforeEach(() => {
       delete process.env.ANTHROPIC_API_KEY;
     });

     afterEach(() => {
       if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
       else process.env.ANTHROPIC_API_KEY = savedKey;
     });

     it('returns an advisory INCONCLUSIVE verdict when no provider is configured', async () => {
       const specPath = path.join(tmpDir, 'spec.md');
       await fs.writeFile(
         specPath,
         '# Spec\n\n## Success Criteria\n\n- The endpoint returns 404 for missing users.\n'
       );

       const result = await handleAcceptanceEval({ specPath });

       expect(result.isError).toBeUndefined();
       const verdict = parseResult(result);
       expect(verdict.measurability).toBe('INCONCLUSIVE');
       expect(verdict.confidence).toBe('low');
       expect(verdict.authority).toBe('advisory');
     });

     it('returns the full AcceptanceVerdict shape with TS-derived authority', async () => {
       const specPath = path.join(tmpDir, 'spec.md');
       await fs.writeFile(specPath, '# Spec\n\n## Success Criteria\n\n- Does a thing.\n');

       const result = await handleAcceptanceEval({ specPath });
       const verdict = parseResult(result);

       expect(verdict).toHaveProperty('measurability');
       expect(verdict).toHaveProperty('confidence');
       expect(verdict).toHaveProperty('authority');
       expect(verdict).toHaveProperty('judgedAgainst');
       expect(verdict).toHaveProperty('rationale');
       expect(Array.isArray(verdict.criteriaFindings)).toBe(true);
       expect(Array.isArray(verdict.coverageFindings)).toBe(true);

       // Success criterion 4: authority is exactly the TS-derived value,
       // never read from the LLM.
       expect(verdict.authority).toBe(
         deriveAcceptanceAuthority(verdict.measurability, verdict.confidence)
       );
     });
   });
   ```

2. Run the test — observe failure (module not found):
   `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/acceptance-eval.test.ts`
3. Create `packages/cli/src/mcp/tools/acceptance-eval.ts` with exactly:

   ```ts
   /**
    * MCP tool: `mcp__harness__acceptance_eval`.
    *
    * Pre-execution acceptance-criteria measurability judgment — the upstream twin
    * of `outcome_eval`. Wraps the intelligence-package `AcceptanceEvaluator` so an
    * agent can run the TS-derived-authority seam (evaluate -> deriveAuthority)
    * rather than emulating the verdict in chat (ADR: authority is never read from
    * the LLM, extended to a pre-execution gate).
    *
    * Provider resolution mirrors `outcome-eval.ts`: a real `AnalysisProvider`
    * (`.analyze<T>()`) is constructed only when `ANTHROPIC_API_KEY` is present;
    * otherwise an always-rejecting stub makes the evaluator degrade safely to
    * INCONCLUSIVE/low/advisory — never blocking.
    *
    * NOTE (persistence seam, deferred): unlike `outcome-eval`, this tool takes no
    * `path?` and holds no GraphStore. There is no acceptance-outcome node type and
    * Phase 1 did not persist verdicts (spec non-goals defer graph-backed work,
    * handoff concern C1). When persistence lands, add a `path?` input and a graph
    * write here — the evaluator surface is unchanged.
    *
    * Source: docs/changes/harness-pm-persona/proposal.md (Technical design -> MCP tool).
    */

   interface ToolResponse {
     content: Array<{ type: 'text'; text: string }>;
     isError?: boolean;
   }

   export interface AcceptanceEvalToolInput {
     /** Absolute or repo-relative path to the spec markdown. Required. */
     specPath: string;
     /** Glob(s) locating test files; their contents become the (b) evidence. */
     testGlobs?: string[];
     /** Pre-collected test snippets (the (b) evidence), used as-is when present. */
     testContent?: string;
     /** Optional model override for the acceptance-eval LLM call. */
     model?: string;
   }

   export const acceptanceEvalDefinition = {
     name: 'acceptance_eval',
     description:
       'Pre-execution LLM-judgment: does a spec carry measurable, testable, complete ' +
       'acceptance criteria? The upstream twin of outcome_eval. Reads the spec’s ' +
       'success/acceptance section, emits a confidence-rated AcceptanceVerdict ' +
       '(MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE) with criteriaFindings (a, advisory), ' +
       'coverageFindings (b, advisory) and a rationale. Authority is DERIVED in TypeScript, ' +
       'never trusted from the LLM: a high-confidence NOT_MEASURABLE is blocking; every ' +
       'other verdict is advisory. testGlobs/testContent are optional evidence for (b) — ' +
       'omitting them degrades coverage findings to advisory-empty but never affects the ' +
       'measurability gate.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         specPath: {
           type: 'string',
           description: 'Absolute or repo-relative path to the spec markdown to judge',
         },
         testGlobs: {
           type: 'array',
           items: { type: 'string' },
           description:
             'Optional globs locating test files; their contents supply the (b) coverage ' +
             'evidence. Ignored when testContent is provided.',
         },
         testContent: {
           type: 'string',
           description:
             'Optional pre-collected test snippets (the (b) evidence). Takes precedence ' +
             'over testGlobs.',
         },
         model: {
           type: 'string',
           description: 'Optional model override for the acceptance-eval LLM call',
         },
       },
       required: ['specPath'],
     },
   };

   /**
    * Resolve a real AnalysisProvider. Mirrors outcome-eval.ts: construct
    * AnthropicAnalysisProvider when ANTHROPIC_API_KEY is present; otherwise null,
    * so the caller substitutes an always-rejecting stub and the verdict degrades.
    */
   async function resolveAnalysisProvider(model?: string): Promise<unknown> {
     try {
       const intelligence = (await import('@harness-engineering/intelligence')) as Record<
         string,
         unknown
       >;
       const apiKey = process.env.ANTHROPIC_API_KEY;
       if (!apiKey) return null;
       const Provider = intelligence.AnthropicAnalysisProvider as
         | (new (opts: { apiKey: string; defaultModel?: string }) => unknown)
         | undefined;
       if (typeof Provider !== 'function') return null;
       return new Provider(model !== undefined ? { apiKey, defaultModel: model } : { apiKey });
     } catch {
       return null;
     }
   }

   /** Validate required inputs. Returns an error message or null. */
   function validateInput(input: AcceptanceEvalToolInput): string | null {
     if (typeof input?.specPath !== 'string' || input.specPath.length === 0) {
       return 'acceptance_eval: `specPath` is required';
     }
     return null;
   }

   /**
    * Resolve the (b) coverage evidence into a single string. testContent wins;
    * otherwise read every file matched by testGlobs. Always degrade-safe: an
    * unmatched/unreadable glob yields undefined, so (b) stays advisory-empty and
    * the (c) gate is unaffected.
    *
    * (Implemented in Task 2 — Task 1 ships a passthrough-only stub.)
    */
   async function resolveTestContent(input: AcceptanceEvalToolInput): Promise<string | undefined> {
     if (typeof input.testContent === 'string' && input.testContent.length > 0) {
       return input.testContent;
     }
     return undefined;
   }

   export async function handleAcceptanceEval(
     input: AcceptanceEvalToolInput
   ): Promise<ToolResponse> {
     const validationError = validateInput(input);
     if (validationError !== null) return errorResponse(validationError);

     try {
       const { AcceptanceEvaluator } = await import('@harness-engineering/intelligence');
       const provider = await resolveAnalysisProvider(input.model);
       const evaluator = new AcceptanceEvaluator(
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         (provider ?? unconfiguredProvider()) as any,
         input.model !== undefined ? { model: input.model } : {}
       );

       const testContent = await resolveTestContent(input);
       const verdict = await evaluator.evaluate({
         specPath: input.specPath,
         ...(testContent !== undefined && { testContent }),
       });

       // Return the verdict EXACTLY as produced — authority is TS-derived
       // (deriveAcceptanceAuthority); the handler never recomputes or overrides it.
       return { content: [{ type: 'text', text: JSON.stringify(verdict, null, 2) }] };
     } catch (err) {
       const message = err instanceof Error ? err.message : String(err);
       return errorResponse(`acceptance_eval failed: ${message}`);
     }
   }

   /**
    * A provider whose analyze() always rejects. Used only when no real provider is
    * configured: the evaluator's judge() catches the rejection and degrades to
    * INCONCLUSIVE/low/advisory, so "missing provider => never blocks" holds
    * without special-casing in the handler.
    */
   function unconfiguredProvider(): { analyze: () => Promise<never> } {
     return {
       analyze: () =>
         Promise.reject(
           new Error(
             'No analysis provider configured (set ANTHROPIC_API_KEY). ' +
               'Degrading to an inconclusive, advisory verdict.'
           )
         ),
     };
   }

   function errorResponse(message: string): ToolResponse {
     return {
       content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
       isError: true,
     };
   }
   ```

4. Run the test — observe pass:
   `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/acceptance-eval.test.ts`
5. Run: `node packages/cli/dist/index.js validate`
6. Commit: `feat(acceptance-eval): add acceptance_eval MCP tool`

### Task 2: testGlobs → testContent resolution (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/mcp/tools/acceptance-eval.test.ts`, `packages/cli/src/mcp/tools/acceptance-eval.ts`
**Skills:** none

1. Append a describe block to the test file asserting glob-based (b) evidence
   collection. Add it after the degrade-safe block:

   ```ts
   describe('resolveTestContent (b) evidence resolution', () => {
     it('returns testContent verbatim when provided', async () => {
       const out = await resolveTestContent({ specPath: 'x', testContent: 'direct snippet' });
       expect(out).toBe('direct snippet');
     });

     it('concatenates contents of all files matched by testGlobs with path headers', async () => {
       const a = path.join(tmpDir, 'a.test.ts');
       const b = path.join(tmpDir, 'b.test.ts');
       await fs.writeFile(a, 'AAA');
       await fs.writeFile(b, 'BBB');

       const out = await resolveTestContent({
         specPath: 'x',
         testGlobs: [path.join(tmpDir, '*.test.ts')],
       });

       expect(out).toContain('AAA');
       expect(out).toContain('BBB');
       expect(out).toContain(a);
       expect(out).toContain(b);
     });

     it('returns undefined when neither testContent nor testGlobs yields content', async () => {
       expect(await resolveTestContent({ specPath: 'x' })).toBeUndefined();
       expect(
         await resolveTestContent({ specPath: 'x', testGlobs: [path.join(tmpDir, 'nope-*.ts')] })
       ).toBeUndefined();
     });
   });
   ```

   And add `resolveTestContent` to the import from the tool module at the top of
   the test file:

   ```ts
   import {
     acceptanceEvalDefinition,
     handleAcceptanceEval,
     resolveTestContent,
   } from '../../../src/mcp/tools/acceptance-eval.js';
   ```

2. Run the test — observe failure (`resolveTestContent` not exported / glob path
   not implemented):
   `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/acceptance-eval.test.ts`
3. In `packages/cli/src/mcp/tools/acceptance-eval.ts`, add the imports at the top
   (below the file header comment, above the `ToolResponse` interface):

   ```ts
   import { readFile } from 'node:fs/promises';
   import { findFiles } from '../../utils/files.js';
   ```

   Then replace the passthrough-only `resolveTestContent` stub with the full
   implementation and `export` it:

   ```ts
   export async function resolveTestContent(
     input: AcceptanceEvalToolInput
   ): Promise<string | undefined> {
     if (typeof input.testContent === 'string' && input.testContent.length > 0) {
       return input.testContent;
     }
     if (!Array.isArray(input.testGlobs) || input.testGlobs.length === 0) {
       return undefined;
     }
     const seen = new Set<string>();
     const parts: string[] = [];
     for (const pattern of input.testGlobs) {
       let files: string[] = [];
       try {
         files = await findFiles(pattern);
       } catch {
         continue; // unmatched/invalid glob: degrade-safe skip
       }
       for (const file of files) {
         if (seen.has(file)) continue;
         seen.add(file);
         try {
           parts.push(`// ${file}\n${await readFile(file, 'utf8')}`);
         } catch {
           // unreadable file: skip, never throw
         }
       }
     }
     return parts.length > 0 ? parts.join('\n\n') : undefined;
   }
   ```

   (Remove the `(Implemented in Task 2 ...)` line from the doc comment.)

4. Run the test — observe pass:
   `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/acceptance-eval.test.ts`
5. Run: `node packages/cli/dist/index.js validate`
6. Commit: `feat(acceptance-eval): resolve testGlobs into (b) coverage evidence`

### Task 3: Register acceptance_eval in the MCP server

**Depends on:** Task 2 | **Files:** `packages/cli/src/mcp/server.ts` | **Category:** integration
**Skills:** none

1. Add the import immediately after the `outcome-eval` import (line ~204):

   ```ts
   import { acceptanceEvalDefinition, handleAcceptanceEval } from './tools/acceptance-eval.js';
   ```

2. Add the definition to the definitions array immediately after
   `outcomeEvalDefinition,` (line ~327):

   ```ts
     acceptanceEvalDefinition,
   ```

3. Add the handler to the handler map immediately after the `outcome_eval:` entry
   (line ~420):

   ```ts
     acceptance_eval: handleAcceptanceEval as unknown as ToolHandler,
   ```

4. Build and typecheck the package:
   `pnpm --filter @harness-engineering/cli... build`
5. Confirm registration via grep (expect three hits):
   `grep -n "acceptance_eval\|acceptanceEvalDefinition\|handleAcceptanceEval" packages/cli/src/mcp/server.ts`
6. Run the full tool test once more against the build:
   `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/acceptance-eval.test.ts`
7. Run: `node packages/cli/dist/index.js validate`
8. `[checkpoint:human-verify]` — Show the grep output and the passing test run.
   Confirm `acceptance_eval` is wired into the server registry (import +
   definitions array + handler map) and that the package builds cleanly, before
   the plan is considered complete. MCP registration desyncs are silent — a human
   eyeball on the three insertion points guards against a tool that compiles but
   never surfaces.
9. Commit: `feat(acceptance-eval): register acceptance_eval MCP tool`

## Sequencing

Task 1 → Task 2 → Task 3 (strict chain: Task 2 extends Task 1's file; Task 3
registers the completed tool). No parallelism. Estimated ~14 min total.

## Notes / Carried concerns

- **C1 (resolved by the baked-in decision):** no `path?`, no GraphStore; the
  persistence seam is documented as deferred in the tool's header comment.
- **C3 (non-applicable to Phase 2):** the `buildAcceptanceUserPrompt` alias is
  only needed by callers of the prompt builder; this tool calls the evaluator, so
  it imports neither the builder nor its alias.
- **Pre-existing arch-check baseline noise** (module-size / dependency-depth
  regression from the known baseline-scope clobber) is not introduced here and
  does not block commits; `node dist/index.js validate` passes clean from the
  repo root.
