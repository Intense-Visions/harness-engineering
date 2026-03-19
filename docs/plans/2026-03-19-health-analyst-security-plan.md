# Plan: Health Analyst Security Scan Integration

**Date:** 2026-03-19
**Spec:** docs/changes/health-analyst-security/proposal.md
**Estimated tasks:** 5
**Estimated time:** 15-20 minutes

## Goal

The codebase-health-analyst persona includes a lightweight, mechanical security scan dimension via a new `harness-security-scan` skill and `check-security` CLI command.

## Observable Truths (Acceptance Criteria)

1. When `harness check-security` runs on a project with no security issues, it exits 0 and reports 0 findings
2. When `harness check-security` runs on a project with an error-severity finding, it exits non-zero
3. When `harness check-security --severity error` runs, only error-severity findings are reported (warnings/info filtered out)
4. When `harness check-security --changed-only` runs, only git-changed files are scanned
5. When `harness check-security --json` runs, output is valid JSON with `valid`, `findings`, and `stats` fields
6. The `codebase-health-analyst.yaml` persona lists `harness-security-scan` in skills and `check-security` in commands
7. The `ALLOWED_PERSONA_COMMANDS` set includes `check-security`
8. The `harness-security-scan` skill exists for both claude-code and gemini-cli platforms
9. When `generateCIWorkflow` produces output for the health analyst, it includes a `check-security` step
10. `harness validate` passes after all changes

## File Map

```
CREATE agents/skills/claude-code/harness-security-scan/skill.yaml
CREATE agents/skills/claude-code/harness-security-scan/SKILL.md
CREATE agents/skills/gemini-cli/harness-security-scan/skill.yaml
CREATE agents/skills/gemini-cli/harness-security-scan/SKILL.md
CREATE packages/cli/src/commands/check-security.ts
CREATE packages/cli/tests/commands/check-security.test.ts
MODIFY packages/cli/src/index.ts (add import + register command)
MODIFY packages/cli/src/persona/constants.ts (add to ALLOWED_PERSONA_COMMANDS)
MODIFY agents/personas/codebase-health-analyst.yaml (add skill, command, config)
```

## Tasks

### Task 1: Create `harness-security-scan` skill for claude-code

**Depends on:** none
**Files:** agents/skills/claude-code/harness-security-scan/skill.yaml, agents/skills/claude-code/harness-security-scan/SKILL.md

1. Create `agents/skills/claude-code/harness-security-scan/skill.yaml`:

   ```yaml
   name: harness-security-scan
   version: '1.0.0'
   description: Lightweight mechanical security scan for health checks
   cognitive_mode: meticulous-implementer
   triggers:
     - manual
     - scheduled
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Glob
     - Grep
   cli:
     command: harness skill run harness-security-scan
     args:
       - name: path
         description: Project root path
         required: false
       - name: severity
         description: Minimum severity threshold (error, warning, info)
         required: false
       - name: changed-only
         description: Only scan git-changed files
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-security-scan
       path: string
   type: rigid
   phases:
     - name: scan
       description: Run SecurityScanner and filter by severity threshold
       required: true
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/harness-security-scan/SKILL.md`:

   ```markdown
   # Harness Security Scan

   > Lightweight mechanical security scan. Fast triage, not deep review.

   ## When to Use

   - As part of the codebase-health-analyst sweep
   - For quick security triage on a project or changed files
   - On scheduled cron runs for continuous security coverage
   - NOT for deep security review (use harness-security-review)
   - NOT for threat modeling (use harness-security-review --deep)

   ## Process

   ### Phase 1: SCAN — Run Mechanical Scanner

   1. **Resolve project root.** Use provided path or cwd.

   2. **Load security config.** Read `harness.config.json` and extract `security`
      section. Fall back to defaults if absent.

   3. **Determine file scope.**
      - If `--changed-only` or triggered by PR: run `git diff --name-only HEAD~1`
        to get changed files. Filter to source files only (exclude node_modules,
        dist, test files per config).
      - Otherwise: scan all source files in the project.

   4. **Run SecurityScanner.** Call `SecurityScanner.scanFiles()` from
      `@harness-engineering/core`.

   5. **Filter by severity threshold.** Remove findings below the configured
      threshold:
      - `error`: only errors
      - `warning`: errors and warnings (default)
      - `info`: all findings

   6. **Output report.** Present findings grouped by severity:
   ```

   Security Scan: [PASS/FAIL]
   Scanned: N files, M rules applied
   Errors: N | Warnings: N | Info: N

   [List findings with rule ID, file:line, severity, message, remediation]

   ```

   ## Gates

   - **Error-severity findings are blocking.** Report is FAIL if any error-severity
   finding exists after filtering.
   - **No AI review.** This skill is mechanical only. Do not perform OWASP analysis
   or threat modeling.

   ## Success Criteria

   - Scanner ran and produced findings (or confirmed clean)
   - Findings are filtered by the configured severity threshold
   - Report follows the structured format
   - Exit code reflects pass/fail status
   ```

3. Run: `harness validate`
4. Commit: `feat(skills): add harness-security-scan skill for claude-code`

---

### Task 2: Create `harness-security-scan` skill for gemini-cli

**Depends on:** Task 1
**Files:** agents/skills/gemini-cli/harness-security-scan/skill.yaml, agents/skills/gemini-cli/harness-security-scan/SKILL.md

1. Copy `agents/skills/claude-code/harness-security-scan/skill.yaml` to `agents/skills/gemini-cli/harness-security-scan/skill.yaml` (identical content)
2. Copy `agents/skills/claude-code/harness-security-scan/SKILL.md` to `agents/skills/gemini-cli/harness-security-scan/SKILL.md` (identical content)
3. Run: `harness validate`
4. Commit: `feat(skills): add harness-security-scan skill for gemini-cli`

---

### Task 3: Create `check-security` CLI command (TDD)

**Depends on:** none (parallel with Tasks 1-2)
**Files:** packages/cli/src/commands/check-security.ts, packages/cli/tests/commands/check-security.test.ts

1. Create test file `packages/cli/tests/commands/check-security.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { runCheckSecurity } from '../../src/commands/check-security';
   import * as path from 'path';

   const FIXTURES = path.join(__dirname, '../fixtures');

   describe('runCheckSecurity', () => {
     it('returns valid:true when no findings exist', async () => {
       const result = await runCheckSecurity(FIXTURES, {});
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.valid).toBe(true);
         expect(result.value.findings).toEqual([]);
         expect(result.value.stats.errorCount).toBe(0);
       }
     });

     it('filters findings by severity threshold', async () => {
       const result = await runCheckSecurity(FIXTURES, { severity: 'error' });
       expect(result.ok).toBe(true);
       if (result.ok) {
         for (const f of result.value.findings) {
           expect(f.severity).toBe('error');
         }
       }
     });

     it('returns stats with correct shape', async () => {
       const result = await runCheckSecurity(FIXTURES, {});
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.stats).toHaveProperty('filesScanned');
         expect(result.value.stats).toHaveProperty('rulesApplied');
         expect(result.value.stats).toHaveProperty('errorCount');
         expect(result.value.stats).toHaveProperty('warningCount');
         expect(result.value.stats).toHaveProperty('infoCount');
       }
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/commands/check-security.test.ts`
3. Observe failure: `runCheckSecurity` not found

4. Create `packages/cli/src/commands/check-security.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as path from 'path';
   import { execSync } from 'child_process';
   import type { Result } from '@harness-engineering/core';
   import { Ok, SecurityScanner, parseSecurityConfig } from '@harness-engineering/core';
   import type { SecurityFinding, SecuritySeverity } from '@harness-engineering/core';
   import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';

   const SEVERITY_RANK: Record<SecuritySeverity, number> = {
     error: 3,
     warning: 2,
     info: 1,
   };

   interface CheckSecurityOptions {
     severity?: SecuritySeverity;
     changedOnly?: boolean;
   }

   interface CheckSecurityResult {
     valid: boolean;
     findings: SecurityFinding[];
     stats: {
       filesScanned: number;
       rulesApplied: number;
       errorCount: number;
       warningCount: number;
       infoCount: number;
     };
   }

   function getChangedFiles(cwd: string): string[] {
     try {
       const output = execSync('git diff --name-only HEAD~1', {
         cwd,
         encoding: 'utf-8',
       });
       return output
         .trim()
         .split('\n')
         .filter((f) => f.length > 0)
         .map((f) => path.resolve(cwd, f));
     } catch {
       return [];
     }
   }

   export async function runCheckSecurity(
     cwd: string,
     options: CheckSecurityOptions
   ): Promise<Result<CheckSecurityResult, Error>> {
     const projectRoot = path.resolve(cwd);

     let configData: Record<string, unknown> = {};
     try {
       const fs = await import('node:fs');
       const configPath = path.join(projectRoot, 'harness.config.json');
       if (fs.existsSync(configPath)) {
         const raw = fs.readFileSync(configPath, 'utf-8');
         const parsed = JSON.parse(raw);
         configData = (parsed.security as Record<string, unknown>) ?? {};
       }
     } catch {
       // No config — use defaults
     }

     const securityConfig = parseSecurityConfig(configData);
     const scanner = new SecurityScanner(securityConfig);
     scanner.configureForProject(projectRoot);

     let filesToScan: string[];
     if (options.changedOnly) {
       filesToScan = getChangedFiles(projectRoot);
     } else {
       const { glob } = await import('glob');
       const pattern = '**/*.{ts,tsx,js,jsx,go,py,java,rb}';
       const ignore = securityConfig.exclude ?? [
         '**/node_modules/**',
         '**/dist/**',
         '**/*.test.ts',
         '**/fixtures/**',
       ];
       filesToScan = await glob(pattern, { cwd: projectRoot, absolute: true, ignore });
     }

     const result = await scanner.scanFiles(filesToScan);

     const threshold = options.severity ?? 'warning';
     const thresholdRank = SEVERITY_RANK[threshold];
     const filtered = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank);

     const hasErrors = filtered.some((f) => f.severity === 'error');

     return Ok({
       valid: !hasErrors,
       findings: filtered,
       stats: {
         filesScanned: result.scannedFiles,
         rulesApplied: result.rulesApplied,
         errorCount: filtered.filter((f) => f.severity === 'error').length,
         warningCount: filtered.filter((f) => f.severity === 'warning').length,
         infoCount: filtered.filter((f) => f.severity === 'info').length,
       },
     });
   }

   export function createCheckSecurityCommand(): Command {
     const command = new Command('check-security')
       .description('Run lightweight security scan: secrets, injection, XSS, weak crypto')
       .option('--severity <level>', 'Minimum severity threshold (error, warning, info)', 'warning')
       .option('--changed-only', 'Only scan git-changed files')
       .action(async (opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const mode: OutputModeType = globalOpts.json
           ? OutputMode.JSON
           : globalOpts.quiet
             ? OutputMode.QUIET
             : globalOpts.verbose
               ? OutputMode.VERBOSE
               : OutputMode.TEXT;

         const formatter = new OutputFormatter(mode);

         const result = await runCheckSecurity(process.cwd(), {
           severity: opts.severity,
           changedOnly: opts.changedOnly,
         });

         if (!result.ok) {
           if (mode === OutputMode.JSON) {
             console.log(JSON.stringify({ error: result.error.message }));
           } else {
             logger.error(result.error.message);
           }
           process.exit(ExitCode.GENERAL_ERROR);
         }

         const issues = result.value.findings.map((f) => ({
           file: `${f.file}:${f.line}`,
           message: `[${f.ruleId}] ${f.severity.toUpperCase()} ${f.message}`,
         }));

         const output = formatter.formatValidation({
           valid: result.value.valid,
           issues,
         });

         if (output) {
           console.log(output);
         }

         process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
       });

     return command;
   }
   ```

5. Run test: `cd packages/cli && npx vitest run tests/commands/check-security.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(cli): add check-security command`

---

### Task 4: Register command in CLI and allow in persona runner

**Depends on:** Task 3
**Files:** packages/cli/src/index.ts, packages/cli/src/persona/constants.ts

1. In `packages/cli/src/index.ts`, add import after the `check-perf` import (line 5):

   ```typescript
   import { createCheckSecurityCommand } from './commands/check-security';
   ```

2. In `packages/cli/src/index.ts`, add registration after `createCheckPerfCommand()` (line 46):

   ```typescript
   program.addCommand(createCheckSecurityCommand());
   ```

3. In `packages/cli/src/persona/constants.ts`, replace the entire `ALLOWED_PERSONA_COMMANDS` set:

   ```typescript
   export const ALLOWED_PERSONA_COMMANDS = new Set([
     'validate',
     'check-deps',
     'check-docs',
     'check-perf',
     'check-security',
     'cleanup',
     'fix-drift',
     'add',
   ]);
   ```

4. Run: `cd packages/cli && npx vitest run`
5. Run: `harness validate`
6. Commit: `feat(cli): register check-security and allow in persona runner`

---

### Task 5: Update codebase-health-analyst persona

**Depends on:** Tasks 1, 4
**Files:** agents/personas/codebase-health-analyst.yaml

1. Replace contents of `agents/personas/codebase-health-analyst.yaml` with:

   ```yaml
   version: 1
   name: Codebase Health Analyst
   description: Proactively identifies structural problems, coupling risks, and architectural drift
   role: Run health checks, detect hotspots, analyze impact, surface risks before they become incidents
   skills:
     - harness-hotspot-detector
     - harness-dependency-health
     - harness-impact-analysis
     - cleanup-dead-code
     - harness-perf
     - harness-security-scan
   commands:
     - graph status
     - check-deps
     - check-perf
     - check-security
   triggers:
     - event: scheduled
       cron: '0 6 * * 1'
     - event: on_pr
       conditions:
         min_files: 10
     - event: manual
   config:
     severity: warning
     autoFix: false
     timeout: 600000
     securitySeverity: warning
   outputs:
     agents-md: false
     ci-workflow: true
     runtime-config: true
   ```

2. Run: `harness validate`
3. Commit: `feat(personas): add security scan to codebase-health-analyst`

---

## Dependency Graph

```
Task 1 (skill cc) ──────────────┐
                                 ├──► Task 5 (persona update)
Task 2 (skill gemini) ──────┐   │
                             │   │
Task 3 (CLI command) ──► Task 4 (register) ─┘
```

Tasks 1, 2, 3 can run in parallel. Task 4 requires Task 3. Task 5 requires Tasks 1 and 4.
