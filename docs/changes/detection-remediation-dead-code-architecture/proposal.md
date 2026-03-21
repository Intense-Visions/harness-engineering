# Detection→Remediation for Dead Code & Architecture

**Date:** 2026-03-21
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Patterns 2, 4
**Scope:** Expand auto-fix for dead code and architecture violations; shared convergence loop
**Keywords:** dead-code, architecture, convergence-loop, auto-fix, entropy, hotspot, forbidden-import, orphaned-deps, import-ordering

## Overview

Expand auto-fix capabilities in `cleanup-dead-code` and `enforce-architecture`, then compose them in a new orchestrator (`harness-codebase-cleanup`) with a shared convergence loop that catches cross-concern cascades. Hotspot detection provides context for safety classification.

### Non-goals

- Auto-fixing structural architecture violations (upward deps, circular deps, skip-layer) — always require human judgment
- Replacing the existing `apply_fixes` MCP tool — it stays and gains new fix types
- Automated refactoring — this is cleanup, not restructuring

## Decisions

| Decision                     | Choice                                                                     | Rationale                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dead code auto-fix expansion | Dead exports (non-public), commented-out code, orphaned deps               | Zero-reference exports are provably dead; commented code is in git; orphaned deps verifiable with install+test |
| Architecture auto-fix        | Import ordering, forbidden import replacement, design token substitution   | Mechanical fixes verifiable by typecheck+test; structural violations stay manual                               |
| Convergence loop             | Shared across both concerns                                                | Dead code removal can resolve architecture violations and vice versa                                           |
| Orchestrator                 | New `harness-codebase-cleanup` skill                                       | Shared loop needs a home; individual skills keep standalone value                                              |
| Hotspot context              | Included for safety classification, not as a phase                         | Dead code in high-churn files is riskier; cheap context improves classification                                |
| Fix ownership                | Skills own their fixes; orchestrator owns the loop and cross-concern dedup | Existing `apply_fixes` already works standalone; can't remove that value                                       |

## Technical Design

### Orchestrator Pipeline

```
┌─────────────────────────────────────────────────────────┐
│ 1. CONTEXT                                               │
│    - Run hotspot detection (git log churn + co-change)   │
│    - Build churn map: file → commit count                │
│    - High-churn files (top 10%) get safety downgrade     │
├─────────────────────────────────────────────────────────┤
│ 2. DETECT (both concerns in parallel)                    │
│    - Dead code: detect_entropy --type dead-code          │
│    - Architecture: check_dependencies                    │
│    - Merge findings into shared context                  │
├─────────────────────────────────────────────────────────┤
│ 3. CLASSIFY                                              │
│    - Each finding → safe / probably-safe / unsafe         │
│    - Apply hotspot context: downgrade safety for          │
│      high-churn files                                    │
│    - Cross-concern dedup: if dead import is also an      │
│      architecture violation, single finding              │
├─────────────────────────────────────────────────────────┤
│ 4. FIX (convergence loop)                                │
│    - Apply safe fixes silently                           │
│    - Present probably-safe as diffs for approval          │
│    - Verify: lint + typecheck + test after each batch    │
│    - If verification fails: revert batch, reclassify     │
│      as unsafe                                           │
│    - Re-run DETECT (both concerns)                       │
│    - If issue count decreased: loop                      │
│    - If unchanged: stop, surface remaining               │
├─────────────────────────────────────────────────────────┤
│ 5. REPORT                                                │
│    - Fixes applied (with log)                            │
│    - Remaining findings requiring human action            │
│    - Per-finding: what's wrong, why it can't be          │
│      auto-fixed, suggested approach                      │
└─────────────────────────────────────────────────────────┘
```

### Expanded Auto-Fix: Dead Code

| Finding                                            | Fix Action                                                                                                      | Safety            | Verification                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------- |
| Dead files (existing)                              | Delete file, create backup                                                                                      | Safe              | lint + typecheck + test     |
| Unused imports (existing)                          | Remove import specifier/line                                                                                    | Safe              | lint + typecheck            |
| Dead exports (zero importers, not public API)      | Remove `export` keyword, keep function as internal; if function also has zero internal callers, delete entirely | Safe (non-public) | typecheck + test            |
| Dead exports (in public API / package entry point) | Surface to user                                                                                                 | Unsafe            | —                           |
| Commented-out code                                 | Delete commented block                                                                                          | Safe              | lint (cosmetic only)        |
| Orphaned npm deps                                  | Remove from package.json                                                                                        | Probably safe     | `pnpm install && pnpm test` |
| Dead internals (zero callers)                      | Surface to user                                                                                                 | Unsafe            | —                           |

**Hotspot downgrade:** If a file is in the top 10% by churn (commit count), all "safe" findings in that file are downgraded to "probably safe" (presented as diff for approval).

### Expanded Auto-Fix: Architecture

| Violation                                             | Fix Action                                          | Safety        | Verification     |
| ----------------------------------------------------- | --------------------------------------------------- | ------------- | ---------------- |
| Import ordering                                       | Reorder import statements to match layer convention | Safe          | lint + typecheck |
| Forbidden import (1:1 approved alternative in config) | Replace import path with approved alternative       | Probably safe | typecheck + test |
| Forbidden import (no configured alternative)          | Surface to user with suggestion                     | Unsafe        | —                |
| Design: hardcoded value (unambiguous token mapping)   | Replace literal with token reference                | Probably safe | typecheck + test |
| Design: hardcoded value (ambiguous mapping)           | Surface to user with candidates                     | Unsafe        | —                |
| Upward dependency                                     | Surface to user with refactoring options            | Unsafe        | —                |
| Skip-layer dependency                                 | Surface to user with routing suggestion             | Unsafe        | —                |
| Circular dependency                                   | Surface to user with extraction options             | Unsafe        | —                |

**Forbidden import replacement config:**

```jsonc
// harness.config.json
{
  "forbiddenImports": [
    {
      "pattern": "packages/cli/**",
      "forbidden": "../mcp-server",
      "alternative": null, // no auto-fix, must restructure
    },
    {
      "pattern": "packages/core/**",
      "forbidden": "node:fs",
      "alternative": "./utils/fs", // 1:1 replacement → auto-fixable
    },
  ],
}
```

Only forbidden imports with an `alternative` field get auto-fixed. Others are surfaced.

### Shared Finding Schema

```typescript
interface CleanupFinding {
  id: string;
  concern: 'dead-code' | 'architecture';
  file: string;
  line?: number;
  type: string; // e.g., 'dead-export', 'forbidden-import', 'circular-dep'
  description: string;
  safety: 'safe' | 'probably-safe' | 'unsafe';
  safetyReason: string; // why this classification
  hotspotDowngraded: boolean; // was safety downgraded due to churn?
  fixAction?: string; // what the auto-fix would do
  suggestion: string; // human-readable resolution guidance
}
```

### Cross-Concern Cascade Examples

The shared convergence loop catches these interactions:

1. **Dead import resolves architecture violation:** An unused import from a forbidden layer is detected as both dead code and an architecture violation. Removing the dead import also fixes the violation. Single fix, both findings resolved.

2. **Architecture fix creates dead code:** Replacing a forbidden import with an approved alternative makes the old module's export dead (if that was its only consumer). Next detect cycle catches the newly dead export.

3. **Dead file resolves multiple violations:** A dead file that imports from wrong layers contributes multiple architecture violations. Deleting the file resolves all of them.

### Standalone Skill Enhancements

Both skills gain their own single-concern convergence loop for standalone invocation:

**cleanup-dead-code standalone:**

- Detect → classify → fix safe → verify → re-detect → converge
- No architecture awareness, no hotspot context
- Uses existing `apply_fixes` MCP tool + new fix types

**enforce-architecture standalone:**

- Detect → classify → fix safe (import ordering, forbidden replacement) → verify → re-detect → converge
- No dead code awareness
- New: apply architecture fixes via SKILL.md instructions

When run through the orchestrator, the shared loop replaces the individual loops.

### Flags

| Flag                  | Effect                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `--fix`               | Enable convergence-based auto-fix (default: detect + report only) |
| `--dead-code-only`    | Skip architecture checks                                          |
| `--architecture-only` | Skip dead code checks                                             |
| `--dry-run`           | Show what would be fixed without applying                         |
| `--ci`                | Non-interactive: apply safe fixes only, report everything else    |

## Success Criteria

1. **Expanded dead code auto-fix works** — dead exports (non-public), commented-out code, and orphaned deps are auto-fixed with appropriate verification
2. **Architecture auto-fix works** — import ordering and forbidden import replacement (with configured alternative) are auto-fixed with typecheck+test verification
3. **Shared convergence loop catches cascades** — dead import removal that resolves an architecture violation is detected in a single cycle; architecture fix that creates dead code is caught in the next cycle
4. **Hotspot context improves safety** — findings in high-churn files (top 10%) are downgraded from safe to probably-safe
5. **Cross-concern dedup** — a dead import from a forbidden layer appears as one finding, not two
6. **Verification gates every fix** — lint+typecheck+test after each batch; failed fixes are reverted and reclassified as unsafe
7. **Unsafe violations are never auto-fixed** — upward deps, circular deps, skip-layer deps, public API removal, and dead internals always surface to user
8. **Standalone skills gain auto-fix** — `cleanup-dead-code` and `enforce-architecture` have their own convergence loops when run independently
9. **Orchestrator adds cross-concern value** — running both through the orchestrator produces better results than running each standalone
10. **Report is actionable** — remaining unsafe findings include what's wrong, why it can't be auto-fixed, and a suggested approach

## Implementation Order

1. **Dead code auto-fix expansion** — Add dead export removal, commented-out code removal, and orphaned dep removal to `cleanup-dead-code` SKILL.md and the `apply_fixes` MCP tool. Verify each new fix type independently.

2. **Architecture auto-fix** — Add import ordering and forbidden import replacement (with `alternative` config field) to `enforce-architecture` SKILL.md. Add design token substitution for unambiguous mappings.

3. **Standalone convergence loops** — Add single-concern convergence loops to both skills for standalone invocation. Verify they work independently.

4. **Orchestrator scaffold** — Create `harness-codebase-cleanup` with `skill.yaml` and `SKILL.md`. Define the 5 phases, shared finding schema, and flags.

5. **Hotspot context** — Implement churn map generation via git log. Wire safety downgrade logic for high-churn files.

6. **Shared convergence loop** — Implement the cross-concern detect→classify→fix→verify→re-detect loop. Wire up both skills' detectors and fixers. Implement cross-concern dedup.

7. **Cascade detection** — Test and verify the cross-concern cascade examples (dead import resolves architecture violation, architecture fix creates dead code, dead file resolves multiple violations).

8. **Report phase** — Implement the output: fixes applied, remaining findings with resolution guidance, per-finding safety classification and reasoning.
