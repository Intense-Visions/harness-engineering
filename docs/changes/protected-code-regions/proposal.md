# Protected Code Regions

## Overview

Agent-driven code modification skills (cleanup-dead-code, enforce-architecture, codebase-cleanup, refactoring) currently have no mechanism to preserve code regions that must not be modified. Performance-critical algorithms, compliance-required implementations, legally-sensitive code, and vendor-locked integrations can all be silently altered during automated cleanup and refactoring operations.

This proposal introduces a `harness-ignore` annotation system for block-level code protection. When an agent encounters a protected region, it skips that region entirely — no findings are generated, no fixes are applied, and an audit trail records the protection.

### Problem

1. **No opt-out for entropy cleanup.** Dead export detection, unused import removal, and commented-code cleanup operate on all code equally. A compliance-required function with zero importers gets flagged as dead code.
2. **Architecture enforcement can break vendor contracts.** Forbidden-import replacement may swap a legally-mandated SDK import for an alternative that violates licensing terms.
3. **Performance-critical code is only partially protected.** The `@perf-critical` annotation protects against nested-loop lint violations but not against entropy cleanup or refactoring.
4. **Existing `harness-ignore` is security-only.** The security scanner supports `// harness-ignore SEC-XXX-NNN: reason` but this pattern is not recognized by entropy or architecture subsystems.

### Goals

- Provide block-level and line-level protection annotations recognized by all code-modifying subsystems.
- Extend the existing `harness-ignore` syntax for consistency rather than inventing a new annotation.
- Maintain audit visibility — protected regions are reported but never modified.
- Support categorized protection reasons (compliance, performance, legal, vendor, custom).

### Non-Goals

- Runtime enforcement (this is a static analysis / agent-time feature).
- Protection of non-source files (package.json, config files).
- Integration with external compliance systems.

## Decisions

| Decision           | Choice                                         | Rationale                                                               |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Annotation syntax  | Extend `harness-ignore`                        | Already established for security; consistent UX                         |
| Parser location    | `packages/core/src/annotations/`               | Shared across security, entropy, architecture                           |
| Integration point  | Detection-time filtering                       | Prevents findings from being generated, not just suppressed at fix time |
| Protected findings | Report as informational with `protected: true` | Audit visibility without modification risk                              |
| Scope categories   | `entropy`, `architecture`, `security`, `all`   | Granular control; `all` is the default                                  |

## Technical Design

### Annotation Syntax

**Line-level protection** (protects the next non-comment line):

```typescript
// harness-ignore entropy: SOX audit — approved algorithm
export function calculateCompliance() { ... }
```

**Block-level protection** (protects all lines between start/end markers):

```typescript
// harness-ignore-start entropy: vendor-locked integration
import { SpecificSDK } from '@vendor/sdk';

export function vendorIntegration() {
  return SpecificSDK.process();
}
// harness-ignore-end
```

**Multi-scope protection:**

```typescript
// harness-ignore-start entropy,architecture: legally required implementation
// ... protected code ...
// harness-ignore-end
```

**Protect everything (default when no scope specified):**

```typescript
// harness-ignore-start: compliance-critical section
// ... protected from all agent modifications ...
// harness-ignore-end
```

### Data Model

```typescript
/** Scope categories for protection */
type ProtectionScope = 'entropy' | 'architecture' | 'security' | 'all';

/** A single protected region in a file */
interface ProtectedRegion {
  file: string;
  startLine: number; // 1-indexed, inclusive
  endLine: number; // 1-indexed, inclusive (same as startLine for line-level)
  scopes: ProtectionScope[];
  reason: string | null;
  type: 'line' | 'block';
}

/** Result of scanning a file for protected regions */
interface ProtectedRegionMap {
  regions: ProtectedRegion[];
  /** Check if a specific file:line is protected for a given scope */
  isProtected(file: string, line: number, scope: ProtectionScope): boolean;
  /** Get all regions for a file */
  getRegions(file: string): ProtectedRegion[];
}

/** Validation issues found in annotations */
interface AnnotationIssue {
  file: string;
  line: number;
  type: 'unclosed-block' | 'orphaned-end' | 'missing-reason' | 'unknown-scope';
  message: string;
}
```

### Parser — `packages/core/src/annotations/protected-regions.ts`

The parser scans source files for `harness-ignore` annotations and builds a `ProtectedRegionMap`:

1. **Line scan:** Read file line-by-line, match against annotation patterns.
2. **Block tracking:** Maintain a stack for open `harness-ignore-start` markers. When `harness-ignore-end` is encountered, pop and create a region.
3. **Line-level:** When `harness-ignore <scope>` is found without `-start`, protect the next non-comment, non-blank line.
4. **Validation:** Report unclosed blocks, orphaned ends, unknown scopes.

Regex patterns:

```
Line:  /(?:\/\/|#)\s*harness-ignore(?:\s+([\w,]+))?(?::\s*(.+))?$/
Start: /(?:\/\/|#)\s*harness-ignore-start(?:\s+([\w,]+))?(?::\s*(.+))?$/
End:   /(?:\/\/|#)\s*harness-ignore-end\s*$/
```

### Integration Points

**1. Entropy Detectors** (`packages/core/src/entropy/detectors/dead-code.ts`):

- Before reporting a dead export, unused import, or dead file, check `regionMap.isProtected(file, line, 'entropy')`.
- If protected, skip the finding entirely (do not add to report).
- For dead files: check if any line in the file is protected; if so, skip.

**2. Entropy Fixers** (`packages/core/src/entropy/fixers/safe-fixes.ts`):

- Defense-in-depth: Even if a finding slips through detection, `applyFixes()` checks protection before applying.
- Protected fixes are added to `skipped[]` with reason `'protected-region'`.

**3. Cleanup Finding Classification** (`packages/core/src/entropy/fixers/cleanup-finding.ts`):

- New safety level interaction: protected findings override safety classification.
- If a finding falls in a protected region, set `safety: 'protected'` (new level).

**4. Security Scanner** (`packages/core/src/security/scanner.ts`):

- Already supports `harness-ignore SEC-XXX-NNN`. The new parser should be compatible but not break existing behavior.
- Security-scoped protection uses the existing per-rule mechanism; the new block-level syntax adds region support.

**5. Architecture Enforcement** (skill + ESLint plugin):

- ESLint rules check `isProtected()` before reporting violations.
- Skill-driven fixes respect region boundaries.

### Audit Command

`harness audit-protected` — Reports all protected regions across the project:

```
Protected Regions Report
========================
Found 12 protected regions in 8 files

src/compliance/sox.ts:15-42 [entropy] SOX audit — approved algorithm
src/vendor/sdk-bridge.ts:1-89 [all] vendor-locked integration
src/crypto/hmac.ts:23 [entropy,architecture] FIPS-certified implementation
...

Issues:
  src/old/legacy.ts:10 — unclosed harness-ignore-start block
```

### File Layout

```
packages/core/src/annotations/
  index.ts                    — Public API exports
  protected-regions.ts        — Parser + ProtectedRegionMap
  types.ts                    — ProtectionScope, ProtectedRegion, etc.

packages/core/tests/annotations/
  protected-regions.test.ts   — Parser tests

packages/cli/src/commands/
  audit-protected.ts          — CLI command for audit reporting
```

## Success Criteria

1. `// harness-ignore-start` / `// harness-ignore-end` blocks prevent all entropy findings within the block.
2. `// harness-ignore entropy:` line annotations prevent the next code line from entropy detection.
3. Dead file detection skips files that contain any protected region (conservative).
4. Fix application refuses to modify lines within protected regions (defense-in-depth).
5. `harness audit-protected` lists all protected regions with file, lines, scopes, and reasons.
6. Unclosed blocks and orphaned ends are reported as annotation validation issues.
7. Existing `harness-ignore SEC-XXX-NNN` behavior is not broken.
8. All new code has tests with >90% branch coverage.

## Implementation Order

1. **Phase 1 — Parser & Types:** Create `packages/core/src/annotations/` with the region parser, types, and tests.
2. **Phase 2 — Entropy Integration:** Wire parser into dead-code detectors and safe-fixes to skip protected regions.
3. **Phase 3 — Cleanup Finding Integration:** Add `'protected'` safety level and integrate with classification.
4. **Phase 4 — CLI Audit Command:** Add `harness audit-protected` command.
5. **Phase 5 — Validation:** End-to-end tests, `harness validate` passes.
