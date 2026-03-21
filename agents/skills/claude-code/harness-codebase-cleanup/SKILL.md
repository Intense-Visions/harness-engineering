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
