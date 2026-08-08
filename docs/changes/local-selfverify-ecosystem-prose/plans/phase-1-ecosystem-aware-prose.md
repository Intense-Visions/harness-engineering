# Plan: Ecosystem-aware self-verify prose in the local stage prompt

**Date:** 2026-08-08 | **Spec:** `docs/changes/local-selfverify-ecosystem-prose/proposal.md` | **Tasks:** 5 | **Time:** ~20 min | **Package:** `@harness-engineering/orchestrator`

## Goal

Make the LOCAL stage prompt's self-verify command block render the detected ecosystem's verify commands (reusing `detectEcosystem` from #1115) instead of the hardcoded `pnpm --filter …` lines, mirroring the enforced gate's node / non-node split.

## Observable Truths (Acceptance Criteria)

1. On a non-node workspace (e.g. `Cargo.toml` / `uv.lock` present), the rendered LOCAL stage prompt's self-verify block contains that ecosystem's commands (`cargo build`, `cargo test`, `uv run pytest`, …) and NO `pnpm --filter` line.
2. On a node workspace (or a workspace with no recognized manifest / unreadable root), the rendered self-verify block is byte-identical to today's scoped `pnpm --filter <changed-package-name> typecheck` / `lint` / `test` prose.
3. The default (cloud) `STAGE_PROMPT_TEMPLATE` render path is byte-identical to before — it never references `verifyCommands` and `strictVariables: true` does not trip.
4. Detection reuses `detectEcosystem` from `workspace/ecosystem.ts`; no duplicated detection logic is introduced.
5. `pnpm --filter @harness-engineering/orchestrator typecheck | lint | test` all pass; a changeset entry exists.

## Key facts verified by reading the code

- `detectEcosystem(workspacePath: string): Ecosystem | null` lives in `packages/orchestrator/src/workspace/ecosystem.ts`; returns `null` on an unreadable/unrecognized root. `Ecosystem.language` is the family string (`'node'`, `'python'`, `'rust'`, …); `Ecosystem.verifyCommands` is `readonly string[]`.
- `renderStagePromptFactory(promptRenderer, issue, priorGateFailure?)` in `orchestrator-context.ts` (lines 308-355) is **not exported** — its render closure builds the LiquidJS context bag. `buildWorkflowContext` (line 403) already destructures `workspacePath` from deps and passes it to `persistStageDocumentFactory` (line 431); the `renderStagePrompt` call site is line 430.
- `PromptRenderer` (`prompt/renderer.ts`) runs `Liquid` with `strictVariables: true` — the template may reference only variables present in the bag; an extra unreferenced bag entry is safe.
- The hardcoded self-verify bash block is `LOCAL_STAGE_PROMPT_TEMPLATE` lines 57-61; the template's leading doc-comment enumerates the variable set at lines 6-8 (`stageNumber, identifier, title, description, skill, cognitiveMode, produces, priorEntries`).
- Tests live in `packages/orchestrator/src/workflow/local-stage-prompt.test.ts`; `RENDER_BAG` (lines 11-22) is the canonical full bag. There is **no** separate `orchestrator-context.test.ts`.
- Package name (from `packages/orchestrator/package.json`): **`@harness-engineering/orchestrator`**, `version: 0.20.0` (publishable → changeset required).

## Design note (testability)

The derivation logic is extracted into a small **exported pure helper** `deriveVerifyCommands(workspacePath)` in `orchestrator-context.ts`, and the private render closure calls it. This keeps detection inside the closure's control flow (spec §Technical design step 2), reuses `detectEcosystem` (no duplication, criterion 4), and makes the node/non-node split unit-testable without exporting the whole factory.

## Files to modify

- MODIFY `packages/orchestrator/src/workflow/orchestrator-context.ts` — add `deriveVerifyCommands` helper + `import { detectEcosystem }`; thread `workspacePath` into `renderStagePromptFactory`; add `verifyCommands` to the render bag; update the `buildWorkflowContext` call site.
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.ts` — replace the hardcoded 3-line bash block with a `verifyCommands` loop; update the leading doc-comment variable list.
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` — add `verifyCommands` to `RENDER_BAG`; add the ecosystem/fallback/default-unaffected assertions.
- CREATE `.changeset/ecosystem-aware-selfverify-prose.md` — `'@harness-engineering/orchestrator': patch`.

## Tasks

Follow TDD where practical: Task 1 (test) is authored before Tasks 2-3 make it pass. All commands run from the repo root with the Node-22 PATH prefix
`export PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:$PATH";`.

---

### Task 1: Add failing unit coverage for ecosystem-aware verify prose

**Depends on:** none | **Files:** `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` | **Category:** test (TDD red)

1. Add `verifyCommands` to the shared `RENDER_BAG` (after `priorEntries`, matching the new required template variable) so every existing render test keeps passing:
   ```ts
   verifyCommands: [
     'pnpm --filter <changed-package-name> typecheck',
     'pnpm --filter <changed-package-name> lint',
     'pnpm --filter <changed-package-name> test',
   ] as string[],
   ```
2. Add an import for the new helper and Node built-ins at the top of the file:
   ```ts
   import { deriveVerifyCommands } from './orchestrator-context';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   ```
3. Append a new describe block asserting all three success criteria. Use real temp dirs so `detectEcosystem` runs against disk:

   ```ts
   describe('LOCAL self-verify block is ecosystem-aware (proposal SC1-SC3)', () => {
     const renderer = new PromptRenderer();

     const SCOPED_PNPM_FALLBACK = [
       'pnpm --filter <changed-package-name> typecheck',
       'pnpm --filter <changed-package-name> lint',
       'pnpm --filter <changed-package-name> test',
     ];

     function mkWorkspace(markers: string[]): string {
       const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-'));
       for (const m of markers) fs.writeFileSync(path.join(dir, m), '');
       return dir;
     }

     // SC1: non-node ecosystem → that toolchain's commands, NO pnpm --filter
     it('renders the detected non-node ecosystem commands and no pnpm --filter line', async () => {
       const dir = mkWorkspace(['Cargo.toml']);
       const verifyCommands = deriveVerifyCommands(dir);
       expect(verifyCommands).toEqual(['cargo build', 'cargo test']);
       const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
         ...RENDER_BAG,
         produces: 'impl',
         documentPath: '',
         reviewStage: '',
         verifyCommands,
       });
       expect(out).toContain('cargo build');
       expect(out).toContain('cargo test');
       expect(out).not.toContain('pnpm --filter');
     });

     // SC2a: node workspace → byte-identical scoped pnpm fallback
     it('falls back to the scoped pnpm prose on a node workspace', () => {
       const dir = mkWorkspace(['pnpm-lock.yaml']);
       expect(deriveVerifyCommands(dir)).toEqual(SCOPED_PNPM_FALLBACK);
     });

     // SC2b: unrecognized / unreadable workspace → same scoped pnpm fallback
     it('falls back to the scoped pnpm prose when no ecosystem is detected', () => {
       const empty = mkWorkspace([]);
       expect(deriveVerifyCommands(empty)).toEqual(SCOPED_PNPM_FALLBACK);
       expect(deriveVerifyCommands(path.join(empty, 'does-not-exist'))).toEqual(
         SCOPED_PNPM_FALLBACK
       );
     });

     // SC2 (render parity): the fallback bag renders the exact pre-change block
     it('renders the byte-identical scoped pnpm block for the fallback command set', async () => {
       const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
         ...RENDER_BAG,
         produces: 'impl',
         documentPath: '',
         reviewStage: '',
         verifyCommands: SCOPED_PNPM_FALLBACK,
       });
       expect(out).toContain(
         'pnpm --filter <changed-package-name> typecheck\n' +
           'pnpm --filter <changed-package-name> lint\n' +
           'pnpm --filter <changed-package-name> test\n'
       );
     });

     // SC3: default (cloud) template never references verifyCommands and renders
     // under strictVariables WITHOUT it in the bag.
     it('leaves the default template independent of verifyCommands (strictVariables safe)', async () => {
       expect(STAGE_PROMPT_TEMPLATE).not.toContain('verifyCommands');
       const { verifyCommands: _omit, ...bagWithoutVerify } = RENDER_BAG;
       await expect(renderer.render(STAGE_PROMPT_TEMPLATE, bagWithoutVerify)).resolves.toContain(
         'artifact.md'
       );
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test src/workflow/local-stage-prompt.test.ts`
5. **Acceptance:** the file fails to compile/run because `deriveVerifyCommands` is not yet exported and the template does not yet loop (red state confirmed). Do NOT commit yet.

---

### Task 2: Add `deriveVerifyCommands` and thread `workspacePath` into the render factory

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/orchestrator-context.ts`

1. Add the import near the top (with the other `./`-relative workflow imports, e.g. after the `selectStagePromptTemplate` import on line 17):
   ```ts
   import { detectEcosystem } from '../workspace/ecosystem.js';
   ```
2. Add the exported pure helper directly above `renderStagePromptFactory` (before line 307):
   ```ts
   /**
    * Derive the self-verify command set the LOCAL stage prompt renders. Mirrors the
    * enforced gate's node / non-node split (#1115): a non-node ecosystem renders THAT
    * toolchain's verify commands verbatim; a node ecosystem — or nothing detected
    * (unreadable / unrecognized root) — falls back to the existing scoped per-package
    * pnpm prose, byte-identical to the previously hardcoded block. Reuses
    * `detectEcosystem` (no duplicated detection logic).
    */
   export function deriveVerifyCommands(workspacePath: string): string[] {
     const ecosystem = detectEcosystem(workspacePath);
     return ecosystem !== null && ecosystem.language !== 'node'
       ? [...ecosystem.verifyCommands]
       : [
           'pnpm --filter <changed-package-name> typecheck',
           'pnpm --filter <changed-package-name> lint',
           'pnpm --filter <changed-package-name> test',
         ];
   }
   ```
3. Change the `renderStagePromptFactory` signature (line 308-312) to accept `workspacePath` before `priorGateFailure`:
   ```ts
   function renderStagePromptFactory(
     promptRenderer: PromptRenderer,
     issue: Issue,
     workspacePath: string,
     priorGateFailure?: string
   ): NonNullable<WorkflowEngineContext['renderStagePrompt']> {
   ```
4. Inside the render closure, compute the commands once before the `promptRenderer.render(...)` call (before line 330):
   ```ts
   const verifyCommands = deriveVerifyCommands(workspacePath);
   ```
5. Add `verifyCommands` to the render context bag (inside the object passed to `promptRenderer.render`, e.g. right after `produces,` on line 343 / before `documentPath`):
   ```ts
   // Ecosystem-aware self-verify prose: the LOCAL template loops this set; the
   // default template never references it (strictVariables-safe extra bag entry).
   verifyCommands,
   ```
6. Update the `buildWorkflowContext` call site (line 430) to pass `workspacePath`:
   ```ts
   renderStagePrompt: renderStagePromptFactory(
     promptRenderer,
     issue,
     workspacePath,
     deps.priorGateFailure
   ),
   ```
   (`workspacePath` is already destructured on line 404 — no new destructure needed.)
7. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
8. **Acceptance:** typecheck passes; `deriveVerifyCommands` is exported and importable; the Task-1 `deriveVerifyCommands` assertions now pass (template loop still pending → render assertions still red).

---

### Task 3: Replace the hardcoded self-verify block with a `verifyCommands` loop

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/local-stage-prompt.ts`

1. Replace the hardcoded bash block (lines 57-61) — currently:
   ```
   \`\`\`bash
   pnpm --filter <changed-package-name> typecheck
   pnpm --filter <changed-package-name> lint
   pnpm --filter <changed-package-name> test
   \`\`\`
   ```
   with the LiquidJS loop (preserving the enclosing ```bash fences and the surrounding prose exactly):
   ```
   \`\`\`bash
   {% for cmd in verifyCommands %}{{ cmd }}
   {% endfor %}\`\`\`
   ```
   The `{% endfor %}` must sit immediately before the closing fence backticks so each command emits `cmd\n` and the fallback set reproduces the pre-change block byte-for-byte (one trailing newline per command, then the closing fence).
2. Update the leading doc-comment (lines 6-8) so the enumerated variable set includes `verifyCommands`:
   ```
    * Mirrors {@link STAGE_PROMPT_TEMPLATE}'s variable set (`stageNumber`,
    * `identifier`, `title`, `description`, `skill`, `cognitiveMode`, `produces`,
    * `priorEntries`) plus the LOCAL-only `verifyCommands` (the ecosystem-aware
    * self-verify command list) and the optional `documentPath` / `reviewStage` flags
   ```
   (Keep the surrounding `strictVariables` sentence intact; only extend the variable enumeration. Do NOT rewrite the whole comment block.)
3. Run: `pnpm --filter @harness-engineering/orchestrator test src/workflow/local-stage-prompt.test.ts`
4. **Acceptance:** all tests in the file pass (green) — SC1 non-node commands render with no `pnpm --filter`; SC2 fallback renders the byte-identical scoped pnpm block; SC3 default template unaffected. The existing `RENDER_BAG` render tests still pass because `verifyCommands` was added to the bag in Task 1.

---

### Task 4: Add the changeset

**Depends on:** Task 3 | **Files:** `.changeset/ecosystem-aware-selfverify-prose.md` | **Category:** integration

1. Create `.changeset/ecosystem-aware-selfverify-prose.md`:

   ```
   ---
   '@harness-engineering/orchestrator': patch
   ---

   Local stage prompt now renders the detected ecosystem's self-verify commands (mirroring the enforced gate) instead of hardcoded pnpm --filter lines; non-node workspaces no longer get contradictory pnpm guidance.
   ```

2. **Acceptance:** file exists; package name matches `packages/orchestrator/package.json` (`@harness-engineering/orchestrator`); bump level is `patch`.

---

### Task 5: Self-verify the orchestrator package and commit

**Depends on:** Task 4 | **Files:** all changed files above | **Category:** verify

1. Run the scoped self-verify (the exact gate the changed prose now describes for this node workspace):
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   pnpm --filter @harness-engineering/orchestrator lint
   pnpm --filter @harness-engineering/orchestrator test
   ```
2. Fix any failure until all three are green (in particular, confirm no other orchestrator test asserted on the old hardcoded self-verify block — grep the package for `pnpm --filter <changed-package-name>` in `.test.ts` files and update any count/inventory assertion the change invalidates).
3. Run: `npx prettier --write packages/orchestrator/src/workflow/orchestrator-context.ts packages/orchestrator/src/workflow/local-stage-prompt.ts packages/orchestrator/src/workflow/local-stage-prompt.test.ts .changeset/ecosystem-aware-selfverify-prose.md`
4. Commit: `feat(orchestrator): render ecosystem-aware self-verify commands in local stage prompt`
5. **Acceptance:** typecheck + lint + test all green for `@harness-engineering/orchestrator`; clean diff (no scratch/backup files); all five observable truths hold.

## Sequencing / dependency summary

Task 1 (test, red) → Task 2 (factory + helper) → Task 3 (template loop, green) → Task 4 (changeset) → Task 5 (self-verify + commit). Tasks 2 and 3 both touch `src/workflow/` sibling files but different files with no shared symbol beyond the `verifyCommands` bag key, so they are logically ordered (helper before template) rather than parallel.

## Out of scope (from spec)

The enforced gate (already ecosystem-aware, #1115); the default cloud `STAGE_PROMPT_TEMPLATE`; the ecosystem detection table; adding new ecosystems.
