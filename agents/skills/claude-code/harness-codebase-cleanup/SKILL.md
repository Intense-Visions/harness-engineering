# Harness Codebase Cleanup

> Orchestrate dead code removal and architecture violation fixes with a shared convergence loop. Catches cross-concern cascades that individual skills miss.

## When to Use

- After a major refactoring or feature removal when both dead code and architecture violations are likely
- As a periodic comprehensive codebase hygiene task
- When `cleanup-dead-code` or `enforce-architecture` individually are not catching cascading issues
- When you want hotspot-aware safety classification
- NOT for quick single-concern checks -- use `cleanup-dead-code` or `enforce-architecture` directly
- NOT when tests are failing -- fix tests first
- NOT during active feature development

## Flags

| Flag                  | Effect                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `--fix`               | Enable convergence-based auto-fix (default: detect + report only) |
| `--dead-code-only`    | Skip architecture checks                                          |
| `--architecture-only` | Skip dead code checks                                             |
| `--dry-run`           | Show what would be fixed without applying                         |
| `--ci`                | Non-interactive: apply safe fixes only, report everything else    |

## Process

### Phase 1: CONTEXT -- Build Hotspot Map

1. **Run hotspot detection** via `harness skill run harness-hotspot-detector` or equivalent git log analysis:
   ```bash
   git log --format=format: --name-only --since="6 months ago" | sort | uniq -c | sort -rn | head -50
   ```
2. **Build churn map.** Parse output into a `file -> commit count` mapping.
3. **Compute top 10% threshold.** Sort all files by commit count. The file at the 90th percentile defines the threshold. Files above this threshold are "high churn."
4. **Store as HotspotContext** for use in Phase 3 (CLASSIFY).

### Phase 2: DETECT -- Run Both Concerns in Parallel

1. **Dead code detection** (skip if `--architecture-only`):
   - Run `harness cleanup --type dead-code --json`
   - Or use the `detect_entropy` MCP tool with `type: 'dead-code'`
   - Captures: dead files, dead exports, unused imports, dead internals, commented-out code blocks, orphaned dependencies

2. **Architecture detection** (skip if `--dead-code-only`):
   - Run `harness check-deps --json`
   - Captures: layer violations, forbidden imports, circular dependencies, import ordering issues

3. **Merge findings.** Convert all raw findings into `CleanupFinding` objects using `classifyFinding()`. This normalizes both concerns into a shared schema.

### Phase 3: CLASSIFY -- Safety Classification and Dedup

1. **Apply safety classification.** Each `CleanupFinding` already has a safety level from `classifyFinding()`. Review the classification rules:

   **Dead code safety:**

   | Finding                   | Safety        | Condition                                   |
   | ------------------------- | ------------- | ------------------------------------------- |
   | Dead files                | Safe          | Not entry point, no side effects            |
   | Unused imports            | Safe          | Zero references                             |
   | Dead exports (non-public) | Safe          | Zero importers, not in package entry point  |
   | Dead exports (public API) | Unsafe        | In package entry point or published package |
   | Commented-out code        | Safe          | Always (code is in git history)             |
   | Orphaned npm deps         | Probably safe | Needs install + test verification           |
   | Dead internals            | Unsafe        | Cannot reliably determine all callers       |

   **Architecture safety:**

   | Violation                           | Safety        | Condition                  |
   | ----------------------------------- | ------------- | -------------------------- |
   | Import ordering                     | Safe          | Mechanical reorder         |
   | Forbidden import (with alternative) | Probably safe | 1:1 replacement configured |
   | Forbidden import (no alternative)   | Unsafe        | Requires restructuring     |
   | Design token (unambiguous)          | Probably safe | Single token match         |
   | Design token (ambiguous)            | Unsafe        | Multiple candidates        |
   | Upward dependency                   | Unsafe        | Always                     |
   | Skip-layer dependency               | Unsafe        | Always                     |
   | Circular dependency                 | Unsafe        | Always                     |

2. **Apply hotspot downgrade.** For each finding, check if the file is in the top 10% by churn (from Phase 1 HotspotContext). If so, downgrade `safe` to `probably-safe`. Do not downgrade `unsafe` findings.

3. **Cross-concern dedup.** Call `deduplicateFindings()` to merge overlapping findings:
   - A dead import from a forbidden layer = one finding (dead-code concern, noting architecture overlap)
   - A dead file that has architecture violations = one finding (dead-code, noting violations resolved by deletion)

### Phase 4: FIX -- Convergence Loop

**Only runs when `--fix` flag is set.** Without `--fix`, skip to Phase 5 (REPORT).

```
findings = classified findings from Phase 3
previousCount = findings.length
iteration = 0

while iteration < 5:
  iteration++

  # Batch 1: Apply safe fixes silently
  safeFixes = findings.filter(f => f.safety === 'safe')
  apply(safeFixes)

  # Batch 2: Present probably-safe fixes
  if --ci mode:
    skip probably-safe fixes (report only)
  else:
    probablySafeFixes = findings.filter(f => f.safety === 'probably-safe')
    presentAsDiffs(probablySafeFixes)
    apply(approved fixes)

  # Verify: lint + typecheck + test
  verifyResult = run("pnpm lint && pnpm tsc --noEmit && pnpm test")

  if verifyResult.failed:
    revertBatch()
    reclassify failed fixes as unsafe
    continue

  # Re-detect both concerns
  newFindings = runDetection()  # Phase 2 again
  newFindings = classify(newFindings)  # Phase 3 again

  if newFindings.length >= previousCount:
    break  # No progress, stop

  previousCount = newFindings.length
  findings = newFindings
```

**Verification gate:** Every fix batch must pass lint + typecheck + test. If verification fails:

1. Revert the entire batch (use git: `git checkout -- .`)
2. Reclassify all findings in the batch as `unsafe`
3. Continue the loop with remaining findings

**Cross-concern cascade examples:**

- Dead import from forbidden layer: removing the dead import also resolves the architecture violation. Single fix, both resolved.
- Architecture fix creates dead code: replacing a forbidden import makes the old module's export dead. Next detect cycle catches it.
- Dead file resolves multiple violations: deleting a dead file that imports from wrong layers resolves those violations too.
