# Harness Security Review

> Deep security audit combining mechanical scanning with AI-powered vulnerability analysis. OWASP baseline + stack-adaptive rules + optional threat modeling.

## When to Use

- Before a release or security-sensitive merge
- After updating dependencies (supply chain risk)
- When auditing a new or unfamiliar codebase
- When `on_pr` triggers fire on security-sensitive paths
- NOT for quick pre-commit checks (use harness-pre-commit-review for that)
- NOT for general code review (use harness-code-review for that)

## Scope Adaptation

This skill adapts its behavior based on invocation context — standalone or as part of the code review pipeline.

### Detection

Check for `pipelineContext` in `.harness/handoff.json`. If present, run in **changed-files mode**. Otherwise, run in **full mode**.

```bash
# Check for pipeline context
cat .harness/handoff.json 2>/dev/null | grep -q '"pipelineContext"'
```

### Changed-Files Mode (Code Review Pipeline)

When invoked from the code review pipeline (Phase 4 fan-out, security slot):

- **Phase 1 (SCAN): SKIPPED.** The mechanical security scan already ran in code review Phase 2. Read the mechanical findings from `PipelineContext.findings` where `domain === 'security'` instead of re-running `run_security_scan`.
- **Phase 2 (REVIEW):** Run OWASP baseline + stack-adaptive analysis on **changed files only** plus their direct imports (for data flow tracing). The changed file list is provided in the context bundle from the pipeline.
- **Phase 3 (THREAT-MODEL): SKIPPED** unless `--deep` flag was passed through from code review.
- **Phase 4 (REPORT): SKIPPED.** Return findings as `ReviewFinding[]` to the pipeline. The pipeline handles output formatting (Phase 7).

Findings returned in this mode **must** use the `ReviewFinding` schema with populated security fields (`cweId`, `owaspCategory`, `confidence`, `remediation`, `references`).

### Full Mode (Standalone)

When invoked directly (no PipelineContext):

- All phases run as documented below (Phase 1 through Phase 4).
- Output is the standalone security report format.
- This is the existing behavior — no changes.

## Principle: Layered Security

This skill follows the Deterministic-vs-LLM Responsibility Split principle. The mechanical scanner runs first and catches what patterns can catch. The AI review then looks for semantic issues that patterns miss — user input flowing through multiple functions to a dangerous sink, missing authorization checks, logic flaws in authentication flows.

## Process

### Phase 1: SCAN — Mechanical Security Scanner (full mode only)

> **Note:** This phase is skipped in changed-files mode. See [Scope Adaptation](#scope-adaptation) above.

Run the built-in security scanner against the project.

1. **Run the scanner.** Use the `harness check-security` CLI command:

   ```bash
   harness check-security
   ```

   For machine-readable output, add `--json`. For scanning only changed files, add `--changed-only`.

2. **Review findings.** Categorize by severity:
   - **Error (blocking):** Must fix before merge — secrets, injection, eval, weak crypto
   - **Warning (review):** Should fix — CORS wildcards, disabled TLS, path traversal patterns
   - **Info (note):** Consider — HTTP URLs, missing security headers

3. **Report mechanical findings.** Present each finding with:
   - Rule ID and name
   - File, line number, matched code
   - Remediation guidance
   - CWE/OWASP reference

### Phase 2: REVIEW — AI-Powered Security Analysis

After mechanical scanning, perform deeper AI analysis.

#### OWASP Baseline (always runs)

Review the codebase against OWASP Top 10 and CWE Top 25:

1. **Injection (CWE-89, CWE-78, CWE-79):** Look for user input flowing to SQL queries, shell commands, or HTML output without sanitization. Trace data flow across function boundaries — patterns only catch single-line issues.

2. **Broken Authentication (CWE-287):** Check for weak session management, missing MFA enforcement, hardcoded credentials, predictable tokens.

3. **Sensitive Data Exposure (CWE-200):** Look for PII logged to console/files, sensitive data in error messages, missing encryption for data at rest or in transit.

4. **Broken Access Control (CWE-862):** Check for missing authorization on API endpoints, IDOR vulnerabilities, privilege escalation paths.

5. **Security Misconfiguration (CWE-16):** Check for debug mode in production configs, default credentials, overly permissive CORS, missing security headers.

#### Stack-Adaptive Review (based on detected tech)

After the OWASP baseline, add stack-specific checks:

- **Node.js:** Prototype pollution via `Object.assign` or spread on user input, `__proto__` injection, unhandled promise rejections exposing stack traces
- **Express:** Missing helmet, rate limiting, CSRF protection, body parser limits
- **React:** XSS via `dangerouslySetInnerHTML`, sensitive data in client state, insecure `postMessage` listeners
- **Go:** Race conditions in concurrent handlers, `unsafe.Pointer` usage, format string injection

### Phase 3: THREAT-MODEL (optional, `--deep` flag; full mode or explicit `--deep` in pipeline)

When invoked with `--deep`, build a lightweight threat model:

1. **Identify entry points.** Find all HTTP routes, API endpoints, message handlers, CLI commands, and file upload handlers.

2. **Map trust boundaries.** Where does data cross from untrusted (user input, external APIs) to trusted (database queries, file system, internal services)?

3. **Trace data flows.** For each entry point, trace how user-controlled data flows through the system. Use the knowledge graph if available (`query_graph`, `get_relationships`).

4. **Identify threat scenarios.** For each trust boundary crossing, ask:
   - What if this input is malicious?
   - What is the worst-case impact?
   - What controls are in place?

5. **Report threat model.** Present as a table:
   | Entry Point | Data Flow | Trust Boundary | Threats | Controls | Risk |
   |-------------|-----------|----------------|---------|----------|------|

### Phase 4: REPORT — Consolidated Findings

Produce a unified security report:

```
Security Review: [PASS/WARN/FAIL]

Mechanical Scanner:
- Scanned: N files, M rules applied
- Coverage: baseline/enhanced
- Errors: N | Warnings: N | Info: N

[List each finding with rule ID, file:line, severity, and remediation]

AI Review:
- OWASP Baseline: [findings or "No issues found"]
- Stack-Adaptive ([detected stacks]): [findings or "No issues found"]

[If --deep]
Threat Model:
- Entry points: N
- Trust boundaries: N
- High-risk flows: [list]
```

## Harness Integration

- **`harness check-security`** — Run the mechanical scanner via CLI. Use `--json` for machine-readable output.
- **`harness validate`** — Standard project health check
- **`query_graph` / `get_relationships`** — Used in threat modeling phase for data flow tracing
- **`get_impact`** — Understand blast radius of security-sensitive changes

## Gates

- **Mechanical scanner must run before AI review.** The scanner catches what patterns can catch; AI reviews what remains.
- **Error-severity findings are blocking.** The report must be FAIL if any error-severity finding exists.
- **AI review must reference specific code.** No vague warnings like "consider improving security." Every finding must point to a file, line, and specific issue.
- **Threat model is optional.** Only runs with `--deep`. Do not run it unless explicitly requested.

## Success Criteria

- Mechanical scanner ran and produced findings (or confirmed clean)
- AI review covered OWASP Top 10 baseline
- Stack-adaptive checks matched the detected technology
- Every finding includes file, line, CWE reference, and remediation
- Report follows the structured format
- Error-severity findings result in FAIL status

## Escalation

- **Scanner finds secrets in committed code:** Flag immediately. Recommend rotating the compromised credentials. This is urgent regardless of other findings.
- **AI review finds a critical vulnerability (RCE, SQLi, auth bypass):** Mark as blocking. Do not approve the PR. Provide exact remediation code.
- **Conflict between scanner and AI review:** If the scanner flags something the AI thinks is a false positive, include both perspectives in the report. Let the human decide.
- **Scope too large for meaningful review:** If the project has >1000 source files, recommend scoping the review to changed files or a specific subsystem.

## Examples

### Example: Clean Scan

```
Security Review: PASS

Mechanical Scanner:
- Scanned: 42 files, 22 rules applied
- Coverage: baseline
- Errors: 0 | Warnings: 0 | Info: 0

AI Review:
- OWASP Baseline: No issues found
- Stack-Adaptive (node, express): No issues found
```

### Example: Findings Detected

```
Security Review: FAIL

Mechanical Scanner:
- Scanned: 42 files, 22 rules applied
- Coverage: baseline
- Errors: 2 | Warnings: 1 | Info: 0

Findings:
1. [SEC-SEC-002] ERROR src/config.ts:12 — Hardcoded API key or secret detected
   Remediation: Use environment variables: process.env.API_KEY
2. [SEC-INJ-002] ERROR src/db.ts:45 — SQL query built with string concatenation
   Remediation: Use parameterized queries: query("SELECT * FROM users WHERE id = $1", [id])
3. [SEC-NET-001] WARNING src/cors.ts:8 — CORS wildcard origin allows any website to make requests
   Remediation: Restrict CORS to specific trusted origins

AI Review:
- OWASP Baseline: 1 finding — user input from req.params.id flows through formatQuery() to db.execute() without sanitization (confirms SEC-INJ-002 with data flow trace)
- Stack-Adaptive (node, express): Missing helmet middleware, missing rate limiting on /api/* routes
```

### Example: Deep Audit with Threat Model

```
Security Review: WARN

Mechanical Scanner:
- Scanned: 120 files, 30 rules applied
- Coverage: baseline
- Errors: 0 | Warnings: 2 | Info: 3

AI Review:
- OWASP Baseline: No critical issues
- Stack-Adaptive (node, react): localStorage used for session token (SEC-REACT-001)

Threat Model:
- Entry points: 12 (8 REST endpoints, 2 WebSocket handlers, 2 CLI commands)
- Trust boundaries: 4 (client→API, API→database, API→external service, CLI→filesystem)
- High-risk flows:
  1. POST /api/upload → file stored to disk without size limit or type validation
  2. WebSocket message handler passes user data to eval-like template engine
```
