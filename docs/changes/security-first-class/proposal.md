# Harness Security: Code Security as a First-Class Concern

**Date:** 2026-03-19
**Status:** Approved
**Keywords:** security, SAST, secrets, OWASP, scanner, vulnerability, injection, pre-commit, review, supply-chain

## Overview & Goals

**Problem:** Harness orchestrates AI code generation, and 45% of AI-generated code contains security vulnerabilities (Veracode 2025). Today, harness has no dedicated security checks — security surfaces only implicitly through AI-powered review heuristics. There are no mechanical security gates, no secret scanning, no SAST integration, and no security-focused persona.

**Goal:** Make security an inescapable, layered part of the harness development workflow:

1. A built-in mechanical scanner catches high-confidence vulnerabilities with zero external dependencies
2. Every code review automatically includes a security review phase
3. A dedicated security skill and persona exist for deep security audits
4. External tools (Semgrep, Gitleaks) are supported as power-ups for deeper coverage
5. All of this follows Principle 7: machine decides first, then AI reviews what patterns can't catch

**Out of scope:**

- Runtime security (WAF, RASP, runtime monitoring)
- Infrastructure security (IaC scanning, cloud misconfigurations)
- Penetration testing automation
- License compliance checking (related but separate concern)

## Decisions

| #   | Decision                                                                                      | Rationale                                                                                                      |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D1  | Phased layered approach: mechanical check → AI skill → external tools                         | Security is a layered problem; no single approach covers it                                                    |
| D2  | Built-in scanner with zero external dependencies                                              | Every harness project gets baseline security for free; external tools are optional power-ups                   |
| D3  | New `security` CI check (6th in pipeline)                                                     | Clean separation from existing checks; dedicated pass/fail status                                              |
| D4  | Security phase embedded in existing review skills (pre-commit-review, code-review, integrity) | Security is baked in, not bolted on — can't be forgotten or skipped                                            |
| D5  | Standalone `harness-security-review` skill for deep audits                                    | Available for pre-release, dependency upgrades, or high-risk changes                                           |
| D6  | Security persona: OWASP/CWE baseline + stack-adaptive rules                                   | Always checks OWASP Top 10 + CWE Top 25; layers stack-specific rules based on detected tech                    |
| D7  | `--deep` flag for threat-model-driven review                                                  | Lightweight threat model from codebase graph for high-stakes reviews                                           |
| D8  | Tiered severity defaults (error/warning/info by confidence)                                   | High-confidence rules always block; medium/low are configurable. `security.strict: true` promotes all to error |
| D9  | External tool adapter pattern (detect → delegate → merge)                                     | Semgrep/Gitleaks enhance coverage when present; built-in scanner handles the baseline                          |
| D10 | Rule registry organized by category + stack                                                   | Extensible; projects can add/override rules; stack detection auto-selects relevant rulesets                    |

## Technical Design

### Built-in Security Scanner (`packages/core/src/security/`)

```
packages/core/src/security/
├── scanner.ts              — Main scan orchestrator
├── config.ts               — Security config schema (extends harness.config.json)
├── types.ts                — SecurityRule, SecurityFinding, ScanResult types
├── external.ts             — Adapter for Semgrep/Gitleaks detection + delegation
├── stack-detector.ts       — Detects project tech stack from package.json, go.mod, etc.
├── rules/
│   ├── registry.ts         — Rule registry: loads, filters by category/stack
│   ├── secrets.ts          — Hardcoded API keys, tokens, passwords, private keys
│   ├── injection.ts        — SQL concat, eval, Function(), child_process.exec
│   ├── xss.ts              — innerHTML, dangerouslySetInnerHTML, unsanitized output
│   ├── crypto.ts           — Weak hashing (md5, sha1 for passwords), hardcoded keys
│   ├── path-traversal.ts   — ../ in fs operations, unsanitized file paths
│   ├── network.ts          — CORS *, http:// URLs, rejectUnauthorized: false
│   ├── deserialization.ts  — JSON.parse on untrusted input without validation
│   └── stack/
│       ├── node.ts         — Prototype pollution, NoSQL injection, unhandled promises
│       ├── react.ts        — Client-side storage of sensitive data, unsafe refs
│       ├── express.ts      — Missing helmet, missing rate limiting, CSRF
│       └── go.ts           — Race conditions, unsafe pointer, format string injection
```

### Key Types

```typescript
interface SecurityRule {
  id: string; // e.g. "SEC-INJ-001"
  name: string; // e.g. "SQL String Concatenation"
  category: SecurityCategory; // secrets | injection | xss | crypto | network | deserialization | path-traversal
  severity: 'error' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'low';
  pattern: RegExp | RegExp[]; // detection patterns
  fileGlob?: string; // limit to specific files
  stack?: string[]; // limit to specific tech stacks
  message: string; // human-readable explanation
  remediation: string; // how to fix
  references?: string[]; // CWE/OWASP links
}

interface SecurityFinding {
  rule: SecurityRule;
  file: string;
  line: number;
  column?: number;
  match: string; // matched text
  context: string; // surrounding lines
}

interface ScanResult {
  findings: SecurityFinding[];
  scannedFiles: number;
  rulesApplied: number;
  externalToolsUsed: string[]; // e.g. ["semgrep", "gitleaks"]
  coverage: 'baseline' | 'enhanced'; // baseline = built-in only
}
```

### Scanner Flow

1. Load security config from `harness.config.json`
2. Detect project stack (`stack-detector.ts`)
3. Build rule set: base rules + stack-specific rules
4. Apply severity overrides from config
5. If strict mode: promote all warnings to errors
6. Scan changed files (diff-aware) or full project
7. Check for external tools (Semgrep, Gitleaks)
8. If found: delegate, merge results, deduplicate
9. If not found: emit info-level nudge
10. Return `ScanResult` with tiered findings

### Configuration (`harness.config.json` extension)

```json
{
  "security": {
    "enabled": true,
    "strict": false,
    "rules": {
      "SEC-SEC-001": "off",
      "SEC-INJ-*": "error"
    },
    "exclude": ["**/*.test.ts", "**/fixtures/**"],
    "external": {
      "semgrep": { "enabled": "auto", "rulesets": ["p/owasp-top-ten"] },
      "gitleaks": { "enabled": "auto" }
    }
  }
}
```

`"auto"` means: use if installed, skip if not.

### CI Check Integration

In `packages/core/src/ci/check-orchestrator.ts`, add `security` as the 6th check:

```
validate → deps → docs → entropy → security → phase-gate
```

Security runs after entropy (benefits from knowing about dead code) and before phase-gate. Returns standard `CICheckResult` with `pass | fail | warn | skip`.

### Review Skill Enhancement

**`harness-pre-commit-review`** — Add a "Security Scan" step in the mechanical checks section. Run the built-in scanner on the diff. Report findings inline with other mechanical results. Block commit if any `error`-severity findings.

**`harness-code-review`** — Add a "Security Review" phase after the existing review phases. AI reviews the diff with security focus: OWASP baseline + stack-aware checks. Checks for semantic issues patterns can't catch (e.g., user input flowing through multiple functions to a sink). Findings added to the review checklist.

**`harness-integrity`** — Security findings are already treated as blocking; ensure the mechanical scanner runs as part of the verification step.

### Standalone Security Skill

```yaml
# agents/skills/claude-code/harness-security-review/skill.yaml
name: harness-security-review
version: '1.0.0'
description: Deep security audit with OWASP baseline and stack-adaptive analysis
cognitive_mode: meticulous-implementer
triggers:
  - manual
  - on_pr
platforms:
  - claude-code
  - gemini-cli
type: rigid
phases:
  - name: scan
    description: Run mechanical security scanner
    required: true
  - name: review
    description: AI-powered security review (OWASP + stack-adaptive)
    required: true
  - name: threat-model
    description: Lightweight threat model from codebase graph
    required: false
  - name: report
    description: Generate findings report with remediation guidance
    required: true
```

### Security Persona

```yaml
# agents/personas/security-reviewer.yaml
version: 1
name: security-reviewer
description: Security-focused code reviewer with OWASP/CWE expertise
role: Identifies security vulnerabilities, enforces secure coding patterns
skills:
  - harness-security-review
  - harness-code-review
commands:
  - security-scan
  - security-review
triggers:
  - event: on_pr
    conditions:
      paths: ['src/**', 'packages/**']
  - event: manual
config:
  severity: error
  autoFix: false
  timeout: 120000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

### MCP Tool

New tool in `packages/mcp-server/src/tools/security.ts`:

```typescript
// run_security_scan
{
  name: "run_security_scan",
  description: "Run security scanner on project or specific files",
  inputSchema: {
    rootDir: string,
    files?: string[],          // specific files, or scan all
    strict?: boolean,          // override strict mode
    includeExternal?: boolean  // force external tool usage
  }
}
```

### External Tool Adapter

`external.ts` follows a detect → delegate → merge pattern:

- `detectTool("semgrep")` → `which semgrep || npx semgrep --version`
  - If found: `runSemgrep(files, rulesets)` → parse SARIF output → map to `SecurityFinding[]`
  - If not found: emit nudge ("Install Semgrep for enhanced SAST coverage")
- `detectTool("gitleaks")` → `which gitleaks`
  - If found: `runGitleaks(files)` → parse JSON output → map to `SecurityFinding[]`
  - If not found: built-in secret patterns cover baseline

Results from external tools are merged with built-in findings, deduplicated by file+line+category.

## Success Criteria

| #   | Criterion                                                                    | Observable/Testable                                                                                                         |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| S1  | Every harness project gets security scanning with zero external dependencies | `harness ci check` includes `security` check on a fresh project with no Semgrep/Gitleaks installed                          |
| S2  | Hardcoded secrets in code block commits by default                           | A file containing `const API_KEY = "sk-live-abc123"` causes `security` check to return `fail`                               |
| S3  | High-confidence injection patterns block commits by default                  | `eval(userInput)`, `query("SELECT * FROM users WHERE id=" + id)` trigger `error`-severity findings                          |
| S4  | Stack-adaptive rules activate automatically                                  | A Node/Express project gets `SEC-NODE-*` rules; a React project gets `SEC-REACT-*` rules without manual config              |
| S5  | Every code review includes a security phase                                  | Running `harness-code-review`, `harness-pre-commit-review`, or `harness-integrity` produces security findings in the output |
| S6  | Standalone security skill produces actionable report                         | `/harness:security-review` runs scan + AI review and outputs findings with file, line, CWE reference, and remediation       |
| S7  | `--deep` flag produces a threat model                                        | `/harness:security-review --deep` generates entry points, trust boundaries, and data flow analysis from the graph           |
| S8  | External tools enhance coverage when present                                 | With Semgrep installed, `security` check reports `coverage: enhanced` and includes Semgrep findings                         |
| S9  | Missing external tools produce a nudge, not a failure                        | Without Semgrep, `security` check passes (if no built-in findings) with info-level message recommending installation        |
| S10 | Severity is configurable per-rule                                            | Setting `"SEC-NET-001": "off"` in `harness.config.json` suppresses that specific rule                                       |
| S11 | Strict mode promotes all warnings to errors                                  | `security.strict: true` causes medium-confidence findings to block                                                          |
| S12 | False positive rate on high-confidence rules is < 5%                         | Run scanner against 5+ real-world projects; high-confidence rules produce < 5% false positives                              |
| S13 | Security check completes in < 5 seconds for typical projects                 | Benchmarked on projects with < 500 source files using built-in scanner only                                                 |

## Implementation Order

### Phase 1: Core Scanner Engine

- `packages/core/src/security/types.ts` — Types and interfaces
- `packages/core/src/security/config.ts` — Config schema, Zod validation, defaults
- `packages/core/src/security/scanner.ts` — Scan orchestrator
- `packages/core/src/security/rules/registry.ts` — Rule loading and filtering
- `packages/core/src/security/stack-detector.ts` — Tech stack detection

### Phase 2: Built-in Rule Sets

- `rules/secrets.ts` — API keys, tokens, passwords, private keys
- `rules/injection.ts` — SQL concat, eval, Function, exec
- `rules/xss.ts` — innerHTML, dangerouslySetInnerHTML
- `rules/crypto.ts` — Weak hashing, hardcoded crypto keys
- `rules/path-traversal.ts` — ../ patterns in fs ops
- `rules/network.ts` — CORS \*, http://, disabled TLS
- `rules/deserialization.ts` — Unsafe JSON.parse

### Phase 3: Stack-Adaptive Rules

- `rules/stack/node.ts` — Prototype pollution, NoSQL injection
- `rules/stack/react.ts` — Client-side storage, unsafe refs
- `rules/stack/express.ts` — Missing helmet, CSRF
- `rules/stack/go.ts` — Race conditions, format string injection

### Phase 4: CI Check Integration

- Wire `security` into `check-orchestrator.ts` as 6th check
- Add security config section to `harness.config.json` schema
- Update CLI output formatter for security findings
- Update `harness init` to include security config defaults

### Phase 5: MCP Tool + External Adapter

- `packages/mcp-server/src/tools/security.ts` — `run_security_scan` tool
- `packages/core/src/security/external.ts` — Semgrep/Gitleaks detection, delegation, SARIF parsing, result merging

### Phase 6: Review Skill Enhancement

- Add security phase to `harness-pre-commit-review` SKILL.md
- Add security phase to `harness-code-review` SKILL.md
- Add security phase to `harness-integrity` SKILL.md
- Update skill.yaml files (phases, dependencies)

### Phase 7: Standalone Skill + Persona

- `agents/skills/claude-code/harness-security-review/` — skill.yaml + SKILL.md
- `agents/skills/gemini-cli/harness-security-review/` — Gemini CLI variant
- `agents/personas/security-reviewer.yaml` — Persona definition
- Wire `--deep` flag for threat-model phase using graph

### Phase 8: Documentation + Polish

- Update AGENTS.md knowledge map
- Add security section to docs/guides/getting-started.md
- Update docs/reference/cli.md with security check
- Update SECURITY.md with the new capabilities
