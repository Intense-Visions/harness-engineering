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
