# Security Skill Deepening

**Date:** 2026-03-31
**Status:** Proposed
**Parent:** [ADR-001: Awesome Claude Code Integration Strategy](../../../.harness/architecture/awesome-claude-code-integration/ADR-001.md) — Wave 1, Trail of Bits adaptation
**Scope:** FP verification gate, insecure defaults detection, supply-chain audit skill, sharp-edges checks
**Keywords:** security, scanner, false-positive, suppression, insecure-defaults, fail-open, supply-chain, dependency-audit, sharp-edges, footgun, TOCTOU, Trail-of-Bits

## Overview & Goals

**Problem:** The SecurityScanner has four gaps identified in the ACE evaluation (ADR-001, items A3/A5/A6/A7):

1. **No suppression audit trail** — `// harness-ignore SEC-XXX` silently skips rules with no required justification. Suppressions may be legitimate or lazy; there is no way to tell.
2. **No fail-open detection** — Pattern scanning misses code that silently degrades to weak security defaults when configuration is missing (e.g., `process.env.JWT_SECRET || "default"`).
3. **No supply chain analysis** — No dependency risk evaluation beyond `npm audit` CVE checks that users run manually.
4. **No API footgun detection** — No checks for known dangerous API patterns (deprecated crypto APIs, unsafe deserialization, TOCTOU races, stringly-typed security).

**Goal:** Deepen harness's security layer with four capabilities adapted from Trail of Bits security skill patterns:

1. An FP verification gate requiring justification for every `harness-ignore` suppression
2. Insecure defaults / fail-open detection (mechanical rules + AI review guidance)
3. A new `harness:supply-chain-audit` skill with 6-factor dependency risk evaluation
4. Sharp-edges / API footgun checks as a new `SEC-EDGE-*` rule category

**Out of scope:**

- Runtime security monitoring
- External tool integration (Semgrep/Gitleaks — separate roadmap item)
- New prompt injection patterns (covered by sentinel)
- Container sandboxing (separate ADR-001 item)
- Semantic taint analysis / data flow tracking

**Assumptions:**

- Runtime: Node.js >= 18.x (LTS). The scanner and rule engine use Node.js built-in modules (`fs`, `path`) and TypeScript.
- All regex-based rules operate on a **single-line basis**. The scanner tests each pattern against individual lines. Patterns that span multiple lines (e.g., TOCTOU check-then-act across statements, multi-line catch blocks) will only match when the relevant tokens appear on the same line.
- Inline suppression comments (`harness-ignore`) are single-line only. Block comment suppressions spanning multiple lines are not supported.
- Supply-chain audit requires network access to npm registry and GitHub API. If either is unavailable, the corresponding risk factor is scored as "unknown" rather than blocking the audit.

## Decisions

| #   | Decision                                                                                                | Rationale                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | FP gate uses inline comment-parsing: `// harness-ignore SEC-XXX: <justification>`                       | Simplest approach; skeptical analysis confirmed "suppression requires a one-line justification comment" suffices. No new files or infrastructure.                                                                           |
| D2  | Insecure defaults uses layered detection: mechanical `SEC-DEF-*` rules + AI guidance in security-review | Follows existing Principle 7 (machine first, AI second). Mechanical catches `\|\| "default"` patterns; AI catches semantic fail-open that regex can't.                                                                      |
| D3  | Supply-chain audit uses Trail of Bits 6-factor model                                                    | Battle-tested factors, all mechanically checkable via npm registry + GitHub API. Factors: maintainer concentration, maintenance status, popularity signal, install scripts, known CVEs, transitive risk.                    |
| D4  | Sharp-edges checks cover 4 categories only                                                              | Roadmap explicitly says "narrowed to known dangerous patterns." Scope: deprecated crypto, unsafe deserialization, TOCTOU, stringly-typed security. Timing-safe comparisons and unvalidated redirects deferred to AI review. |
| D5  | Sharp-edges rules get a new `SEC-EDGE-*` category                                                       | Conceptually distinct from vulnerability categories — these are API misuse patterns. Dedicated category enables `"SEC-EDGE-*": "off"` bulk toggling.                                                                        |
| D6  | Scanner-first, skill-second delivery order                                                              | Scanner enhancements are low-risk, high-value, immediately improve every scan. Supply-chain skill has external API dependencies that benefit from focused attention.                                                        |

## Technical Design

### 1. FP Verification Gate

**Change to `scanner.ts`:** Replace the current suppression check:

```typescript
// Before (scanner.ts:81-82, scanner.ts:148-149):
if (line.includes('harness-ignore') && line.includes(rule.id)) continue;

// After:
const suppressionMatch = parseHarnessIgnore(line, rule.id);
if (suppressionMatch) {
  if (!suppressionMatch.justification) {
    findings.push({
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      severity: this.config.strict ? 'error' : 'warning',
      confidence: 'high',
      file: filePath,
      line: startLine + i,
      match: line.trim(),
      context: line,
      message: `Suppression of ${rule.id} requires justification: // harness-ignore ${rule.id}: <reason>`,
      remediation: `Add justification after colon: // harness-ignore ${rule.id}: false positive because ...`,
    });
  }
  continue; // Suppress the original rule either way (justification warning is separate)
}
```

**New helper in `scanner.ts`:**

```typescript
interface SuppressionMatch {
  ruleId: string;
  justification: string | null;
}

function parseHarnessIgnore(line: string, ruleId: string): SuppressionMatch | null {
  if (!line.includes('harness-ignore') || !line.includes(ruleId)) return null;

  // Match: // harness-ignore SEC-XXX-NNN: justification text
  // Also: # harness-ignore SEC-XXX-NNN: justification text (for non-JS files)
  const match = line.match(/(?:\/\/|#)\s*harness-ignore\s+(SEC-[A-Z]+-\d+)(?::\s*(.+))?/);
  if (!match || match[1] !== ruleId) return null;

  const justification = match[2]?.trim() || null;
  return {
    ruleId,
    justification: justification && justification.length > 0 ? justification : null,
  };
}
```

**Behavior:**

- Suppressions without justification emit a `warning`-severity finding (rule ID reused from suppressed rule)
- The original rule is still suppressed (suppression takes effect regardless)
- In strict mode, unjustified suppressions are `error` severity (checked directly via `this.config.strict` in the finding constructor, not via `resolveRuleSeverity`)
- Existing `// harness-ignore SEC-XXX` comments (no colon) trigger the warning, nudging migration

**Migration:** Existing suppressions continue to work — the original rule stays suppressed. The warning nudges teams to add justifications. In strict mode, unjustified suppressions block.

### 2. Insecure Defaults Rules (`SEC-DEF-*`)

**New file:** `packages/core/src/security/rules/insecure-defaults.ts`

```typescript
import type { SecurityRule } from '../types';

export const insecureDefaultsRules: SecurityRule[] = [
  {
    id: 'SEC-DEF-001',
    name: 'Security-Sensitive Fallback to Hardcoded Default',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      // env var fallback for security-sensitive names
      /(?:SECRET|KEY|TOKEN|PASSWORD|SALT|PEPPER|SIGNING|ENCRYPTION|AUTH|JWT|SESSION).*(?:\|\||\?\?)\s*['"][^'"]+['"]/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message:
      'Security-sensitive variable falls back to a hardcoded default when env var is missing',
    remediation:
      'Throw an error if the env var is missing instead of falling back to a default. Use a startup validation check.',
    references: ['CWE-1188'],
  },
  {
    id: 'SEC-DEF-002',
    name: 'TLS/SSL Disabled by Default',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:tls|ssl|https|secure)\s*(?:=|:)\s*(?:false|config\??\.\w+\s*(?:\?\?|&&|\|\|)\s*false)/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'Security feature defaults to disabled; missing configuration degrades to insecure mode',
    remediation:
      'Default security features to enabled (true). Require explicit opt-out, not opt-in.',
    references: ['CWE-1188'],
  },
  {
    id: 'SEC-DEF-003',
    name: 'Swallowed Authentication/Authorization Error',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'low',
    patterns: [
      // Matches single-line empty catch: catch(e) { } or catch(e) { // ignore }
      // Note: multi-line catch blocks are handled by AI review, not this rule
      /catch\s*\([^)]*\)\s*\{\s*(?:\/\/\s*(?:ignore|skip|noop|todo)\b.*)?\s*\}/,
    ],
    fileGlob: '**/*auth*.{ts,js,mjs,cjs},**/*session*.{ts,js,mjs,cjs},**/*token*.{ts,js,mjs,cjs}',
    message:
      'Single-line empty catch block in authentication/authorization code may silently allow unauthorized access. Note: multi-line empty catch blocks are detected by AI review, not this mechanical rule.',
    remediation:
      'Re-throw the error or return an explicit denial. Never silently swallow auth errors.',
    references: ['CWE-754', 'CWE-390'],
  },
  {
    id: 'SEC-DEF-004',
    name: 'Permissive CORS Fallback',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:origin|cors)\s*(?:=|:)\s*(?:config|options|env)\??\.\w+\s*(?:\?\?|\|\|)\s*['"]\*/,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'CORS origin falls back to wildcard (*) when configuration is missing',
    remediation:
      'Default to a restrictive origin list. Require explicit configuration for permissive CORS.',
    references: ['CWE-942'],
  },
  {
    id: 'SEC-DEF-005',
    name: 'Rate Limiting Disabled by Default',
    category: 'insecure-defaults',
    severity: 'info',
    confidence: 'low',
    patterns: [
      /(?:rateLimit|rateLimiting|throttle)\s*(?:=|:)\s*(?:config|options|env)\??\.\w+\s*(?:\?\?|\|\|)\s*(?:false|0|null|undefined)/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Rate limiting defaults to disabled when configuration is missing',
    remediation: 'Default to a sensible rate limit. Require explicit opt-out for disabling.',
    references: ['CWE-770'],
  },
];
```

**AI Review Guidance:** Add to `harness-security-review` SKILL.md Phase 2 (REVIEW) checklist:

> **Insecure Defaults Check:** For each configuration variable that controls a security feature (auth, encryption, TLS, CORS, rate limiting), verify:
>
> - Does the feature fail-closed (error/deny) when configuration is missing?
> - Or does it fail-open (degrade to permissive/disabled)?
> - Trace fallback chains: `config.x ?? env.Y ?? default` — is the final default secure?

### 3. Sharp-Edges Rules (`SEC-EDGE-*`)

**New file:** `packages/core/src/security/rules/sharp-edges.ts`

```typescript
import type { SecurityRule } from '../types';

export const sharpEdgesRules: SecurityRule[] = [
  // --- Deprecated Crypto APIs ---
  {
    id: 'SEC-EDGE-001',
    name: 'Deprecated createCipher API',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/crypto\.createCipher\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'crypto.createCipher is deprecated — uses weak key derivation (no IV)',
    remediation:
      'Use crypto.createCipheriv with a random IV and proper key derivation (scrypt/pbkdf2)',
    references: ['CWE-327'],
  },
  {
    id: 'SEC-EDGE-002',
    name: 'Deprecated createDecipher API',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/crypto\.createDecipher\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'crypto.createDecipher is deprecated — uses weak key derivation (no IV)',
    remediation: 'Use crypto.createDecipheriv with the same IV used for encryption',
    references: ['CWE-327'],
  },
  {
    id: 'SEC-EDGE-003',
    name: 'ECB Mode Selection',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'high',
    patterns: [/['"]-ecb['"]/],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'ECB mode does not provide semantic security — identical plaintext blocks produce identical ciphertext',
    remediation: 'Use CBC, CTR, or GCM mode instead of ECB',
    references: ['CWE-327'],
  },

  // --- Unsafe Deserialization ---
  {
    id: 'SEC-EDGE-004',
    name: 'yaml.load Without Safe Loader',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /yaml\.load\s*\(/, // Python: yaml.load() without SafeLoader
    ],
    fileGlob: '**/*.py',
    message: 'yaml.load() executes arbitrary Python objects — use yaml.safe_load() instead',
    remediation:
      'Replace yaml.load() with yaml.safe_load() or yaml.load(data, Loader=SafeLoader). Note: this rule will flag yaml.load(data, Loader=SafeLoader) — suppress with // harness-ignore SEC-EDGE-004: safe usage with SafeLoader',
    references: ['CWE-502'],
  },
  {
    id: 'SEC-EDGE-005',
    name: 'Pickle/Marshal Deserialization',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/pickle\.loads?\s*\(/, /marshal\.loads?\s*\(/],
    fileGlob: '**/*.py',
    message: 'pickle/marshal deserialization executes arbitrary code — never use on untrusted data',
    remediation: 'Use JSON, MessagePack, or Protocol Buffers for untrusted data serialization',
    references: ['CWE-502'],
  },

  // --- TOCTOU (Time-of-Check to Time-of-Use) ---
  {
    id: 'SEC-EDGE-006',
    name: 'Check-Then-Act File Operation',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:existsSync|accessSync|statSync)\s*\([^)]+\)[\s\S]{0,50}(?:readFileSync|writeFileSync|unlinkSync|mkdirSync)\s*\(/,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Check-then-act pattern on filesystem is vulnerable to TOCTOU race conditions',
    remediation:
      'Use the operation directly and handle ENOENT/EEXIST errors instead of checking first',
    references: ['CWE-367'],
  },
  {
    id: 'SEC-EDGE-007',
    name: 'Check-Then-Act File Operation (Async)',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'medium',
    patterns: [/(?:access|stat)\s*\([^)]+\)[\s\S]{0,80}(?:readFile|writeFile|unlink|mkdir)\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Async check-then-act pattern on filesystem is vulnerable to TOCTOU race conditions',
    remediation: 'Use the operation directly with try/catch instead of checking existence first',
    references: ['CWE-367'],
  },

  // --- Stringly-Typed Security ---
  {
    id: 'SEC-EDGE-008',
    name: 'JWT Algorithm "none"',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /algorithm[s]?\s*[:=]\s*\[?\s*['"]none['"]/i,
      /alg(?:orithm)?\s*[:=]\s*['"]none['"]/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'JWT "none" algorithm disables signature verification entirely',
    remediation:
      'Specify an explicit algorithm (e.g., "HS256", "RS256") and set algorithms allowlist in verify options',
    references: ['CWE-345'],
  },
  {
    id: 'SEC-EDGE-009',
    name: 'DES/RC4 Algorithm Selection',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/['"]\s*(?:des|des-ede|des-ede3|des3|rc4|rc2|blowfish)\s*['"]/i],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'Weak/deprecated cipher algorithm selected — DES, RC4, RC2, and Blowfish are broken or deprecated',
    remediation: 'Use AES-256-GCM or ChaCha20-Poly1305',
    references: ['CWE-327'],
  },
];
```

### 4. Supply-Chain Audit Skill

**New skill:** `agents/skills/claude-code/harness-supply-chain-audit/`

```yaml
# skill.yaml
name: harness-supply-chain-audit
version: '1.0.0'
description: 6-factor dependency risk evaluation for supply chain security
cognitive_mode: meticulous-implementer
triggers:
  - manual
  - on_milestone
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - WebFetch
type: rigid
tier: 2
phases:
  - name: inventory
    description: Build dependency inventory from lockfile
    required: true
  - name: evaluate
    description: Score each dependency on 6 risk factors
    required: true
  - name: report
    description: Generate risk report with actionable findings
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-security-scan
```

**SKILL.md process (summary):**

**Phase 1 — INVENTORY:**

- Parse `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` for direct and transitive dependencies
- Build dependency tree with depth information
- Identify direct vs transitive dependencies

**Phase 2 — EVALUATE:**
Score each direct dependency (and high-risk transitives) on 6 factors. Requires network access to npm registry and GitHub API. If npm registry returns 404 for a package, mark it as "unresolvable" and flag for manual review. If GitHub API rate limits are hit, use cached results or score commit activity as "unknown." If a package has no GitHub repo link, skip the maintenance-status factor and note it in the report.

| Factor                   | Signal                                              | Source                                            | Scoring                        |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| Maintainer concentration | Bus factor = 1                                      | npm registry `maintainers` field                  | High risk if sole maintainer   |
| Maintenance status       | Last publish > 12 months, no commits in 6 months    | npm registry `time` field, GitHub API             | High risk if stale             |
| Popularity signal        | Weekly downloads below 10th percentile for category | npm registry `downloads`                          | Medium risk if low             |
| Install scripts          | `preinstall`/`postinstall` in package.json          | Direct inspection of `package.json` scripts field | High risk if present           |
| Known CVEs               | Unpatched advisories                                | `npm audit --json` / `pnpm audit --json`          | Critical if high/critical CVEs |
| Transitive risk          | Dependency tree depth > 5, large subtree            | Lockfile analysis                                 | Medium risk if deep tree       |

**Phase 3 — REPORT:**

- Produce a risk summary table (dependency, risk score, top factors)
- Flag high-risk dependencies with specific remediation guidance
- Present findings as "flags for human review" — not verdicts
- Write report to stdout (not persisted unless user requests)

### 5. Type Changes

**Extend `SecurityCategory` in `types.ts`:**

```typescript
export type SecurityCategory =
  | 'secrets'
  | 'injection'
  | 'xss'
  | 'crypto'
  | 'network'
  | 'deserialization'
  | 'path-traversal'
  | 'agent-config'
  | 'mcp'
  | 'insecure-defaults' // NEW
  | 'sharp-edges'; // NEW
```

**New type for suppression tracking:**

```typescript
export interface SuppressionRecord {
  ruleId: string;
  file: string;
  line: number;
  justification: string | null;
}
```

### 6. Scanner Registration

**In `scanner.ts` constructor, add:**

```typescript
import { insecureDefaultsRules } from './rules/insecure-defaults';
import { sharpEdgesRules } from './rules/sharp-edges';

// In registerAll:
this.registry.registerAll([
  ...secretRules,
  ...injectionRules,
  ...xssRules,
  ...cryptoRules,
  ...pathTraversalRules,
  ...networkRules,
  ...deserializationRules,
  ...agentConfigRules,
  ...mcpRules,
  ...insecureDefaultsRules, // NEW
  ...sharpEdgesRules, // NEW
]);
```

### 7. AI Review Enhancement

Add the following to `harness-security-review` SKILL.md Phase 2 (REVIEW) checklist:

> **Insecure Defaults Analysis (AI):**
>
> - For each security-relevant configuration point, trace the fallback chain to its terminal value
> - Flag patterns where missing config degrades to permissive/disabled behavior
> - Check for error handlers that swallow auth/crypto failures
> - This complements mechanical `SEC-DEF-*` rules — focus on semantic patterns the regex cannot catch

> **Rationalizations to Reject** (adapted from Trail of Bits):
>
> - "The default is only used in development" — production deployments inherit defaults when config is missing
> - "The env var will always be set" — missing env vars are the #1 cause of fail-open in production
> - "The catch block will be filled in later" — empty auth catch blocks ship to production

## Success Criteria

| #   | Criterion                                           | Observable/Testable                                                                                                             |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Unjustified suppressions produce warnings           | `// harness-ignore SEC-INJ-001` (no colon) triggers a warning-severity finding about missing justification                      |
| S2  | Justified suppressions are clean                    | `// harness-ignore SEC-INJ-001: false positive in test fixture` produces no findings for that rule or for missing justification |
| S3  | Strict mode blocks unjustified suppressions         | With `security.strict: true`, an unjustified suppression produces an error-severity finding                                     |
| S4  | Existing suppressions keep working                  | `// harness-ignore SEC-XXX` still suppresses the original rule (warning about justification is separate)                        |
| S5  | `SEC-DEF-*` rules catch fail-open patterns          | `const secret = process.env.SECRET \|\| "default"` triggers SEC-DEF-001                                                         |
| S6  | `SEC-DEF-*` rules don't flag non-security fallbacks | `const color = config.theme ?? "blue"` does not trigger any SEC-DEF rule                                                        |
| S7  | `SEC-EDGE-*` rules catch deprecated crypto          | `crypto.createCipher("aes-128-cbc", key)` triggers SEC-EDGE-001                                                                 |
| S8  | `SEC-EDGE-*` rules catch TOCTOU                     | `if (existsSync(f)) readFileSync(f)` triggers SEC-EDGE-006                                                                      |
| S9  | `SEC-EDGE-*` rules catch JWT "none"                 | `algorithms: ["none"]` triggers SEC-EDGE-008                                                                                    |
| S10 | `SEC-EDGE-*` rules catch unsafe deserialization     | `yaml.load(data)` in .py files triggers SEC-EDGE-004                                                                            |
| S11 | Supply-chain audit produces 6-factor risk report    | Running `harness:supply-chain-audit` on a project with dependencies outputs a risk table with all 6 factors scored              |
| S12 | Supply-chain audit flags high-risk dependencies     | A dependency with a sole maintainer and no commits in 12 months scores "high risk"                                              |
| S13 | Supply-chain audit flags install scripts            | A dependency with `postinstall` script is flagged                                                                               |
| S14 | New rule categories are toggleable via config       | `"SEC-DEF-*": "off"` and `"SEC-EDGE-*": "off"` disable the respective categories                                                |
| S15 | Scanner performance stays under 5s                  | Adding 14 new rules (5 SEC-DEF + 9 SEC-EDGE) does not push scan time over the 5s budget for < 500 files                         |

## Implementation Order

### Phase 1: FP Verification Gate

- Add `parseHarnessIgnore` helper to `scanner.ts`
- Replace both suppression check sites (line 82 and line 149) with the new logic
- Add `SuppressionRecord` type to `types.ts`
- Add tests: justified suppression, unjustified suppression, strict mode promotion, migration from old format

### Phase 2: New Rule Categories + Type Changes

- Add `'insecure-defaults'` and `'sharp-edges'` to `SecurityCategory` union in `types.ts`
- Create `rules/insecure-defaults.ts` with 5 `SEC-DEF-*` rules
- Create `rules/sharp-edges.ts` with 9 `SEC-EDGE-*` rules
- Register both in `scanner.ts` constructor
- Export from `index.ts`
- Add tests for each rule with positive and negative cases (especially SEC-DEF non-security fallback exclusion)

### Phase 3: AI Review Enhancement

- Update `harness-security-review` SKILL.md with insecure defaults analysis checklist
- Add "Rationalizations to Reject" section adapted from Trail of Bits
- No code changes — skill enhancement only

### Phase 4: Supply-Chain Audit Skill

- Create `agents/skills/claude-code/harness-supply-chain-audit/skill.yaml`
- Create `agents/skills/claude-code/harness-supply-chain-audit/SKILL.md` with 3-phase process
- Implement lockfile parsing for npm/pnpm/yarn
- Implement 6-factor evaluation using npm registry + GitHub API
- Implement risk report generation
- Add to skill index and slash command generation
