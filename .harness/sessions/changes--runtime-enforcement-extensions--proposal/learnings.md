## 2026-03-29 — Phase 1: New Security Rule Categories

- [skill:harness-execution] [outcome:success] All 8 tasks completed. 18 new rules added across 3 categories (secrets, agent-config, mcp).
- [skill:harness-execution] [outcome:gotcha] Plan's SEC-SEC-006 test value `sk-ant-api03-abcdef1234567890` was only 16 chars after prefix, but regex requires 20+. Had to extend test string to 20+ chars.
- [skill:harness-execution] [outcome:gotcha] Plan's SEC-SEC-009 regex was `gh[pousr]_` (5 chars in class) but correct GitHub PAT prefixes are ghp*, gho*, ghu*, ghs* (4 prefixes). Fixed to `gh[pous]_`. Test token strings also needed to be extended to 36+ chars after prefix.
- [skill:harness-execution] [outcome:gotcha] SEC-MCP-001 test used `"hunter2"` (7 chars) but pattern requires 8+ chars. Changed to `"hunter2pass"`.
- [skill:harness-execution] [outcome:decision] minimatch was already a dependency of packages/core (^10.2.4), no need to add it.
- [skill:harness-execution] [outcome:success] `scanContent` deliberately does NOT apply fileGlob filtering (backward compat). Only `scanFile` and its new `scanContentForFile` private method apply glob filtering.
- [skill:harness-execution] [outcome:success] All 67 original security tests pass without modification alongside 30 new tests (97 total). Full core suite: 1318 tests across 153 files.

## 2026-03-29 — Phase 2: Hook Scripts

- [skill:harness-execution] [outcome:success] All 8 tasks completed. 5 hook scripts, 1 profile model, 7 test files with 58 passing tests.
- [skill:harness-execution] [outcome:gotcha] Hook scripts use ESM (import) not CJS (require) because packages/cli/package.json has "type": "module". Plan was written with require() but scripts were adapted to ESM in Tasks 1-6.
- [skill:harness-execution] [outcome:decision] protect-config is the only security hook that blocks on empty/malformed stdin (exit 2). All other hooks fail-open (exit 0).
- [skill:harness-execution] [outcome:success] All hook script imports are node: stdlib only (node:fs, node:path, node:child_process). No external dependencies.

## 2026-03-29 — Phase 3: Hooks CLI Command

- [skill:harness-execution] [outcome:success] All 7 tasks completed. 4 source files created, 1 modified, 2 test files created. 21 tests passing (17 unit + 4 integration).
- [skill:harness-execution] [outcome:gotcha] TypeScript does not narrow index-access types after `if (!obj[key])` guard. Required non-null assertion (`!`) on `hooks[script.event]!.push(...)` in buildSettingsHooks.
- [skill:harness-execution] [outcome:success] Plan code was accurate -- only the one TS narrowing fix was needed. All other code matched the plan exactly.
- [skill:harness-execution] [outcome:success] Prettier auto-formatted on commit (reformatted function signatures in init.ts) but no functional changes.
