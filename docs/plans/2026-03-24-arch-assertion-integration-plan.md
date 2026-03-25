# Plan: Architecture Assertion Framework — Phase 7 Integration

**Date:** 2026-03-24
**Spec:** docs/changes/architecture-assertion-framework/proposal.md
**Estimated tasks:** 6
**Estimated time:** 20 minutes

## Goal

Integrate `harness check-arch` into the CI pipeline, add default architecture config to `harness.config.json`, and update the `enforce-architecture` skill to reference the new command.

## Observable Truths (Acceptance Criteria)

1. When `harness ci check --json` runs, the output includes an `"arch"` check entry alongside existing checks (validate, deps, docs, entropy, security, perf, phase-gate).
2. The `harness.config.json` at project root contains an `"architecture"` section with `enabled: true`, a `baselinePath`, and sensible default thresholds matching the spec schema.
3. When CI workflows execute, `harness check-arch` is validated as part of the `harness ci check` aggregated command (no separate workflow step needed since the orchestrator includes it).
4. The `enforce-architecture` skill references `harness check-arch` alongside `harness check-deps` in its Harness Integration section.
5. `pnpm test` passes across all packages (no regressions from integration changes).
6. `harness validate` passes after all changes.

## File Map

- MODIFY `packages/types/src/index.ts` (add `'arch'` to `CICheckName` union)
- MODIFY `packages/core/src/ci/check-orchestrator.ts` (add `'arch'` to `ALL_CHECKS`, add case to `runSingleCheck`)
- MODIFY `packages/core/tests/ci/check-orchestrator.test.ts` (add mock for architecture modules, add test for arch check)
- MODIFY `packages/cli/src/commands/ci/check.ts` (add `'arch'` to `VALID_CHECKS`)
- MODIFY `packages/cli/src/commands/ci/init.ts` (add `'arch'` to `ALL_CHECKS`)
- MODIFY `harness.config.json` (add `architecture` section with defaults)
- MODIFY `agents/skills/claude-code/enforce-architecture/SKILL.md` (add `harness check-arch` reference)

## Tasks

### Task 1: Add `'arch'` to CICheckName type

**Depends on:** none
**Files:** `packages/types/src/index.ts`

1. Open `packages/types/src/index.ts` and locate the `CICheckName` type union (line 113).
2. Add `| 'arch'` to the union:
   ```typescript
   export type CICheckName =
     | 'validate'
     | 'deps'
     | 'docs'
     | 'entropy'
     | 'security'
     | 'perf'
     | 'phase-gate'
     | 'arch';
   ```
3. Run: `pnpm --filter @harness-engineering/types build`
4. Run: `harness validate`
5. Commit: `feat(types): add 'arch' to CICheckName union for architecture checks`

### Task 2: Add arch check to CI orchestrator

**Depends on:** Task 1
**Files:** `packages/core/src/ci/check-orchestrator.ts`

1. Add import for architecture modules at top of file:
   ```typescript
   import { ArchConfigSchema, runAll as runArchCollectors } from '../architecture';
   ```
2. Add `'arch'` to the `ALL_CHECKS` array (line 27):
   ```typescript
   const ALL_CHECKS: CICheckName[] = [
     'validate',
     'deps',
     'docs',
     'entropy',
     'security',
     'perf',
     'phase-gate',
     'arch',
   ];
   ```
3. Add a `case 'arch'` block inside the `switch (name)` statement in `runSingleCheck`, before the closing `}`:

   ```typescript
   case 'arch': {
     const rawArchConfig = config.architecture as Record<string, unknown> | undefined;
     const archConfig = ArchConfigSchema.parse(rawArchConfig ?? {});
     if (!archConfig.enabled) break;

     const results = await runArchCollectors(archConfig, projectRoot);
     for (const result of results) {
       for (const v of result.violations) {
         issues.push({
           severity: v.severity,
           message: `[${result.category}] ${v.detail}`,
           file: v.file,
         });
       }
     }
     break;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core build`
5. Run: `harness validate`
6. Commit: `feat(core): add architecture check to CI orchestrator`

### Task 3: Add arch check test to orchestrator test file

**Depends on:** Task 2
**Files:** `packages/core/tests/ci/check-orchestrator.test.ts`

1. Read the full test file to understand existing mock and test patterns.
2. Add a mock for the architecture module near the top (after the existing mocks):
   ```typescript
   vi.mock('../../src/architecture', () => ({
     ArchConfigSchema: {
       parse: vi.fn().mockReturnValue({
         enabled: true,
         baselinePath: '.harness/arch/baselines.json',
         thresholds: {},
         modules: {},
       }),
     },
     runAll: vi.fn().mockResolvedValue([]),
   }));
   ```
3. Add a test case: `it('includes arch check in results')` that runs `runCIChecks` with default config and verifies the result contains a check with `name: 'arch'` and `status: 'pass'`.
4. Run: `pnpm --filter @harness-engineering/core test -- tests/ci/check-orchestrator.test.ts`
5. Observe: test passes.
6. Run: `harness validate`
7. Commit: `test(core): add architecture check to CI orchestrator tests`

### Task 4: Update CLI CI commands with arch check

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/ci/check.ts`, `packages/cli/src/commands/ci/init.ts`

1. In `packages/cli/src/commands/ci/check.ts`, update `VALID_CHECKS` (line 14):
   ```typescript
   const VALID_CHECKS: CICheckName[] = [
     'validate',
     'deps',
     'docs',
     'entropy',
     'phase-gate',
     'arch',
   ];
   ```
2. Update the command description (line 60) to include arch:
   ```typescript
   .description('Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch)')
   ```
3. In `packages/cli/src/commands/ci/init.ts`, update `ALL_CHECKS` (line 9):
   ```typescript
   const ALL_CHECKS: CICheckName[] = ['validate', 'deps', 'docs', 'entropy', 'phase-gate', 'arch'];
   ```
4. Run: `pnpm --filter @harness-engineering/cli build`
5. Run: `harness validate`
6. Commit: `feat(cli): add arch to CI check and init commands`

### Task 5: Add default architecture config to harness.config.json

**Depends on:** none
**Files:** `harness.config.json`

1. Add `"architecture"` section to `harness.config.json` after the `"boundaries"` section (after line 92). Use defaults from the spec:
   ```json
   "architecture": {
     "enabled": true,
     "baselinePath": ".harness/arch/baselines.json",
     "thresholds": {
       "circular-deps": { "max": 0 },
       "layer-violations": { "max": 0 },
       "complexity": { "max": 15 },
       "coupling": { "maxFanIn": 10, "maxFanOut": 8 },
       "forbidden-imports": { "max": 0 },
       "module-size": { "maxFiles": 30, "maxLoc": 3000 },
       "dependency-depth": { "max": 7 }
     },
     "modules": {}
   },
   ```
2. Run: `harness validate`
3. Commit: `chore: add default architecture config to harness.config.json`

### Task 6: Update enforce-architecture skill with check-arch reference

**Depends on:** none
**Files:** `agents/skills/claude-code/enforce-architecture/SKILL.md`

1. In the **Harness Integration** section (around line 157), add a new bullet after the existing entries:
   ```markdown
   - **`harness check-arch`** — Architecture assertion framework. Runs all 7 metric collectors against baseline and thresholds. Use for comprehensive structural health checks beyond layer dependencies. Supports `--update-baseline` to capture current state and `--json` for machine-readable output.
   - **`harness check-arch --module <path>`** — Scoped architecture check for a single module. Use when validating a specific subsystem.
   ```
2. In the **Process > Phase 2: Run Dependency Checks** section (around line 48), add a note after step 1:
   ```markdown
   1b. **Optionally run `harness check-arch`** for comprehensive architecture analysis beyond dependency checking. This covers circular dependencies, complexity, coupling, module size, and dependency depth in addition to layer violations.
   ```
3. Run: `harness validate`
4. Commit: `docs(skills): add check-arch references to enforce-architecture skill`

---

### Final Verification

[checkpoint:human-verify]

After all tasks complete:

1. Run: `pnpm build` (full workspace build)
2. Run: `pnpm test` (full test suite)
3. Run: `pnpm typecheck` (type checking)
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Verify: `node packages/cli/dist/bin/harness.js check-arch` runs without error
7. Verify: `node packages/cli/dist/bin/harness.js ci check --json` output includes an `"arch"` check entry

All 6 tasks complete the Phase 7 integration. The architecture assertion framework is now fully integrated into the CI pipeline, configuration, and skill documentation.
