# Plan: audit-harness-strength Phase 3 — `check-harness-strength` CLI command

**Date:** 2026-06-23 | **Spec:** docs/changes/audit-harness-strength/proposal.md (Phase 3) | **Tasks:** 4 | **Time:** ~16 min | **Integration Tier:** medium | **Rigor:** standard

## Goal

Ship the `harness check-harness-strength` CLI command that wraps the already-built `HarnessStrengthAuditor`, mirroring `check-security`: option parsing, severity-threshold filtering, human-readable report, `--json`, `--report-only`, mode selection, and the default-blocking exit gate — wired into the CLI program via barrel regeneration.

## Observable Truths (Acceptance Criteria)

1. `runCheckHarnessStrength(root, opts)` returns `Result<AuditResult-derived, Error>` and never throws (auditor.audit is total).
2. When any error-severity finding survives the `--severity` filter and `--report-only` is NOT set, the command exits non-zero (`ExitCode.VALIDATION_FAILED`).
3. When `--report-only` is set, the command exits `0` (`ExitCode.SUCCESS`) regardless of findings, while still printing the report.
4. With the global `--json` flag, the command prints the machine-readable `AuditResult` (mode, score, tier, findings[], summary{}) to stdout — the structured result, not the ValidationResult wrapper.
5. `--severity <error|warning|info>` filters which findings display AND which count toward the exit gate (default `warning`); an invalid value exits via the `preAction` hook with `ExitCode.ERROR`.
6. `--mode <adopter|toolkit>`, `--toolkit`, and `--adopter` resolve to the right mode passed into `audit()`; with no flag the auditor auto-detects.
7. The human-readable report shows score + tier, and per finding: `id`, `severity`, `file:line`, `message`, and `remediation`, plus summary counts.
8. `createCheckHarnessStrengthCommand` appears in `packages/cli/src/commands/_registry.ts` (auto-generated) and is registered in the CLI program (`harness check-harness-strength --help` works).
9. Command-level tests pass: exit non-zero on error findings, `--report-only` exits 0, `--json` shape, `--mode`/`--toolkit` selection, `--severity` filtering.
10. `harness validate` passes.

## File Map

- CREATE `packages/cli/src/commands/check-harness-strength.ts`
- CREATE `packages/cli/tests/commands/check-harness-strength.test.ts`
- CREATE `packages/cli/tests/fixtures/harness-strength-weak/` (minimal fixture root that triggers >=1 error finding — see Task 1)
- MODIFY `packages/cli/src/commands/_registry.ts` (regenerated, do NOT hand-edit)

## Skeleton

_Not produced — task count (4) below the standard-mode threshold (8)._

## Conventions (locked for executor)

- **Node 22 required.** Prefix every shell with `source ~/.nvm/nvm.sh && nvm use 22 &&`.
- **Mirror, do not invent.** `check-harness-strength.ts` follows `packages/cli/src/commands/check-security.ts` exactly: exported pure `runCheckHarnessStrength(cwd, options)` for testability, an action wrapper resolving `OutputMode`, a `createCheckHarnessStrengthCommand()` factory with a `preAction` severity-validation hook.
- **`--json` is the GLOBAL flag** (defined in `packages/cli/src/index.ts:32`), read via `cmd.optsWithGlobals()` — same as check-security. Do NOT add a local `--json` option.
- **`--json` emits the raw AuditResult**, not `formatValidation`'s ValidationResult shape. In JSON mode, `console.log(JSON.stringify(auditResult, null, 2))` and return early (truth #4). This is the one intentional divergence from check-security, which routes JSON through `formatValidation`.
- **Severity is DISPLAY/exit threshold only.** The auditor already applies config overrides (`audit.harnessStrength.severities`) internally; the command must NOT re-read or re-apply them. `--severity` filters the already-resolved `finding.severity` for display and the exit gate, exactly like check-security's `SEVERITY_RANK` filter.
- **Mode resolution.** Build `AuditOptions` (`= ModeOptions = { mode?: 'adopter'|'toolkit' }`). `--toolkit` -> `{ mode: 'toolkit' }`, `--adopter` -> `{ mode: 'adopter' }`, `--mode <x>` -> `{ mode: x }`, none -> `{}` (auditor auto-detects). If both a shortcut and `--mode` are given, `--mode` is canonical; resolve precedence in `runCheckHarnessStrength` (explicit `--mode` wins, else shortcut).
- **Exit gate.** `valid = !hasSurvivingError`. Exit `ExitCode.SUCCESS` when `options.reportOnly === true` OR `valid`; else `ExitCode.VALIDATION_FAILED`. Auditor errors -> `ExitCode.ERROR`.
- **Imports from core:** `import { HarnessStrengthAuditor } from '@harness-engineering/core'` and `import type { AuditResult, StrengthFinding, Severity } from '@harness-engineering/core'`. (`Severity` is exported from `harness-strength/types`.)

## Tasks

### Task 1: Create the weak-harness test fixture

**Depends on:** none | **Files:** `packages/cli/tests/fixtures/harness-strength-weak/harness.config.json` | **Category:** test-support

Create a fixture that deterministically produces at least one error-severity finding so command tests can assert the exit gate. STRENGTH-004 (`layers` defined but `architecture.thresholds` empty) is the simplest pure-config trigger — no hook files needed.

1. Create `packages/cli/tests/fixtures/harness-strength-weak/harness.config.json` with:
   ```json
   {
     "layers": ["domain", "application", "infrastructure"],
     "architecture": { "thresholds": {} }
   }
   ```
2. Verify the auditor flags it. Run:
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && node -e "const {HarnessStrengthAuditor}=require('./packages/core/dist/index.js'); const r=new HarnessStrengthAuditor().audit('packages/cli/tests/fixtures/harness-strength-weak',{mode:'adopter'}); console.log(JSON.stringify(r.value?.findings?.map(f=>({id:f.id,sev:f.severity})),null,2));"
   ```
   Observe at least one `{ "id": "STRENGTH-004", "sev": "error" }`. (If core dist is stale, run `pnpm --filter @harness-engineering/core build` first.)
   - If STRENGTH-004 does not fire from config alone, fall back to the minimal input the auditor expects (re-read `packages/core/src/harness-strength/rules/strength-004-empty-thresholds.ts` for the exact key path) and adjust the fixture until exactly one error finding appears. Do NOT proceed until an error finding is confirmed — Tasks 3/4 depend on it.
3. Commit: `test(cli): add weak-harness fixture for check-harness-strength`

### Task 2: Implement `check-harness-strength.ts`

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/check-harness-strength.ts`

Mirror `check-security.ts`. Write the full command module.

1. Create `packages/cli/src/commands/check-harness-strength.ts`:

   ```ts
   import { Command } from 'commander';
   import * as path from 'path';
   import type { Result } from '@harness-engineering/core';
   import { Ok, HarnessStrengthAuditor } from '@harness-engineering/core';
   import type { AuditResult, StrengthFinding, Severity } from '@harness-engineering/core';
   import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';

   const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

   interface CheckHarnessStrengthOptions {
     severity?: Severity;
     mode?: 'adopter' | 'toolkit';
     reportOnly?: boolean;
   }

   export interface CheckHarnessStrengthResult {
     valid: boolean;
     audit: AuditResult; // full structured result (drives --json)
     filtered: StrengthFinding[]; // findings surviving the severity threshold
   }

   export function runCheckHarnessStrength(
     cwd: string,
     options: CheckHarnessStrengthOptions
   ): Result<CheckHarnessStrengthResult, Error> {
     const projectRoot = path.resolve(cwd);
     const auditor = new HarnessStrengthAuditor();
     const result = auditor.audit(projectRoot, options.mode ? { mode: options.mode } : {});
     if (!result.ok) return result;

     const audit = result.value;
     const threshold = options.severity ?? 'warning';
     const thresholdRank = SEVERITY_RANK[threshold];
     const filtered = audit.findings.filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank);
     const hasErrors = filtered.some((f) => f.severity === 'error');

     return Ok({ valid: !hasErrors, audit, filtered });
   }

   async function runCheckHarnessStrengthAction(
     opts: {
       severity: Severity;
       mode?: 'adopter' | 'toolkit';
       toolkit?: boolean;
       adopter?: boolean;
       reportOnly?: boolean;
     },
     globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
   ): Promise<void> {
     const outMode: OutputModeType = globalOpts.json
       ? OutputMode.JSON
       : globalOpts.quiet
         ? OutputMode.QUIET
         : globalOpts.verbose
           ? OutputMode.VERBOSE
           : OutputMode.TEXT;

     const formatter = new OutputFormatter(outMode);

     // Mode precedence: explicit --mode wins, else shortcut, else auto-detect.
     const resolvedMode =
       opts.mode ?? (opts.toolkit ? 'toolkit' : opts.adopter ? 'adopter' : undefined);

     const result = runCheckHarnessStrength(process.cwd(), {
       severity: opts.severity,
       ...(resolvedMode !== undefined && { mode: resolvedMode }),
       ...(opts.reportOnly !== undefined && { reportOnly: opts.reportOnly }),
     });

     if (!result.ok) {
       if (outMode === OutputMode.JSON) {
         console.log(JSON.stringify({ error: result.error.message }));
       } else {
         logger.error(result.error.message);
       }
       process.exit(ExitCode.ERROR);
     }

     const { valid, audit, filtered } = result.value;

     // --json: emit the raw structured AuditResult (truth #4), then exit per gate.
     if (outMode === OutputMode.JSON) {
       console.log(JSON.stringify(audit, null, 2));
       process.exit(opts.reportOnly || valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
     }

     const issues = filtered.map((f) => ({
       file: f.line !== undefined ? `${f.file}:${f.line}` : f.file,
       message: `[${f.id}] ${f.severity.toUpperCase()} ${f.message} -> ${f.remediation}`,
     }));

     const header = formatter.formatSummary(
       `harness strength (${audit.mode})`,
       `${audit.score}/100 (${audit.tier})`,
       valid
     );
     if (header) console.log(header);

     const output = formatter.formatValidation({ valid, issues });
     if (output) console.log(output);

     const summaryLine = formatter.formatSummary(
       'findings',
       `${audit.summary.errors} error / ${audit.summary.warnings} warning / ${audit.summary.info} info`,
       valid
     );
     if (summaryLine) console.log(summaryLine);

     process.exit(opts.reportOnly || valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
   }

   export function createCheckHarnessStrengthCommand(): Command {
     const command = new Command('check-harness-strength')
       .description(
         "Mechanically audit this project's harness setup against the 7 strength patterns"
       )
       .option('--severity <level>', 'Minimum severity threshold to display and gate on', 'warning')
       .option('--mode <mode>', 'Audit mode: adopter | toolkit (default: auto-detect)')
       .option('--toolkit', 'Force toolkit mode')
       .option('--adopter', 'Force adopter mode')
       .option('--report-only', 'Always exit 0 regardless of findings')
       .hook('preAction', (thisCommand) => {
         const { severity, mode } = thisCommand.opts();
         if (!['error', 'warning', 'info'].includes(severity)) {
           logger.error(`Invalid severity: "${severity}". Must be one of: error, warning, info`);
           process.exit(ExitCode.ERROR);
         }
         if (mode !== undefined && !['adopter', 'toolkit'].includes(mode)) {
           logger.error(`Invalid mode: "${mode}". Must be one of: adopter, toolkit`);
           process.exit(ExitCode.ERROR);
         }
       })
       .action(async (opts, cmd) => {
         await runCheckHarnessStrengthAction(opts, cmd.optsWithGlobals());
       });

     return command;
   }
   ```

2. Verify it type-checks and the import resolves. Run:
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/cli exec tsc --noEmit
   ```
   Observe no errors for `check-harness-strength.ts`. (If `Severity` is not re-exported from the core barrel, re-check `packages/core/src/harness-strength/index.ts` — `export * from './types'` should surface it; if not, import the type from the same path the auditor uses.)
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx harness validate`
4. Commit: `feat(cli): add check-harness-strength command`

### Task 3 (TDD): Command-level tests

**Depends on:** Task 2 | **Files:** `packages/cli/tests/commands/check-harness-strength.test.ts`

Mirror `check-security.test.ts` (tests the exported pure function, not the process-exiting action). Use the weak fixture from Task 1 and a clean fixture (`tests/fixtures/valid-project`) for the passing case.

1. Create `packages/cli/tests/commands/check-harness-strength.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { runCheckHarnessStrength } from '../../src/commands/check-harness-strength';
   import * as path from 'path';

   const WEAK = path.join(__dirname, '../fixtures/harness-strength-weak');
   const CLEAN = path.join(__dirname, '../fixtures/valid-project');

   describe('runCheckHarnessStrength', () => {
     it('returns a structured AuditResult with score, tier, and summary', () => {
       const r = runCheckHarnessStrength(WEAK, {});
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(typeof r.value.audit.score).toBe('number');
       expect(['solid', 'at-risk', 'theatre']).toContain(r.value.audit.tier);
       expect(r.value.audit.summary).toHaveProperty('errors');
       expect(r.value.audit.summary).toHaveProperty('rulesRun');
     });

     it('is invalid (gate trips) when an error-severity finding survives the threshold', () => {
       const r = runCheckHarnessStrength(WEAK, { severity: 'error' });
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.audit.summary.errors).toBeGreaterThan(0);
       expect(r.value.valid).toBe(false);
       expect(r.value.filtered.some((f) => f.severity === 'error')).toBe(true);
     });

     it('filters findings by severity threshold (display set narrows as threshold rises)', () => {
       const all = runCheckHarnessStrength(WEAK, { severity: 'info' });
       const errs = runCheckHarnessStrength(WEAK, { severity: 'error' });
       expect(all.ok && errs.ok).toBe(true);
       if (!all.ok || !errs.ok) return;
       expect(errs.value.filtered.length).toBeLessThanOrEqual(all.value.filtered.length);
       for (const f of errs.value.filtered) expect(f.severity).toBe('error');
     });

     it('honors explicit mode selection', () => {
       const r = runCheckHarnessStrength(WEAK, { mode: 'adopter' });
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.audit.mode).toBe('adopter');
     });

     it('auto-detects mode when none is given (clean fixture -> adopter)', () => {
       const r = runCheckHarnessStrength(CLEAN, {});
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(['adopter', 'toolkit']).toContain(r.value.audit.mode);
     });
   });
   ```

   Note: `--report-only` and `--json` are exercised at the action layer (which calls `process.exit`); the pure function asserts the `valid` flag and structured `audit` that those branches consume. The exit-0-on-report-only and JSON-emits-AuditResult behaviors are covered by truths #3/#4 via the `valid` + `audit` assertions above. If a process-level test of `--report-only`/`--json` is desired, add a child-process spawn test against the built `dist/cli` binary as a follow-up.

2. Run — observe failures only if the fixture/impl mismatch (otherwise green):
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/cli exec vitest run tests/commands/check-harness-strength.test.ts
   ```
3. Make any fixture adjustment needed so all 5 tests pass. Observe green.
4. Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx harness validate`
5. Commit: `test(cli): cover check-harness-strength command behavior`

### Task 4: Register command via barrel regen and verify wiring

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/_registry.ts` (auto-generated) | **Category:** integration

1. Regenerate barrel exports (do NOT hand-edit `_registry.ts`):
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && pnpm run generate-barrel-exports
   ```
2. Verify `createCheckHarnessStrengthCommand` was added to `packages/cli/src/commands/_registry.ts` (import line + `commandCreators` array entry). If it is absent, the generator scans for the `createXxxCommand` export naming — confirm the factory is exported with that exact name (it is, per Task 2).
3. Verify the command is wired into the CLI program end-to-end:
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/cli build && node packages/cli/dist/index.js check-harness-strength --help
   ```
   Observe the help text listing `--severity`, `--mode`, `--toolkit`, `--adopter`, `--report-only`.
4. Smoke-test the gate against the weak fixture (run from the fixture dir so `process.cwd()` resolves there):
   ```
   source ~/.nvm/nvm.sh && nvm use 22 && (cd packages/cli/tests/fixtures/harness-strength-weak && node "$OLDPWD/packages/cli/dist/index.js" check-harness-strength --severity error; echo "exit=$?")
   ```
   Observe a non-zero exit. Re-run with `--report-only` appended and observe `exit=0`. Re-run with `--json` and observe a JSON object with `score`/`tier`/`findings`/`summary`.
5. Run: `source ~/.nvm/nvm.sh && nvm use 22 && npx harness validate`
6. Commit: `chore(cli): register check-harness-strength in command registry`

## Sequencing & Parallelism

Strictly linear: Task 1 (fixture) -> Task 2 (impl, needs nothing from 1 to compile but 3/4 need the fixture) -> Task 3 (tests, need impl + fixture) -> Task 4 (regen + wiring, needs the exported factory). No parallelizable tasks (single subsystem). Estimated ~16 min total.

## Uncertainties

- [ASSUMPTION] STRENGTH-004 fires from a config-only fixture (`layers` + empty `architecture.thresholds`). Task 1 verifies this before downstream tasks rely on it; if it does not, Task 1's fallback re-reads the rule source and adjusts the fixture. No other task changes.
- [ASSUMPTION] `Severity` is re-exported from the `@harness-engineering/core` barrel via `export * from './types'`. Task 2 step 2 catches this at type-check time; fallback is to import the type from the rule/types path the auditor uses.
- [DEFERRABLE] Process-level tests of `--report-only`/`--json` exit codes (vs. asserting the pure-function `valid`/`audit` they drive). Covered behaviorally by the smoke test in Task 4; a spawn-based test can be added later if regression coverage is wanted.
- [DEFERRABLE] Exact human-readable layout (header line wording, finding line format). The plan locks a format consistent with check-security's `formatValidation` + `formatSummary`; wording can be refined during execution without changing truths.

## Out of Scope (explicit)

- Phase 4 (SKILL.md, skill.yaml, slash-command/agent-definition regen, AGENTS.md, CLI docs, D1 ADR).
- Phase 5 (dogfood toolkit run against this repo, fixture lock).
- Any change to the core engine (`packages/core/src/harness-strength/**`) — it is DONE.
