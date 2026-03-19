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

## Harness Integration

- **`harness check-security`** — CLI command that invokes this skill's scanner.
- **`SecurityScanner`** — Core class from `@harness-engineering/core` that executes the rule engine.
- **`harness.config.json`** — Security section configures severity threshold and file exclusions.
- **codebase-health-analyst persona** — Invokes this skill as part of its sweep.

## Escalation

- **When error-severity findings are disputed:** The scanner is mechanical — it may flag false positives. If a finding is a false positive, add a `// harness-ignore SEC-XXX` comment on the line and document the rationale. Do not suppress without explanation.
- **When the scanner misses a known vulnerability:** This skill runs pattern-based rules only. For semantic analysis (taint tracking, control flow), use `/harness:security-review` instead.
- **When scan is too slow on large codebases:** Use `--changed-only` to scope to recently changed files. Full scans can run on a scheduled cron instead.

## Success Criteria

- Scanner ran and produced findings (or confirmed clean)
- Findings are filtered by the configured severity threshold
- Report follows the structured format
- Exit code reflects pass/fail status

## Examples

### Example: Clean Scan

```
Security Scan: PASS
Scanned: 42 files, 12 rules applied
Errors: 0 | Warnings: 0 | Info: 0
```

### Example: Findings Detected

```
Security Scan: FAIL
Scanned: 42 files, 12 rules applied
Errors: 1 | Warnings: 2 | Info: 0

[SEC-SECRET-001] src/config.ts:15 (error)
  Hardcoded API key detected: `const API_KEY = "sk-..."`
  Remediation: Move to environment variable, use dotenv or secrets manager.

[SEC-NET-001] src/cors.ts:5 (warning)
  CORS wildcard origin: `origin: "*"`
  Remediation: Restrict to specific allowed origins.

[SEC-CRYPTO-001] src/auth.ts:22 (warning)
  Weak hash algorithm: `crypto.createHash("md5")`
  Remediation: Use SHA-256 or stronger.
```
