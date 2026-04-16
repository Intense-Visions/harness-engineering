# Harness Engineering for Security: Quickstart Guide

**Shift security left with mechanical enforcement, AI-powered review, and supply chain analysis.**

This guide is written for security engineers, AppSec leads, and penetration testers who want to integrate Harness Engineering into their daily work. It covers what harness does for security, how to use it day-to-day, which tools map to which security activities, and how to build a repeatable, high-confidence application security process.

---

## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why Security Engineers Should Care](#why-security-engineers-should-care)
3. [Getting Started (5 Minutes)](#getting-started-5-minutes)
4. [The Security Toolkit at a Glance](#the-security-toolkit-at-a-glance)
5. [Day-to-Day Security Workflows](#day-to-day-security-workflows)
   - [Running a Quick Security Scan](#1-running-a-quick-security-scan)
   - [Deep Security Review of a PR](#2-deep-security-review-of-a-pr)
   - [Supply Chain Audit Before a Release](#3-supply-chain-audit-before-a-release)
   - [Configuring Rule Severity and Exclusions](#4-configuring-rule-severity-and-exclusions)
   - [Suppressing False Positives](#5-suppressing-false-positives)
   - [Threat Modeling a New Feature](#6-threat-modeling-a-new-feature)
   - [Setting Up CI Security Gates](#7-setting-up-ci-security-gates)
   - [Responding to a Security Finding](#8-responding-to-a-security-finding)
6. [CI Integration for Security Gates](#ci-integration-for-security-gates)
7. [Rule Reference](#rule-reference)
8. [Improving Your Security Posture Over Time](#improving-your-security-posture-over-time)
9. [Quick Reference Card](#quick-reference-card)
10. [FAQ](#faq)

---

## What Is Harness Engineering?

Harness Engineering is a toolkit that makes AI coding agents reliable through **mechanical enforcement**. Instead of relying on prompts, conventions, and hope, harness encodes your project's architectural decisions, quality standards, and security requirements as machine-checkable constraints. Every rule is validated on every change.

For security, this means:

- **Mechanical security scanning** that catches secrets, injection, XSS, weak crypto, and more -- pattern-based, deterministic, every time
- **AI-powered deep security review** that runs OWASP/CWE-focused threat modeling as part of the code review pipeline
- **Supply chain auditing** that evaluates dependency risk across 6 factors before you ship
- **51+ security knowledge skills** covering threat modeling, cryptography, auth/authz, data protection, OWASP Top 10, and incident response
- **Configurable rule severity, suppressions, and exclusions** so you control signal-to-noise ratio

Harness operates through **slash commands** (e.g., `/harness:security-scan`) in your AI coding tool (Claude Code, Gemini CLI, Cursor), **CLI skills** invoked via `harness skill run <name>`, and **CLI commands** for scripts and CI pipelines.

> **Slash commands vs. skills:** Not every skill has a registered slash command. Core workflow skills (security-scan, code-review, supply-chain-audit, etc.) are slash commands you can type directly. Domain-specific security skills (threat modeling, crypto analysis, etc.) are invoked via `harness skill run <name>` or by asking your AI agent to run them. Both work the same way -- the difference is just how you invoke them.

---

## Why Security Engineers Should Care

| Traditional AppSec Pain Point                        | How Harness Solves It                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "Secrets keep leaking into commits"                  | `harness check-security` mechanically detects API keys, tokens, and passwords via SEC-SEC-\* rules -- in CI and locally                      |
| "Security review is a bottleneck before release"     | `/harness:code-review --deep` runs parallel AI agents for security, compliance, bugs, and architecture simultaneously                        |
| "We only find injection bugs in pen tests"           | SEC-INJ-\* rules catch SQL injection, command injection, and eval/Function usage on every change, not once a quarter                         |
| "Nobody checks our dependencies for risk"            | `/harness:supply-chain-audit` evaluates maintainer concentration, CVEs, maintenance status, install scripts, and transitive depth            |
| "Developers suppress warnings without justification" | `harness-ignore` syntax requires a justification string after the colon -- no reason, no suppression                                         |
| "We don't know which CWEs apply to our stack"        | Stack auto-detection (package.json, go.mod, etc.) activates stack-specific rules: prototype pollution for Node.js, ReDoS, Express, React, Go |
| "Threat modeling only happens for big features"      | 51+ security knowledge skills make threat modeling (STRIDE, attack trees) fast enough for any feature                                        |
| "Security findings lack actionable context"          | Every finding includes CWE ID, OWASP category, confidence level, file:line, and specific remediation steps                                   |
| "SAST tools are noisy and hard to configure"         | Per-rule severity overrides, wildcard patterns (e.g., `"SEC-INJ-*": "off"`), and file exclusions let you tune signal precisely               |

---

## Getting Started (5 Minutes)

### Prerequisites

- Node.js 22+
- An AI coding agent: Claude Code, Gemini CLI, or Cursor
- Git

### Install

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and configures slash commands, MCP server, and agent personas for your detected AI clients. After this, `/harness:*` commands are available in every conversation.

### Run Your First Security Scan

```bash
harness check-security
```

This scans your entire project against all 11 rule categories, auto-detects your stack, and reports findings grouped by severity. It takes seconds on most projects.

For a quick pulse on just the files you changed:

```bash
harness check-security --changed-only
```

### Build the Knowledge Graph

The knowledge graph powers impact analysis, blast radius estimation, and dependency mapping:

```bash
harness scan
```

This builds a structural graph from your code, git history, and documentation. It enables features like "if I change this auth module, what else is affected?" -- critical for security impact assessment.

---

## The Security Toolkit at a Glance

### Mechanical Scanning

| Tool                                         | What It Does                                      | When to Use                                 |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `harness check-security`                     | Pattern-based detection across 11 rule categories | CI gates, local scans, scheduled sweeps     |
| `harness check-security --changed-only`      | Scans only changed files                          | Pre-push hook, fast CI feedback             |
| `harness check-security --severity critical` | Filters by severity threshold                     | Triaging -- show only what matters now      |
| `harness check-security --json`              | Machine-readable output                           | CI integration, dashboards, reporting       |
| `run_security_scan` (MCP tool)               | Programmatic scanning from AI agents              | Agent-driven workflows, automated pipelines |

### AI-Powered Review

| Tool                            | What It Does                                                       | When to Use                     |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| `/harness:security-scan`        | Lightweight mechanical security scan via slash command             | Quick triage during development |
| `/harness:code-review --deep`   | Full code review pipeline with security threat modeling            | PR review with OWASP/CWE focus  |
| `harness-security-review` skill | 4-phase deep security review (SCAN, REVIEW, THREAT-MODEL, REPORT)  | Dedicated security assessments  |
| Security-reviewer persona       | Triggers on PRs and manual invocation with security-focused skills | Automated PR security analysis  |

### Supply Chain Security

| Tool                          | What It Does                         | When to Use                               |
| ----------------------------- | ------------------------------------ | ----------------------------------------- |
| `/harness:supply-chain-audit` | 6-factor dependency risk evaluation  | Before releases, after dependency updates |
| Lockfile analysis             | Audits npm, pnpm, and yarn lockfiles | Detecting unexpected dependency changes   |

### Security Knowledge Skills (51+)

| Category          | Skills Include                                        | When to Use                                    |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Threat modeling   | STRIDE analysis, attack trees, threat matrices        | New features, architecture changes             |
| Cryptography      | Symmetric, asymmetric, hashing, HMAC, randomness      | Crypto implementation review                   |
| Auth/AuthZ        | RBAC, ABAC, ReBAC, MFA, zero trust                    | Authentication and authorization design        |
| Data protection   | Secrets lifecycle, vault integration, TLS, mTLS, HSTS | Data handling review, infrastructure hardening |
| OWASP Top 10      | 12 implementation skills across all OWASP categories  | Targeted vulnerability prevention              |
| Incident response | Forensics, compliance logging, incident workflows     | Post-incident analysis, audit preparation      |

---

## Day-to-Day Security Workflows

### 1. Running a Quick Security Scan

**The old way:** Run a SAST tool, wait for thousands of findings, spend hours triaging noise.

**The harness way:**

```bash
harness check-security
```

This runs a **mechanical scan** across 11 rule categories:

| Category          | Rule Prefix | What It Catches                                                  |
| ----------------- | ----------- | ---------------------------------------------------------------- |
| Secrets           | SEC-SEC-\*  | API keys, tokens, passwords, credentials in code                 |
| Injection         | SEC-INJ-\*  | SQL injection, command injection, eval/Function                  |
| XSS               | SEC-XSS-\*  | innerHTML, dangerouslySetInnerHTML, document.write               |
| Cryptography      | SEC-CRY-\*  | Weak hashing (MD5/SHA1), hardcoded keys, insecure random         |
| Network           | SEC-NET-\*  | CORS wildcards, disabled TLS verification, hardcoded HTTP        |
| Path traversal    | SEC-PTH-\*  | Directory traversal in file operations                           |
| Deserialization   | SEC-DES-\*  | Unsafe deserialization of untrusted data                         |
| Agent config      | SEC-AGT-\*  | Unicode detection, wildcard permissions, auto-approve risks      |
| MCP               | SEC-MCP-\*  | Hardcoded secrets in MCP servers, shell injection, typosquatting |
| Insecure defaults | SEC-DEF-\*  | Debug mode in production, permissive CORS, verbose errors        |
| Sharp edges       | SEC-SHP-\*  | Footgun patterns that are technically valid but dangerous        |

**Stack-specific rules** activate automatically based on your project:

| Stack   | Detected Via              | Additional Rules                               |
| ------- | ------------------------- | ---------------------------------------------- |
| Node.js | `package.json`            | Prototype pollution, ReDoS                     |
| Express | `express` in dependencies | Session misconfiguration, helmet absence       |
| React   | `react` in dependencies   | dangerouslySetInnerHTML, XSS in JSX            |
| Go      | `go.mod`                  | Unsafe pointer usage, SQL string concatenation |

**Common options:**

```bash
# Scan only changed files (fastest -- ideal for pre-push)
harness check-security --changed-only

# Show only critical and high severity
harness check-security --severity high

# Machine-readable output for CI
harness check-security --json

# Combine for CI gates
harness check-security --changed-only --severity critical --json
```

---

### 2. Deep Security Review of a PR

**The old way:** Manually read the diff, check for OWASP Top 10, hope you catch everything.

**The harness way:**

```
/harness:code-review --deep
```

This runs the full **7-phase code review pipeline** with security threat modeling enabled:

1. **GATE** -- Checks if the PR is eligible for review
2. **MECHANICAL** -- Runs lint, typecheck, tests, security scan. If any fail, it reports and stops.
3. **CONTEXT** -- Assembles context per review domain at a 1:1 ratio (200-line diff = ~200 lines of surrounding context)
4. **FAN-OUT** -- Dispatches parallel review agents including the **security agent**
5. **VALIDATE** -- Filters out duplicates and mechanical-only issues
6. **DEDUP+MERGE** -- Groups findings, assigns severity
7. **OUTPUT** -- Delivers a structured report

The **security agent** (security-agent.ts) checks for:

- Input validation gaps
- Authorization bypass
- Data exposure
- Authentication weaknesses
- Insecure defaults

Every finding includes **CWE ID**, **OWASP category**, **confidence level**, **file:line**, and **specific remediation**.

For a **dedicated deep security review** outside the code review pipeline:

```bash
harness skill run harness-security-review
```

This runs 4 focused phases:

| Phase            | What It Does                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SCAN**         | Mechanical pattern-based detection across all rule categories                                                                                                                              |
| **REVIEW**       | AI-driven analysis of scan results with OWASP baseline coverage                                                                                                                            |
| **THREAT-MODEL** | Structured threat modeling against Injection (CWE-89/78/79), Broken Auth (CWE-287), Sensitive Data Exposure (CWE-200), Broken Access Control (CWE-862), Security Misconfiguration (CWE-16) |
| **REPORT**       | Consolidated report with findings, severity, CWE mapping, and remediation                                                                                                                  |

The review is **stack-adaptive** -- it adjusts its checks based on your detected stack and analyzes insecure defaults specific to your frameworks.

**Rigor levels for code review:**

- `--fast` -- Quick pass for low-risk PRs
- (default) -- Standard review
- `--thorough` -- Full roster with meta-judge for high-risk changes
- `--deep` -- Adds security threat modeling (recommended for security-sensitive PRs)

---

### 3. Supply Chain Audit Before a Release

**The old way:** Run `npm audit`, get a wall of CVEs, ignore most of them.

**The harness way:**

```
/harness:supply-chain-audit
```

This evaluates every dependency across **6 risk factors**:

| Factor                   | What It Measures                                | Why It Matters                                          |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| Maintainer concentration | How many people can publish the package         | Bus factor, account takeover risk                       |
| Maintenance status       | Last publish date, commit activity, open issues | Abandoned packages don't get patches                    |
| Popularity               | Download counts, dependent packages             | Low-popularity packages get less scrutiny               |
| Install scripts          | Pre/post-install scripts in package.json        | Supply chain attack vector (event-stream, ua-parser-js) |
| Known CVEs               | Cross-reference against vulnerability databases | Direct known-risk exposure                              |
| Transitive depth         | How deep the dependency tree goes               | Deep trees amplify risk and attack surface              |

Each dependency receives a **risk score**: Critical, High, Medium, or Low.

**Lockfile analysis** supports npm (`package-lock.json`), pnpm (`pnpm-lock.yaml`), and yarn (`yarn.lock`).

**When to run:**

- Before every release
- After adding new dependencies
- After running `npm update` or equivalent
- On a scheduled cadence (weekly or monthly)

---

### 4. Configuring Rule Severity and Exclusions

The `harness.config.json` security block controls scanning behavior:

```json
{
  "security": {
    "enabled": true,
    "strict": true,
    "severityOverrides": {
      "SEC-SEC-001": "critical",
      "SEC-INJ-*": "error",
      "SEC-XSS-*": "warning",
      "SEC-SHP-*": "off"
    },
    "exclude": ["tests/**", "scripts/**", "**/*.test.ts", "**/*.spec.ts"]
  }
}
```

**Key options:**

| Option              | What It Does                                   | Default |
| ------------------- | ---------------------------------------------- | ------- |
| `enabled`           | Turns security scanning on/off                 | `true`  |
| `strict`            | Treats warnings as errors                      | `false` |
| `severityOverrides` | Override severity per rule or wildcard pattern | --      |
| `exclude`           | Glob patterns for files to skip                | --      |

**Severity override values:** `"critical"`, `"error"`, `"warning"`, `"info"`, `"off"`

**Wildcard support:** Use `*` in rule IDs to match entire categories. `"SEC-INJ-*": "off"` disables all injection rules. `"SEC-*": "warning"` downgrades everything to warning.

**External tool integration** (optional):

```json
{
  "security": {
    "tools": {
      "semgrep": { "enabled": true },
      "gitleaks": { "enabled": true }
    }
  }
}
```

When enabled, harness orchestrates semgrep and gitleaks alongside its own scanner and merges results into a unified report.

---

### 5. Suppressing False Positives

When the scanner flags something that is intentional or a false positive, suppress it at the line level:

```typescript
// harness-ignore SEC-SEC-003: Test fixture contains intentional dummy API key
const TEST_API_KEY = 'sk-test-1234567890abcdef';
```

**Suppression rules:**

| Rule                   | Detail                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Syntax                 | `// harness-ignore SEC-XXX-NNN: justification`                                             |
| Justification required | Yes -- the text after the colon is mandatory. No justification = suppression ignored.      |
| Scope                  | Line-level only. The suppression applies to the next line (or the current line if inline). |
| Multiple rules         | `// harness-ignore SEC-SEC-003, SEC-INJ-001: both are test fixtures`                       |

**Best practices for suppressions:**

- Always include a meaningful reason, not just "false positive"
- Reference a ticket or discussion when the justification is non-obvious
- Periodically audit suppressions -- they can mask real issues that emerge over time
- Prefer fixing the issue over suppressing it. Suppression is for when the pattern is genuinely safe.

**Bad:**

```typescript
// harness-ignore SEC-INJ-002: false positive
```

**Good:**

```typescript
// harness-ignore SEC-INJ-002: query uses parameterized prepared statement via knex.raw(), not string interpolation -- see SEC-2024-041
```

---

### 6. Threat Modeling a New Feature

**The old way:** Schedule a meeting, draw diagrams on a whiteboard, write a doc nobody reads, never revisit.

**The harness way:**

Ask your AI agent to run threat modeling skills:

```
Run the STRIDE threat modeling skill on the new payment processing feature.
```

Or invoke directly:

```bash
harness skill run harness-threat-modeling
```

Harness includes **51+ security knowledge skills** that cover:

**Threat modeling approaches:**

- **STRIDE** -- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
- **Attack trees** -- Hierarchical decomposition of attack goals into sub-goals and techniques
- **Threat matrices** -- Systematic mapping of threats to assets and controls

**Cryptography review:**

- Symmetric encryption (AES modes, key sizes)
- Asymmetric encryption (RSA, ECDSA, key management)
- Hashing (algorithm selection, salting, stretching)
- HMAC (message authentication, API signing)
- Randomness (CSPRNG usage, entropy sources)

**Auth/AuthZ design:**

- RBAC, ABAC, ReBAC implementation patterns
- MFA integration and bypass prevention
- Zero trust architecture
- Session management and token lifecycle

**Data protection:**

- Secrets lifecycle (generation, storage, rotation, revocation)
- Vault integration patterns
- TLS/mTLS configuration
- HSTS and transport security

**OWASP Top 10:**

12 dedicated implementation skills covering injection prevention, authentication hardening, sensitive data protection, XML external entities, broken access control, security misconfiguration, XSS prevention, insecure deserialization, vulnerable components, and insufficient logging.

---

### 7. Setting Up CI Security Gates

#### The All-in-One CI Check

```bash
harness ci check --json
```

This runs 9 checks including security. The security check blocks merge by default:

| Check          | What It Validates                                              | Blocks Merge?          |
| -------------- | -------------------------------------------------------------- | ---------------------- |
| `security`     | Secrets, injection, XSS, weak crypto, path traversal, and more | Yes (error)            |
| `validate`     | AGENTS.md structure, file integrity                            | Yes (error)            |
| `deps`         | Layer dependency boundaries                                    | Yes (error)            |
| `arch`         | Architecture constraints                                       | Yes (error)            |
| `docs`         | Documentation coverage                                         | Configurable (warning) |
| `entropy`      | Code drift, dead code                                          | Configurable (warning) |
| `perf`         | Complexity thresholds, coupling                                | Configurable (warning) |
| `phase-gate`   | Spec-to-implementation mapping                                 | Configurable           |
| `traceability` | Requirement-to-code mapping                                    | Configurable (warning) |

#### Security-Only CI Gate

For a dedicated security step in your pipeline:

```bash
harness check-security --changed-only --severity critical --json
```

This scans only changed files, reports only critical findings, and outputs JSON for programmatic consumption. Exit code 1 means findings were detected -- block the merge.

#### GitHub Actions Setup

```bash
harness ci init --platform github
```

Generates a `.github/workflows/harness.yml`. To add a dedicated security gate:

```yaml
- name: Security Gate
  run: harness check-security --changed-only --severity high --json
```

#### Stricter CI Configuration

```bash
# Fail on warnings too
harness ci check --fail-on warning

# Security scan with strict mode
harness check-security --severity warning

# Full project scan (not just changed files) for nightly builds
harness check-security --json
```

#### JSON Output for Reporting

```bash
# Get the security check summary
harness ci check --json | jq '.checks[] | select(.name == "security")'

# Count findings by severity
harness check-security --json | jq '.findings | group_by(.severity) | map({severity: .[0].severity, count: length})'

# List all critical findings with file locations
harness check-security --json | jq '[.findings[] | select(.severity == "critical") | {rule, file, line, message}]'
```

---

### 8. Responding to a Security Finding

When a scan surfaces a finding, here is the recommended workflow:

**Step 1: Understand the finding.**

Every finding includes a rule ID (e.g., SEC-INJ-002), severity, file:line location, description, and remediation guidance. Read the remediation first.

**Step 2: Assess the risk.**

Ask your AI agent for deeper context:

```
Explain the security implications of SEC-INJ-002 in src/api/users.ts at line 47. What is the attack scenario and what is the business impact?
```

**Step 3: Fix or suppress.**

If the finding is valid, fix it. Harness findings include specific remediation steps -- follow them.

If the finding is a false positive, suppress it with justification:

```typescript
// harness-ignore SEC-INJ-002: input is validated and sanitized by middleware on line 12 -- see auth-middleware.ts
```

**Step 4: Verify the fix.**

```bash
harness check-security --changed-only
```

Re-scan to confirm the finding is resolved and no new findings were introduced.

**Step 5: Run a deep review if the finding is critical.**

```bash
harness skill run harness-security-review
```

A critical finding in one file often indicates a pattern problem across the codebase. The deep review will check for the same class of vulnerability everywhere.

---

## CI Integration for Security Gates

### Recommended Pipeline Stages

```
1. harness check-security --changed-only --severity critical    # Fast gate (seconds)
2. harness ci check                                              # Full check suite
3. harness skill run harness-supply-chain-audit                  # Before release only
```

Stage 1 gives developers fast feedback. Stage 2 is the comprehensive gate. Stage 3 runs on release branches or on a schedule.

### Exit Codes

| Code | Meaning                     | Action                       |
| ---- | --------------------------- | ---------------------------- |
| `0`  | No findings above threshold | Proceed                      |
| `1`  | Findings detected           | Block merge, review findings |
| `2`  | Harness internal error      | Investigate                  |

### Security Persona in Automated Review

The **security-reviewer persona** (`agents/personas/security-reviewer.yaml`) can be configured to trigger automatically on PRs:

- Activates on pull request events and manual invocation
- Runs the `harness-security-review` and `harness-code-review` skills
- Posts findings as PR comments with CWE IDs and remediation

This means every PR gets a security review without a human bottleneck.

---

## Rule Reference

### Core Rule Categories

| Category          | Prefix     | Rule Count | Examples                                                                 |
| ----------------- | ---------- | ---------- | ------------------------------------------------------------------------ |
| Secrets           | SEC-SEC-\* | Multiple   | Hardcoded API keys, tokens, passwords, connection strings                |
| Injection         | SEC-INJ-\* | Multiple   | SQL injection, command injection, eval(), Function(), template injection |
| XSS               | SEC-XSS-\* | Multiple   | innerHTML, dangerouslySetInnerHTML, document.write, unsanitized output   |
| Cryptography      | SEC-CRY-\* | Multiple   | MD5/SHA1 for security, hardcoded crypto keys, Math.random() for security |
| Network           | SEC-NET-\* | Multiple   | CORS wildcard, disabled TLS verification, hardcoded HTTP URLs            |
| Path traversal    | SEC-PTH-\* | Multiple   | User input in file paths, directory traversal, path concatenation        |
| Deserialization   | SEC-DES-\* | Multiple   | Unsafe JSON.parse of untrusted input, pickle, yaml.load                  |
| Agent config      | SEC-AGT-\* | Multiple   | Unicode homoglyph detection, wildcard tool permissions, auto-approve     |
| MCP               | SEC-MCP-\* | Multiple   | Hardcoded secrets in MCP configs, shell injection, typosquatting         |
| Insecure defaults | SEC-DEF-\* | Multiple   | Debug mode enabled, verbose error messages, permissive CORS              |
| Sharp edges       | SEC-SHP-\* | Multiple   | Technically valid but dangerous patterns, footguns                       |

### Stack-Specific Rule Sets

| Stack   | Detected Via              | Key Rules                                                       |
| ------- | ------------------------- | --------------------------------------------------------------- |
| Node.js | `package.json`            | Prototype pollution via `__proto__`/constructor, ReDoS in regex |
| Express | `express` in dependencies | Missing helmet, insecure session config, CSRF gaps              |
| React   | `react` in dependencies   | dangerouslySetInnerHTML, XSS via JSX expressions                |
| Go      | `go.mod`                  | Unsafe pointer, SQL string concatenation, weak TLS config       |

### OWASP Baseline Coverage

The deep security review maps findings to OWASP categories:

| OWASP Category            | CWE IDs                | What Harness Checks                                               |
| ------------------------- | ---------------------- | ----------------------------------------------------------------- |
| Injection                 | CWE-89, CWE-78, CWE-79 | SQL injection, OS command injection, XSS                          |
| Broken Authentication     | CWE-287                | Weak credentials, session fixation, missing MFA                   |
| Sensitive Data Exposure   | CWE-200                | Plaintext secrets, missing encryption, verbose errors             |
| Broken Access Control     | CWE-862                | Missing authorization checks, IDOR, privilege escalation          |
| Security Misconfiguration | CWE-16                 | Debug mode, default credentials, permissive CORS, missing headers |

---

## Improving Your Security Posture Over Time

### Week 1: Foundation

- Install harness CLI and run `harness setup`
- Run `harness check-security` on your full codebase to establish a baseline
- Triage findings by severity: fix criticals immediately, plan highs for the sprint
- Add `harness check-security --changed-only` to your CI pipeline
- Configure `harness.config.json` with file exclusions for test fixtures and scripts

### Week 2: Review Process

- Start using `/harness:code-review --deep` for security-sensitive PRs
- Run `/harness:supply-chain-audit` to assess your dependency risk
- Set up the security-reviewer persona for automated PR review
- Configure severity overrides to tune out noise specific to your project

### Week 3: Depth

- Run `harness skill run harness-security-review` on your most critical modules (auth, payment, data access)
- Use threat modeling skills on your highest-risk features
- Review all existing `harness-ignore` suppressions for validity
- Enable external tool integration (semgrep, gitleaks) if available

### Week 4: Automation

- Set up nightly full-project security scans via `harness check-security --json`
- Configure supply chain audit to run on release branches
- Build a dashboard from JSON output to track findings over time
- Establish a suppression review cadence (monthly)

### Ongoing: Continuous Improvement

- Review new findings weekly -- patterns indicate systemic issues
- Update severity overrides as your threat model evolves
- Run supply chain audits after every dependency update
- Use `/harness:impact-analysis` before approving changes to security-critical modules
- Audit suppressions quarterly -- stale suppressions mask real risk

---

## Quick Reference Card

### "I need to..." --> Use this

| I Need To...                    | Command / Skill                                                    | Type            |
| ------------------------------- | ------------------------------------------------------------------ | --------------- |
| Scan for security issues (fast) | `harness check-security --changed-only`                            | CLI             |
| Scan the full project           | `harness check-security`                                           | CLI             |
| Quick scan from my AI agent     | `/harness:security-scan`                                           | Slash command   |
| Deep security review            | `harness skill run harness-security-review`                        | Domain skill    |
| Security-focused PR review      | `/harness:code-review --deep`                                      | Slash command   |
| Audit dependencies for risk     | `/harness:supply-chain-audit`                                      | Slash command   |
| Suppress a false positive       | `// harness-ignore SEC-XXX-NNN: reason`                            | Inline comment  |
| Configure rule severity         | `harness.config.json` security block                               | Configuration   |
| Threat model a feature          | `harness skill run harness-threat-modeling`                        | Domain skill    |
| Run all quality checks          | `harness ci check`                                                 | CLI             |
| Security gate in CI             | `harness check-security --changed-only --severity critical --json` | CLI             |
| Assess impact of a change       | `/harness:impact-analysis`                                         | Slash command   |
| Review crypto implementation    | Ask agent to run cryptography review skills                        | Knowledge skill |
| Design auth/authz               | Ask agent to run auth/authz design skills                          | Knowledge skill |
| Incident response               | Ask agent to run incident response skills                          | Knowledge skill |
| Scan programmatically           | `run_security_scan` MCP tool                                       | MCP tool        |

### Exit Codes for CI

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

---

## FAQ

### Do I need to be a developer to use harness for security?

No. The slash commands work in plain English through your AI coding tool. You describe what you want ("scan this PR for security issues", "audit our dependencies", "threat model the new auth flow") and the skill handles the technical execution. The CLI commands are also straightforward for CI integration.

### Does harness replace our existing SAST/DAST tools?

No. Harness **complements** your existing security tooling. It can optionally integrate with semgrep and gitleaks, and its mechanical scanner covers patterns those tools may miss (especially agent-config, MCP, and sharp-edge categories). Use harness alongside your existing tools for defense in depth.

### How does the mechanical scanner differ from the deep security review?

The **mechanical scanner** (`harness check-security`) is pattern-based, deterministic, and fast. It catches known-bad patterns (hardcoded secrets, eval with user input, innerHTML) but cannot reason about context or business logic.

The **deep security review** (`harness-security-review` skill) uses AI to analyze code semantics, trace data flows, assess authorization logic, and build threat models. It catches issues that require understanding intent -- like an endpoint that is missing authorization because the developer forgot, not because of a detectable pattern.

Use both. The scanner is your CI gate. The deep review is your thorough assessment.

### How does stack auto-detection work?

Harness looks for stack markers in your project root:

- `package.json` -- activates Node.js rules
- `express` in package.json dependencies -- activates Express rules
- `react` in package.json dependencies -- activates React rules
- `go.mod` -- activates Go rules

Detection is automatic. No configuration needed. Stack-specific rules run in addition to the core 11 categories.

### Can I add custom security rules?

Yes. The `harness.config.json` security block supports severity overrides, file exclusions, and external tool integration. For custom pattern rules, integrate semgrep with custom rulesets. Harness will merge semgrep results into its unified report.

### What if the scanner is too noisy for my project?

Tune it:

1. **Exclude test files:** Add `"tests/**"` and `"**/*.test.ts"` to the exclude list
2. **Downgrade categories:** Set `"SEC-SHP-*": "info"` to reduce sharp-edge noise
3. **Raise the threshold:** Use `--severity high` to see only high and critical findings
4. **Suppress intentional patterns:** Use `harness-ignore` with justification for known-safe code

Start strict and loosen as needed -- it is easier to reduce noise than to add coverage later.

### How does the supply chain audit differ from npm audit?

`npm audit` checks for known CVEs. The supply chain audit evaluates **6 risk factors** including maintainer concentration (single maintainer = higher risk), maintenance status (abandoned packages), install scripts (supply chain attack vector), and transitive depth (deep trees amplify risk). A dependency can have zero CVEs and still be high risk if it has one maintainer, hasn't been updated in two years, and runs a postinstall script.

### How do I integrate harness security checks into GitHub Actions?

```bash
harness ci init --platform github
```

This generates a workflow file. For a dedicated security gate, add:

```yaml
- name: Security Gate
  run: harness check-security --changed-only --severity high --json
```

The exit code (0/1/2) integrates with any CI platform. Use `harness ci init --platform github|gitlab|generic` to generate a ready-to-commit config file.

### Can penetration testers use harness?

Yes. Pen testers can use harness to:

- **Pre-engagement recon:** Run `harness check-security` to find low-hanging fruit before manual testing
- **Attack surface mapping:** Use `/harness:impact-analysis` and the knowledge graph to understand data flows and trust boundaries
- **Threat modeling:** Use STRIDE and attack tree skills to systematically enumerate attack scenarios
- **Finding validation:** Cross-reference manual findings against harness rules to check if they should have been caught mechanically
- **Remediation verification:** After fixes are applied, re-scan to confirm vulnerabilities are resolved

---

## Summary

Harness Engineering gives security engineers a **force multiplier**. Instead of being the bottleneck that reviews every PR, running SAST tools that produce thousands of unactionable findings, and discovering supply chain risks only after an incident:

1. **Gate every change mechanically** -- `harness check-security` catches secrets, injection, XSS, weak crypto, and more on every commit
2. **Deep-review what matters** -- `harness-security-review` runs AI-powered threat modeling with OWASP/CWE mapping on critical changes
3. **Know your supply chain risk** -- `/harness:supply-chain-audit` evaluates 6 factors beyond just CVEs
4. **Control signal-to-noise** -- Per-rule severity overrides, wildcard patterns, file exclusions, and justified suppressions
5. **Scale security review** -- The security-reviewer persona runs on every PR without human intervention
6. **Build security knowledge** -- 51+ skills covering threat modeling, cryptography, auth, data protection, OWASP Top 10, and incident response

The goal is not to do more security work. It is to **catch more, earlier, with less manual effort** -- and spend your time on the threats that require human judgment.
