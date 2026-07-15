# Plan: Local backend full workflow — Phase 1 (Backend-aware template + local template)

**Date:** 2026-07-15 | **Spec:** docs/changes/local-backend-full-workflow/proposal.md | **Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** medium

## Goal

A `local`/`pi` dispatch renders a bash-shaped `harness.orchestrator.local.md` (no slash commands); a `primary` dispatch renders the default template; and when the local template file is absent, local dispatch falls back to the default template with no regression.

## Scope Boundary

Phase 1 ships **only** the two template files and the backend-aware resolver (SC1, SC2, SC5). The local template's `harness verify` / `harness outcome-eval` calls are **agent-run** for now — the harness-enforced gate loop (D2) that runs and blocks on those gates is **Phase 2** and is explicitly out of scope here. Do not implement any gate-execution or re-prompt loop in this plan.

## Observable Truths (Acceptance Criteria)

1. **SC1** — `resolvePromptTemplate(backendName)` returns the local template string when `config.agent.backends[backendName].type` is `pi` or `local` and a local template is loaded; returns the default template when the type is `claude`/other. Verified by a template-resolution unit test.
2. **SC2** — Both `harness.orchestrator.local.md` files (repo root + `templates/orchestrator/`) contain **zero** `/harness:` substrings and contain bash `harness verify` and `harness outcome-eval` gate invocations. Verified by a template-lint test.
3. **SC5** — When no local template is loaded (`localPromptTemplate` is `undefined`), `resolvePromptTemplate(backendName)` for a `local`/`pi` backend returns the **default** template (byte-identical to today). Verified by a fallback test.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` (add optional `localPromptTemplate?: string` to `WorkflowDefinition`)
- MODIFY `packages/orchestrator/src/workflow/loader.ts` (load sibling `harness.orchestrator.local.md`; absent → `undefined`)
- MODIFY `packages/orchestrator/tests/workflow/loader.test.ts` (assert loader populates `localPromptTemplate` present + absent)
- CREATE `harness.orchestrator.local.md` (repo root — bash-shaped local dispatch template)
- CREATE `templates/orchestrator/harness.orchestrator.local.md` (scaffolded copy for `harness init`)
- CREATE `packages/orchestrator/tests/prompt/local-template-lint.test.ts` (SC2 lint of both files)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (store `localPromptTemplate`, add `resolvePromptTemplate`, move render after backend-name resolution)
- CREATE `packages/orchestrator/src/orchestrator.template-resolution.test.ts` (SC1 + SC5)
- MODIFY `packages/cli/src/commands/orchestrator.ts` (thread `localPromptTemplate` into constructor overrides)

## Skeleton

1. Types + loader wiring (~2 tasks, ~9 min)
2. Local template files + lint test (~2 tasks, ~10 min)
3. Resolver + render move with TDD (~3 tasks, ~14 min)
4. CLI threading (~1 task, ~4 min)
5. Validate + finalize (~1 task, ~3 min)

_Skeleton approved: yes (coordinator, 2026-07-15)._

## Evidence Anchors (verified)

- `packages/orchestrator/src/orchestrator.ts:248,427,461` — single `promptTemplate: string` field; injected via constructor positional arg + `overrides` bag.
- `packages/orchestrator/src/orchestrator.ts:1948` — `this.renderer.render(this.promptTemplate, {...})` (step 4) runs **before** `routedBackendName` resolves at step 5 (~`:2005`). The rendered `prompt` is first consumed at `:2106` (`runAgentInBackgroundTask`), so the render can move to just after name resolution with no ordering hazard.
- `packages/orchestrator/src/orchestrator.ts:592,934,3218` — existing `def.type === 'local' || def.type === 'pi'` pattern via `this.config.agent.backends[name]?.type`.
- `packages/orchestrator/src/workflow/loader.ts:23,44` — `WorkflowLoader.loadWorkflow` splits frontmatter/body, returns `{ config, promptTemplate, warnings }`.
- `packages/types/src/orchestrator.ts:561,578` — `LocalBackendDef.type = 'local'`, `PiBackendDef.type = 'pi'`; `:1157` `WorkflowDefinition`.
- `packages/cli/src/commands/orchestrator.ts:31,37` — CLI destructures loader result and constructs `new Orchestrator(config, promptTemplate, { discoverCandidates })`.
- `harness.orchestrator.md:113-189` — the render-target body; workflow steps `:136-183` use `/harness:*` slash commands (source of truth for the bash-shaped rewrite).

## Tasks

---

### Task 1: Add optional `localPromptTemplate` to `WorkflowDefinition`

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

1. In `packages/types/src/orchestrator.ts`, locate the `WorkflowDefinition` interface (~`:1157`). Add the new optional field after `promptTemplate`:

   ```ts
   /** Template used to generate agent prompts */
   promptTemplate: string;
   /**
    * Backend-aware local dispatch template (Phase 1, local-backend-full-workflow).
    * Loaded from the sibling `harness.orchestrator.local.md` when present.
    * Undefined when the file is absent — resolution falls back to
    * `promptTemplate`, preserving pre-Phase-1 behavior (SC5).
    */
   localPromptTemplate?: string;
   ```

2. Run: `pnpm --filter @harness-engineering/types build` (verify the type compiles).
3. Run: `harness validate`
4. Commit: `feat(types): add optional localPromptTemplate to WorkflowDefinition`

---

### Task 2 (TDD): Load sibling local template in `WorkflowLoader`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/loader.ts`, `packages/orchestrator/tests/workflow/loader.test.ts`

1. In `packages/orchestrator/tests/workflow/loader.test.ts`, add two tests (adapt the existing tmp-dir fixture pattern already in that file — write a `harness.orchestrator.md` to a tmp dir and call `loader.loadWorkflow(path)`):

   ```ts
   it('loads the sibling local template when present (Phase 1 SC-load)', async () => {
     // writes harness.orchestrator.md AND harness.orchestrator.local.md
     // to the same tmp dir, then asserts:
     const result = await loader.loadWorkflow(mainPath);
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.localPromptTemplate).toContain('harness verify');
       expect(result.value.localPromptTemplate).not.toContain('/harness:');
     }
   });

   it('leaves localPromptTemplate undefined when the sibling file is absent (SC5)', async () => {
     // writes ONLY harness.orchestrator.md
     const result = await loader.loadWorkflow(mainPath);
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.localPromptTemplate).toBeUndefined();
     }
   });
   ```

   In the first test's fixture, write a minimal local file body containing `harness verify` and no `/harness:` (e.g. `"---\nx: 1\n---\nrun harness verify"`).

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- loader.test` — observe the two new tests FAIL (loader does not yet populate the field).

3. In `packages/orchestrator/src/workflow/loader.ts`, inside `loadWorkflow`, after `promptTemplate` is extracted and before the `Ok({...})` return, read the sibling file:

   ```ts
   // Phase 1 (local-backend-full-workflow): load the backend-aware local
   // dispatch template from the sibling file when present. Absent -> undefined,
   // so resolution falls back to the default template (SC5). We read it
   // best-effort: a missing file is expected (fallback), not an error.
   const localTemplatePath = path.join(path.dirname(filePath), 'harness.orchestrator.local.md');
   let localPromptTemplate: string | undefined;
   try {
     const localContent = await fs.readFile(localTemplatePath, 'utf-8');
     const localParts = localContent.split('---');
     localPromptTemplate =
       localParts.length >= 3 ? localParts.slice(2).join('---').trim() : localContent.trim();
   } catch {
     localPromptTemplate = undefined;
   }
   ```

   Then extend the success return:

   ```ts
   return Ok({
     config: configResult.value.config,
     promptTemplate,
     localPromptTemplate,
     warnings: configResult.value.warnings,
   });
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test -- loader.test` — observe all pass.
5. Run: `harness check-deps`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): load sibling harness.orchestrator.local.md in WorkflowLoader`

---

### Task 3: Author the local dispatch template (repo root) `[checkpoint:human-verify]`

**Depends on:** none | **Files:** `harness.orchestrator.local.md`

`[checkpoint:human-verify]` — The template body is the crux of the feature. After writing, present the full body to the human for review before proceeding. Do not commit until confirmed.

1. Create `harness.orchestrator.local.md` at the repo root. Frontmatter: reuse the **exact frontmatter** of `harness.orchestrator.md` (copy the `---`…`---` block verbatim so the loader parses an identical config contract). Only the body below the second `---` differs.

2. The body MUST satisfy all four requirements:
   - (a) contain **NO** `/harness:` slash commands anywhere;
   - (b) inline the workflow methodology as prose steps (brainstorm → plan → execute);
   - (c) invoke gates as bash `harness <gate>` calls (`harness verify` and `harness outcome-eval`);
   - (d) tell the agent that `verify`/`outcome-eval` are **also harness-enforced**, so it must reach a green state before shipping.

   Use this body (verbatim) below the frontmatter:

   ```markdown
   # Prompt Template (Local Backend)

   You are an autonomous coding agent working on this project via the local
   backend. You have `read`, `write`, `bash`, `grep`, and `find` — **no slash
   commands and no harness MCP tools**. Run the full workflow using the methodology
   below and the `harness` CLI over bash.

   ## Issue: {{ issue.title }}

   **Identifier:** {{ issue.identifier }}
   **Description:** {{ issue.description }}

   ## Workflow (methodology — no slash commands)

   1. **Brainstorm (inline):** Read the relevant conventions and existing code.
      Enumerate the exact files you will create or modify (including any
      registrations), and state the acceptance check that proves the issue is done.
      Do not invent scope beyond the issue.
   2. **Plan (inline):** Break the work into small, ordered steps. For each step,
      note the file path and the change. Write tests first where practical.
   3. **Execute:** Implement the plan with your file tools, one step at a time.

   ## Gates (bash — enforced)

   Run these as bash commands and reach a **green** state before shipping:

   - `harness verify` — typecheck + lint + test. Fix every failure and re-run
     until it passes.
   - `harness outcome-eval` — when the issue has a spec/acceptance, run this to
     confirm the implementation satisfies it.

   **These gates are also enforced by the harness itself, not just by you.** A run
   that cannot reach a passing `harness verify` (and a non-blocking
   `harness outcome-eval` verdict) will be halted rather than shipped. Do not
   attempt to ship around a red gate — fix the implementation until the gate is
   green.

   ## Ship (only after gates are green)

   When `harness verify` passes and `harness outcome-eval` is non-blocking:

   - Create a topic branch if you are still on `main`/`master`
     (e.g. `feat/{{ issue.identifier }}`).
   - Stage your changes and create a descriptive commit (Conventional Commits style).
   - Push the branch with `git push -u origin HEAD`.
   - Open a pull request with `gh pr create`. Use a HEREDOC for the body:
   ```

   gh pr create --title "<title>" --body "$(cat <<'EOF'

   ## Summary

     <body content with real newlines>
     EOF
     )"
     ```
   - Report the PR URL as your final output, then stop.

   ## Rules
   - Always verify your changes with `harness verify` before shipping.
   - Adhere to the architectural constraints defined in `harness.config.json`.
   - Do not use `/harness:` slash commands — they are unavailable on this backend.
   - Shipping is the terminal step; do not pause to ask for commit authorization.

   Attempt Number: {{ attempt }}

   ```

   ```

3. Present the full file to the human (checkpoint). On confirmation, proceed.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): add root harness.orchestrator.local.md dispatch template`

---

### Task 4: Ship the scaffolded copy for `harness init`

**Depends on:** Task 3 | **Files:** `templates/orchestrator/harness.orchestrator.local.md` | **Category:** integration

1. Copy the confirmed root template to the scaffold location so `harness init` ships it alongside the default:

   ```bash
   cp harness.orchestrator.local.md templates/orchestrator/harness.orchestrator.local.md
   ```

   (Keep the two byte-identical; if a lint/format hook rewrites one, re-sync the other.)

2. Run: `harness validate`
3. Commit: `feat(orchestrator): scaffold harness.orchestrator.local.md via harness init`

---

### Task 5 (TDD): Template-lint test for both local template files (SC2)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/prompt/local-template-lint.test.ts`

1. Create `packages/orchestrator/tests/prompt/local-template-lint.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';

   // Repo root is 4 levels up from packages/orchestrator/tests/prompt/.
   const repoRoot = path.resolve(__dirname, '../../../../');

   const TEMPLATES = [
     path.join(repoRoot, 'harness.orchestrator.local.md'),
     path.join(repoRoot, 'templates/orchestrator/harness.orchestrator.local.md'),
   ];

   describe('harness.orchestrator.local.md lint (Phase 1 SC2)', () => {
     for (const file of TEMPLATES) {
       describe(path.relative(repoRoot, file), () => {
         const body = fs.readFileSync(file, 'utf-8');

         it('exists and is non-empty', () => {
           expect(body.trim().length).toBeGreaterThan(0);
         });

         it('contains NO /harness: slash-command instructions', () => {
           expect(body).not.toContain('/harness:');
         });

         it('invokes gates as bash `harness <gate>` calls', () => {
           expect(body).toContain('harness verify');
           expect(body).toContain('harness outcome-eval');
         });
       });
     }
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-template-lint` — observe all pass (the files exist from Tasks 3–4).

   > Note: this test asserts an already-satisfied invariant (files authored in Tasks 3–4). It is a guard, not a red-green pair; that is acceptable for a lint-of-static-asset test. If either assertion fails, fix the template body, not the test.

3. Run: `harness validate`
4. Commit: `test(orchestrator): lint local template for no-slash-commands + bash gates`

---

### Task 6 (TDD): Add `resolvePromptTemplate` + store `localPromptTemplate` (SC1, SC5)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.template-resolution.test.ts`

1. Create `packages/orchestrator/src/orchestrator.template-resolution.test.ts`. Model the fixture on `orchestrator.quality-verdict.test.ts` (MockBackend + mock tracker + minimal `WorkflowConfig` with `agent.backends`). Register a `local`-typed backend and a `claude`/`mock`-typed backend in `config.agent.backends`. Construct the Orchestrator with `overrides.localPromptTemplate = 'LOCAL_TEMPLATE'` and `promptTemplate = 'DEFAULT_TEMPLATE'`:

   ```ts
   it('returns the local template for a local/pi backend when loaded (SC1)', () => {
     const orch = makeOrchestrator({
       promptTemplate: 'DEFAULT_TEMPLATE',
       localPromptTemplate: 'LOCAL_TEMPLATE',
       backends: { local: { type: 'local' /* ...caps */ }, primary: { type: 'claude' /* ... */ } },
     });
     expect((orch as any).resolvePromptTemplate('local')).toBe('LOCAL_TEMPLATE');
   });

   it('returns the default template for a non-local backend (SC1)', () => {
     const orch = makeOrchestrator({
       promptTemplate: 'DEFAULT_TEMPLATE',
       localPromptTemplate: 'LOCAL_TEMPLATE',
       backends: { primary: { type: 'claude' /* ... */ } },
     });
     expect((orch as any).resolvePromptTemplate('primary')).toBe('DEFAULT_TEMPLATE');
   });

   it('falls back to the default template for a local backend when no local template loaded (SC5)', () => {
     const orch = makeOrchestrator({
       promptTemplate: 'DEFAULT_TEMPLATE',
       localPromptTemplate: undefined,
       backends: { local: { type: 'local' /* ... */ } },
     });
     expect((orch as any).resolvePromptTemplate('local')).toBe('DEFAULT_TEMPLATE');
   });
   ```

   The `makeOrchestrator` helper builds the config and calls `new Orchestrator(config, promptTemplate, { backend: new MockBackend(), execFileFn: noopExecFile, localPromptTemplate })`. Cast to `any` to reach the private method (existing tests already use this pattern).

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- template-resolution` — observe FAIL (`resolvePromptTemplate` does not exist; `localPromptTemplate` override not stored).

3. In `packages/orchestrator/src/orchestrator.ts`:
   - Add the field near `:248`:
     ```ts
     private promptTemplate: string;
     /**
      * Backend-aware local dispatch template (Phase 1). Set from
      * `overrides.localPromptTemplate` (production: threaded by the CLI from
      * WorkflowLoader). Undefined -> resolvePromptTemplate falls back to the
      * default template (SC5).
      */
     private localPromptTemplate: string | undefined;
     ```
   - Extend the `overrides` bag type in the constructor signature (~`:428`) with:
     ```ts
     /** Phase 1: backend-aware local dispatch template. Undefined -> fallback. */
     localPromptTemplate?: string;
     ```
   - Store it near `:461`:
     ```ts
     this.promptTemplate = promptTemplate;
     this.localPromptTemplate = overrides?.localPromptTemplate;
     ```
   - Add the pure resolver method (place it near the render call, e.g. just above the method containing `:1948`):
     ```ts
     /**
      * Phase 1 (local-backend-full-workflow): pick the dispatch template for
      * the resolved backend. `pi`/`local` backends get the bash-shaped local
      * template when one was loaded; every other backend — and any local
      * backend with no local template loaded (SC5) — gets the default. Pure
      * over (backendName, config.agent.backends, localPromptTemplate,
      * promptTemplate); unit-tested by orchestrator.template-resolution.test.ts.
      */
     private resolvePromptTemplate(backendName: string): string {
       const def = this.config.agent.backends?.[backendName];
       const isLocal = def?.type === 'local' || def?.type === 'pi';
       if (isLocal && this.localPromptTemplate !== undefined) {
         return this.localPromptTemplate;
       }
       return this.promptTemplate;
     }
     ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test -- template-resolution` — observe all pass.
5. Run: `harness check-deps`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): add backend-aware resolvePromptTemplate (SC1/SC5)`

---

### Task 7: Move the dispatch render to use the resolved backend template

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `packages/orchestrator/src/orchestrator.ts`, remove the step-4 render block at `:1947-1950`:

   ```ts
   // 4. Render prompt
   const prompt = await this.renderer.render(this.promptTemplate, {
     issue,
     attempt: attempt || 1,
   });
   ```

2. Re-insert the render **after** `routedBackendName` is fully resolved (immediately after the `let routedBackendName: string; ... }` block that ends near `:2005`, before `// 6. Start agent session`):

   ```ts
   // 4. Render prompt (moved after backend-name resolution — Phase 1).
   // The template is now backend-aware: a local/pi dispatch renders the
   // bash-shaped local template, everything else renders the default.
   const prompt = await this.renderer.render(this.resolvePromptTemplate(routedBackendName), {
     issue,
     attempt: attempt || 1,
   });
   ```

3. Confirm `prompt` is still declared before its only consumer at `:2106` (`runAgentInBackgroundTask(... prompt ...)`). No other reads of `prompt` exist between old and new positions (verified: `:2106` is the sole downstream use).

4. Run: `pnpm --filter @harness-engineering/orchestrator test` — observe the existing orchestrator dispatch tests still pass (no regression; default-backend dispatches render the same default template).
5. Run: `harness validate`
6. Commit: `feat(orchestrator): render backend-aware template at dispatch (SC1)`

---

### Task 8: Thread `localPromptTemplate` from CLI loader into the Orchestrator

**Depends on:** Task 2, Task 6 | **Files:** `packages/cli/src/commands/orchestrator.ts` | **Category:** integration

1. In `packages/cli/src/commands/orchestrator.ts`, update the destructure (~`:31`) to include the new field:

   ```ts
   const { config, promptTemplate, localPromptTemplate, warnings } = result.value;
   ```

2. Update the construction (~`:37`) to pass it through the overrides bag:

   ```ts
   const daemon = new Orchestrator(config, promptTemplate, {
     discoverCandidates,
     localPromptTemplate,
   });
   ```

3. Run: `pnpm --filter @harness-engineering/cli build` (verify it typechecks against the extended overrides bag).
4. Run: `harness validate`
5. Commit: `feat(cli): thread localPromptTemplate from loader into Orchestrator`

---

### Task 9: Full validation + dependency check

**Depends on:** Task 5, Task 7, Task 8 | **Files:** none (verification)

1. Run: `pnpm --filter @harness-engineering/types --filter @harness-engineering/orchestrator --filter @harness-engineering/cli build`
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- template-resolution local-template-lint loader.test`
3. Run: `harness check-deps`
4. Run: `harness validate`
5. If all green, Phase 1 is complete. No commit (verification-only) unless a formatter touched files — then `git add -A && git commit -m "chore(orchestrator): format Phase 1 template-resolution files"`.

---

## Sequencing Notes

- **Dependency edges:** Task 1 (types) unblocks Tasks 2 and 6. Tasks 3→4→5 form the template chain. Task 6 (resolver) unblocks Task 7 (render move). Task 8 (CLI) depends on both the loader (Task 2) and the resolver override (Task 6). Task 9 gates on 5, 7, 8.
- **Parallelizable:** Tasks 1 and 3 touch disjoint files (types vs. root template) and can start in parallel. Tasks 2 and 3–5 are independent until they converge at Task 9.
- **File-overlap edges (for `plan_parallelization`):** Tasks 6 and 7 both modify `packages/orchestrator/src/orchestrator.ts` → serialize (6 before 7). Tasks 3 and 4 both touch the local template content → serialize.

## Integration Tier

**medium** — new feature within existing packages, new exports/scaffold assets, ~9 files. Integration tasks: Task 4 (scaffold copy for `harness init`) and Task 8 (CLI wiring) are tagged `category: integration`. Documentation updates (multi-backend-routing guide, AGENTS.md, ADRs for D2/D3) and knowledge materialization are deferred to **Phase 4** per the spec's Implementation Order and are **not** in this plan.

## Checkpoints

- **Task 3** — `[checkpoint:human-verify]` on the local template body. The human reviews the full template content at execution time before it is committed.

## Traceability

| Observable Truth                      | Delivered by                                                   |
| ------------------------------------- | -------------------------------------------------------------- |
| SC1 (backend-aware selection)         | Task 6 (resolver), Task 7 (render move), Task 6 tests          |
| SC2 (no slash commands, bash gates)   | Task 3 (root template), Task 4 (scaffold), Task 5 (lint test)  |
| SC5 (fallback to default when absent) | Task 2 (loader absent-case), Task 6 (resolver fallback + test) |
